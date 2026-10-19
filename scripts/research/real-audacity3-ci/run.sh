#!/usr/bin/env bash
# Drive a real Audacity 3 over mod-script-pipe on Linux, headless, with the repo's own Go client and adapter.
#
#   scripts/research/real-audacity3-ci/run.sh [chapter|record|all|hold]     (default: all)
#
# What it does, in order: downloads the pinned Audacity AppImage and checks its SHA-256, fetches one pinned LibriVox chapter with the
# fixture's own checksum-verified download, starts Xvfb and a PulseAudio null sink, starts Audacity with mod-script-pipe enabled and
# its first-run dialogs switched off, then runs the audacityreal Go tests (apps/desktop/internal/dawport/audacity/real_linux_live_test.go).
# Findings and the CI design built on them: docs/research/real-audacity3-ci-integration.md.
#
# NU_AUDACITY_WITH_REPLY_PATCH is ignored: the blank-first-line reply bug it worked around is fixed in audacitybridge.
#
# Needs: curl, sha256sum, python3, go, ffmpeg, Xvfb, PulseAudio (pulseaudio, pactl, paplay), libasound2-plugins, xdotool, ImageMagick `import`
# (screenshots only). On Ubuntu 24.04: apt-get install xvfb pulseaudio pulseaudio-utils libasound2-plugins xdotool ffmpeg imagemagick.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MODE="${1:-all}"

# Pinned. Bump the version and the hash together, from the release page's asset, and re-run (an AppImage's hash is the only identity it has).
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
	# PulseAudio is left to the CI job's end; locally, stop what this script started.
	[ -n "${PULSE_STARTED:-}" ] && pulseaudio --kill 2>/dev/null || true
}
trap cleanup EXIT

warn_ignored_patch() {
	[ "${NU_AUDACITY_WITH_REPLY_PATCH:-}" = 1 ] && log "NU_AUDACITY_WITH_REPLY_PATCH is ignored: the client no longer needs the patch"
	return 0
}

install_audacity() {
	local image="$WORK/bin/audacity-$AUDACITY_VERSION.AppImage"
	if [ ! -f "$image" ] || ! echo "$AUDACITY_SHA256  $image" | sha256sum -c --status; then
		log "downloading Audacity $AUDACITY_VERSION"
		curl --fail --location --silent --show-error --retry 3 --max-time 600 -o "$image.part" "$AUDACITY_URL"
		echo "$AUDACITY_SHA256  $image.part" | sha256sum -c - || { log "the download is not the pinned AppImage"; exit 1; }
		mv "$image.part" "$image"
	fi
	chmod +x "$image"
	# Extracted, not run as an AppImage: no FUSE on a CI runner or in a container, and the module path in Audacity's config stays put.
	if [ ! -x "$WORK/bin/squashfs-root/AppRun" ]; then
		(cd "$WORK/bin" && "$image" --appimage-extract >/dev/null)
	fi
}

fetch_fixture() {
	log "fetching $SOURCE_ID (SHA-256 checked against sources.json)"
	python3 -I "$REPO/scripts/research/real-audacity3-ci/fetch_fixture.py" "$FIXTURE_DIR" "$WORK/fixtures" "$SOURCE_ID" >/dev/null
	# Four seconds of speech, 22 s in (the first paragraph starts at 22.36 s), as the loopback signal for the record test.
	ffmpeg -v error -y -ss 22.4 -t 4 -i "$WORK/fixtures/$SOURCE_ID.mp3" -ar 44100 -ac 2 "$WORK/fixtures/loopback.wav"
}

start_display() {
	pgrep -x Xvfb >/dev/null && return
	Xvfb ":$DISPLAY_NUM" -screen 0 1280x800x24 -ac -nolisten tcp >"$WORK/logs/xvfb.log" 2>&1 &
	PIDS+=("$!")
	sleep 1
}

