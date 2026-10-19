#!/usr/bin/env bash
# Run the real-Audacity 3 foundation suite (A3-T1 to T13, T24 to T29, T34 of docs/research/audacity-3-capability-matrix.md) against a
# pinned Audacity on Linux: Xvfb, a PulseAudio null sink, mod-script-pipe. Writes results.json and summary.md next to the raw
# replies, screenshots and exported audio in $NU_AUDACITY_WORK/out (the CI artifact).
#
#   tests/audacity3/real/foundation/run.sh [go-test-run-regexp]        (default: every test)
#
# Needs: curl, sha256sum, python3, go, ffmpeg/ffprobe, Xvfb, PulseAudio (pulseaudio, pactl, paplay, parec), libasound2-plugins, xdotool,
# ImageMagick `import`. On Ubuntu 24.04: apt-get install xvfb pulseaudio pulseaudio-utils libasound2-plugins xdotool ffmpeg imagemagick.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
PATTERN="${1:-.}"

# Pinned. Bump the version and the hash together from the release page's asset (an AppImage's hash is the only identity it has).
AUDACITY_VERSION="${AUDACITY_VERSION:-3.7.7}"
AUDACITY_URL="${AUDACITY_URL:-https://github.com/audacity/audacity/releases/download/Audacity-${AUDACITY_VERSION}/audacity-linux-${AUDACITY_VERSION}-x64-22.04.AppImage}"
AUDACITY_SHA256="${AUDACITY_SHA256:-45c4445fb6670cc5fe40d31c7cea979724d2605bca53b554c32520acbf901ef0}"

WORK="${NU_AUDACITY_WORK:-${RUNNER_TEMP:-/tmp}/nu-audacity}"
DISPLAY_NUM="${NU_AUDACITY_DISPLAY:-99}"
SINK="nu_null"
FIXTURE_DIR="$REPO/tests/fixtures/audio/librivox-alice"
SOURCE_ID="kara_01" # Kara Shallenberg, Alice's Adventures in Wonderland, chapter I: LibriVox, public domain (sources.json)
mkdir -p "$WORK"/{bin,fixtures,out,logs}
export DISPLAY=":$DISPLAY_NUM"
PIDS=()

log() { printf '[real-audacity3] %s\n' "$*"; }

cleanup() {
	local pid
	for pid in "${PIDS[@]:-}"; do
		[ -n "$pid" ] && kill "$pid" 2>/dev/null || true
	done
	pkill -x audacity 2>/dev/null || true
	[ -n "${PULSE_STARTED:-}" ] && pulseaudio --kill 2>/dev/null || true
}
trap cleanup EXIT

install_audacity() {
	local image="$WORK/bin/audacity-$AUDACITY_VERSION.AppImage"
	if [ ! -f "$image" ] || ! echo "$AUDACITY_SHA256  $image" | sha256sum -c --status; then
		log "downloading Audacity $AUDACITY_VERSION"
		curl --fail --location --silent --show-error --retry 3 --max-time 600 -o "$image.part" "$AUDACITY_URL"
		echo "$AUDACITY_SHA256  $image.part" | sha256sum -c - || { log "the download is not the pinned AppImage"; exit 1; }
		mv "$image.part" "$image"
	fi
	chmod +x "$image"
	# Extracted, not run as an AppImage: no FUSE on a CI runner or in a container. The tree is never uploaded (GPLv3 redistribution).
	[ -x "$WORK/bin/squashfs-root/AppRun" ] || (cd "$WORK/bin" && "$image" --appimage-extract >/dev/null)
}

fetch_fixture() {
	log "fetching $SOURCE_ID (SHA-256 checked against sources.json)"
	python3 -I "$REPO/scripts/research/real-audacity3-ci/fetch_fixture.py" "$FIXTURE_DIR" "$WORK/fixtures" "$SOURCE_ID" >/dev/null
}

start_display() {
	pgrep -x Xvfb >/dev/null && return
	Xvfb ":$DISPLAY_NUM" -screen 0 1280x800x24 -ac -nolisten tcp >"$WORK/logs/xvfb.log" 2>&1 &
	PIDS+=("$!")
	sleep 1
}

# A PulseAudio null sink is paced like a sound card; ALSA's own `null` PCM is not (it recorded 3 s as 10,767 s).
start_audio() {
	if [ "$(id -u)" -eq 0 ]; then
		mkdir -p /run/pulse && chmod 755 /run/pulse
		pulseaudio --system --daemonize=yes --disallow-exit --exit-idle-time=-1 --disable-shm=yes -n \
			--log-target="file:$WORK/logs/pulse.log" \
			-L "module-native-protocol-unix auth-anonymous=1 socket=/run/pulse/native" \
			-L "module-null-sink sink_name=$SINK" -L "module-always-sink" >/dev/null 2>&1 || true
		export PULSE_SERVER="unix:/run/pulse/native"
	else
		pulseaudio --start --exit-idle-time=-1 --disable-shm=yes --log-target="file:$WORK/logs/pulse.log" || true
		pactl list short sinks | grep -q "$SINK" || pactl load-module module-null-sink sink_name="$SINK" >/dev/null
		pactl set-default-sink "$SINK"
		PULSE_STARTED=1
	fi
	pactl info | grep -E 'Default (Sink|Source)' | sed 's/^/[pulse] /'
}

install_audacity
fetch_fixture
start_display
start_audio
rm -rf "$WORK/out/results" "$WORK/out/golden"

status=0
(
	cd "$REPO/apps/desktop"
	NU_AUDACITY_WORK="$WORK" \
		NU_AUDACITY_APP="$WORK/bin/squashfs-root" \
		NU_AUDACITY_OUT="$WORK/out" \
		NU_AUDACITY_VERSION="$AUDACITY_VERSION" \
		NU_AUDACITY_FIXTURE="$WORK/fixtures/$SOURCE_ID.mp3" \
		NU_AUDACITY_MARKERS="$FIXTURE_DIR/alignment/$SOURCE_ID.markers.json" \
		NU_AUDACITY_SINK="$SINK" \
		NU_AUDACITY_GOLDEN_DIR="$HERE/golden" \
		go test -tags audacityreal -run "$PATTERN" -v -count=1 -timeout 28m ./internal/audacityreal/foundation/
) 2>&1 | tee "$WORK/out/go-test.log" || status=$?

python3 -I "$HERE/summarise.py" "$WORK/out" || true
log "artifacts in $WORK/out and $WORK/logs"
exit "$status"