# A PulseAudio null sink is paced by the clock like a sound card, so Audacity records in real time from its monitor. ALSA's own `null`
# PCM is not: it hands out samples as fast as they are read (3 s of wall time recorded 10,767 s).
start_audio() {
	if [ "$(id -u)" -eq 0 ]; then
		# A container as root: system mode drops to the `pulse` user the package creates.
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

# Audacity rewrites its configuration when it exits, so the seed is applied again before the second start. UpdateNoticeShown keeps the
# first-run "App updates / Usage info" dialog away: it is modal, and Import2 and friends wait behind it.
seed_config() {
	local cfg="$1/.config/audacity/audacity.cfg"
	grep -q '^UpdateNoticeShown=1$' "$cfg" 2>/dev/null || printf '[Update]\nDefaultUpdatesChecking=0\nUpdateNoticeShown=1\n' >>"$cfg"
	grep -q '^ShowSplashScreen=' "$cfg" 2>/dev/null || printf '[GUI]\nShowSplashScreen=0\n' >>"$cfg"
	grep -q '^TempDir=' "$cfg" 2>/dev/null || printf '[Directories]\nTempDir=%s\n' "$WORK/audacity-temp" >>"$cfg"
	grep -q '^mod-script-pipe=' "$cfg" 2>/dev/null || printf '[Module]\nmod-script-pipe=1\n' >>"$cfg"
	sed -i 's/^mod-script-pipe=[0-9]$/mod-script-pipe=1/' "$cfg"
}

# A fresh HOME per launch: Audacity keeps its configuration there, and an Audacity that was killed leaves a project behind that the
# next launch asks about in a modal "Automatic Crash Recovery" dialog, which holds every scripting command until someone clicks.
launch_audacity() {
	local home="$WORK/home" app="$WORK/bin/squashfs-root"
	pkill -x audacity 2>/dev/null || true
	sleep 1
	rm -f /tmp/audacity_script_pipe.to.* /tmp/audacity_script_pipe.from.*
	rm -rf "${home:?}" "$WORK/audacity-temp"
	mkdir -p "$home/.config/audacity" "$home/.local/share/applications" "$WORK/audacity-temp"
	# ALSA's default device is the PulseAudio one: Audacity's PortAudio reaches Pulse only through ALSA's `pulse` plugin.
	printf 'pcm.!default { type pulse }\nctl.!default { type pulse }\n' >"$home/.asoundrc"
	seed_config "$home"
	# On a profile Audacity has never seen it registers mod-script-pipe on its first start and records it as failed (status 4), whatever
	# the file said. Enabling it is therefore two starts: let it register the module, stop it, set the status, start it again.
	local attempt
	for attempt in 1 2; do
		(HOME="$home" setsid "$app/AppRun" >"$WORK/logs/audacity-$attempt.log" 2>&1) &
		PIDS+=("$!")
		local i
		for i in $(seq 1 30); do
			[ -p "/tmp/audacity_script_pipe.to.$(id -u)" ] && break 2
			grep -q '^mod-script-pipe=4$' "$home/.config/audacity/audacity.cfg" 2>/dev/null && break
			sleep 1
		done
		log "no scripting pipe on start $attempt after ${i} s: module status $(grep '^mod-script-pipe=[0-9]' "$home/.config/audacity/audacity.cfg" | head -1)"
		pkill -x audacity 2>/dev/null || true
		sleep 2
		seed_config "$home"
	done
	[ -p "/tmp/audacity_script_pipe.to.$(id -u)" ] || { log "no scripting pipe after two starts"; screenshot no-pipe; exit 1; }
	log "scripting pipe up after ${i} s (start $attempt)"
	sleep 3 # the pipe exists before the main window can answer
}

screenshot() { import -window root "$WORK/out/$1.png" 2>/dev/null || true; }

run_go() {
	local pattern="$1"
	(
		cd "$REPO/apps/desktop"
		NU_AUDACITY_OUT="$WORK/out" \
			NU_AUDACITY_FIXTURE="$WORK/fixtures/$SOURCE_ID.mp3" \
			NU_AUDACITY_MARKERS="$FIXTURE_DIR/alignment/$SOURCE_ID.markers.json" \
			NU_AUDACITY_LOOPBACK_WAV="$WORK/fixtures/loopback.wav" \
			NU_AUDACITY_SINK="$SINK" \
			go test -tags audacityreal -run "$pattern" -v -count=1 -timeout 5m ./internal/dawport/audacity/
	)
}

status=0
warn_ignored_patch
install_audacity
fetch_fixture
start_display
start_audio

if [ "$MODE" = hold ]; then
	launch_audacity
	log "Audacity is running; DISPLAY=$DISPLAY PULSE_SERVER=${PULSE_SERVER:-}; Ctrl-C or kill this script to stop"
	sleep "${NU_AUDACITY_HOLD_SECONDS:-1800}"
fi
if [ "$MODE" = chapter ] || [ "$MODE" = all ]; then
	launch_audacity
	run_go 'TestRealAudacityChapter' || status=1
	screenshot chapter-end
fi
if [ "$MODE" = record ] || [ "$MODE" = all ]; then
	launch_audacity
	run_go 'TestRealAudacityRecord' || status=1
	screenshot record-end
fi
log "artifacts in $WORK/out and $WORK/logs"
exit "$status"
