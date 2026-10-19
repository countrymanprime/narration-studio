#!/usr/bin/env bash
# Run the real-Audacity 3 edit tests (A3-T14 to T23, T32, T33) on Linux: Xvfb, a PulseAudio null sink, the pinned Audacity AppImage.
#
#   tests/audacity3/real/edits/run.sh                   every Python test, then the Go half
#   tests/audacity3/real/edits/run.sh A3-T14 A3-T16      just those Python tests
#   tests/audacity3/real/edits/run.sh --go                the Go half only (the adapter)
#   tests/audacity3/real/edits/run.sh --hold              start Audacity and wait, for trying commands by hand
#
# Each test gets a fresh Audacity and profile: a test can leave a modal dialog or a crash behind, and no test depends on another. Results
# are one JSON file per test in $NU_AUDACITY_OUT/results, merged by summarize.py into results.json and summary.md.
# This file does not share code with scripts/research/real-audacity3-ci/run.sh (another stream owns that one); the pins below are the same.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"

# The tests write their own tones (a frequency that changes every second, so each second can be told from the rest), so no LibriVox
# fixture is fetched. Pinned. Bump the version and the hash together (the hash is the only identity the AppImage has).
AUDACITY_VERSION="${AUDACITY_VERSION:-3.7.7}"
AUDACITY_URL="${AUDACITY_URL:-https://github.com/audacity/audacity/releases/download/Audacity-${AUDACITY_VERSION}/audacity-linux-${AUDACITY_VERSION}-x64-22.04.AppImage}"
AUDACITY_SHA256="${AUDACITY_SHA256:-45c4445fb6670cc5fe40d31c7cea979724d2605bca53b554c32520acbf901ef0}"

WORK="${NU_AUDACITY_WORK:-${RUNNER_TEMP:-/tmp}/nu-audacity-edits}"
DISPLAY_NUM="${NU_AUDACITY_DISPLAY:-98}"
SINK="nu_null"
export NU_AUDACITY_OUT="${NU_AUDACITY_OUT:-$WORK/out}"
export NU_AUDACITY_VERSION="$AUDACITY_VERSION"
export NU_RUNNER_IMAGE="${ImageOS:-local}-${ImageVersion:-}"
export NU_AUDACITY_SINK="$SINK"
export NU_AUDACITY_TESTWORK="$WORK/testwork"
export NU_AUDACITY_HOME="$WORK/home"
export DISPLAY=":$DISPLAY_NUM"
mkdir -p "$WORK"/{bin,logs} "$NU_AUDACITY_OUT" "$NU_AUDACITY_TESTWORK"
PIDS=()

log() { printf '[real-audacity3-edits] %s\n' "$*"; }

cleanup() {
	pkill -x audacity 2>/dev/null || true
	for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; done
	rm -f /tmp/audacity_script_pipe.to.* /tmp/audacity_script_pipe.from.*
}
trap cleanup EXIT

install_audacity() {
	local image="$WORK/bin/audacity-$AUDACITY_VERSION.AppImage"
	if [ ! -f "$image" ] || ! echo "$AUDACITY_SHA256  $image" | sha256sum -c --status; then
		log "downloading Audacity $AUDACITY_VERSION"
		curl --fail --location --silent --show-error --retry 3 --max-time 600 -o "$image.part" "$AUDACITY_URL" || exit 1
		echo "$AUDACITY_SHA256  $image.part" | sha256sum -c - || { log "the download is not the pinned AppImage"; exit 1; }
		mv "$image.part" "$image"
	fi
	chmod +x "$image"
	[ -x "$WORK/bin/squashfs-root/AppRun" ] || (cd "$WORK/bin" && "$image" --appimage-extract >/dev/null)
}

start_display() {
	pgrep -f "Xvfb :$DISPLAY_NUM" >/dev/null && return
	Xvfb ":$DISPLAY_NUM" -screen 0 1280x800x24 -ac -nolisten tcp >"$WORK/logs/xvfb.log" 2>&1 &
	PIDS+=("$!")
	sleep 1
}

# A PulseAudio null sink is paced like a sound card; ALSA's own `null` PCM runs as fast as it is read.
start_audio() {
	if pactl info >/dev/null 2>&1 && pactl list short sinks | grep -q "$SINK"; then
		:
	elif [ "$(id -u)" -eq 0 ]; then
		mkdir -p /run/pulse && chmod 755 /run/pulse
		pulseaudio --system --daemonize=yes --disallow-exit --exit-idle-time=-1 --disable-shm=yes -n \
			--log-target="file:$WORK/logs/pulse.log" \
			-L "module-native-protocol-unix auth-anonymous=1 socket=/run/pulse/native" \
			-L "module-null-sink sink_name=$SINK" -L "module-always-sink" >/dev/null 2>&1 || true
	else
		pulseaudio --start --exit-idle-time=-1 --disable-shm=yes --log-target="file:$WORK/logs/pulse.log" || true
		pactl list short sinks | grep -q "$SINK" || pactl load-module module-null-sink sink_name="$SINK" >/dev/null
		pactl set-default-sink "$SINK"
	fi
	[ "$(id -u)" -eq 0 ] && export PULSE_SERVER="unix:/run/pulse/native"
	pactl info | grep -E 'Default (Sink|Source)' | sed 's/^/[pulse] /'
}

# Audacity rewrites its configuration on exit, so the seed is applied again before the second start.
seed_config() {
	local cfg="$1/.config/audacity/audacity.cfg"
	grep -q '^UpdateNoticeShown=1$' "$cfg" 2>/dev/null || printf '[Update]\nDefaultUpdatesChecking=0\nUpdateNoticeShown=1\n' >>"$cfg"
	grep -q '^ShowSplashScreen=' "$cfg" 2>/dev/null || printf '[GUI]\nShowSplashScreen=0\n' >>"$cfg"
	grep -q '^TempDir=' "$cfg" 2>/dev/null || printf '[Directories]\nTempDir=%s\n' "$WORK/audacity-temp" >>"$cfg"
	grep -q '^mod-script-pipe=' "$cfg" 2>/dev/null || printf '[Module]\nmod-script-pipe=1\n' >>"$cfg"
	sed -i 's/^mod-script-pipe=[0-9]$/mod-script-pipe=1/' "$cfg"
	# Extra lines a test group asks for (for example the interface language), appended verbatim.
	[ -n "${NU_AUDACITY_EXTRA_CFG:-}" ] && printf '%b' "$NU_AUDACITY_EXTRA_CFG" >>"$cfg"
	return 0
}

# A fresh HOME per launch; two starts, because the first start on a profile Audacity has never seen records the module as failed.
launch_audacity() {
	local home="$WORK/home" app="$WORK/bin/squashfs-root" attempt i=0
	pkill -x audacity 2>/dev/null || true
	sleep 1
	rm -f /tmp/audacity_script_pipe.to.* /tmp/audacity_script_pipe.from.*
	rm -rf "${home:?}" "$WORK/audacity-temp"
	mkdir -p "$home/.config/audacity" "$home/.local/share/applications" "$WORK/audacity-temp" "$home/.local/share/audacity/Macros"
	printf 'pcm.!default { type pulse }\nctl.!default { type pulse }\n' >"$home/.asoundrc"
	# Macros the tests use are copied into the profile before the first start.
	cp "$HERE"/macros/*.txt "$home/.local/share/audacity/Macros/" 2>/dev/null || true
	seed_config "$home"
	for attempt in 1 2; do
		(HOME="$home" setsid "$app/AppRun" >"$WORK/logs/audacity-$attempt.log" 2>&1) &
		PIDS+=("$!")
		for i in $(seq 1 30); do
			[ -p "/tmp/audacity_script_pipe.to.$(id -u)" ] && break 2
			grep -q '^mod-script-pipe=4$' "$home/.config/audacity/audacity.cfg" 2>/dev/null && break
			sleep 1
		done
		pkill -x audacity 2>/dev/null || true
		sleep 2
		# The killed first start leaves a project behind that the second start would offer to recover in a modal dialog.
		rm -rf "$WORK/audacity-temp" && mkdir -p "$WORK/audacity-temp"
		seed_config "$home"
	done
	[ -p "/tmp/audacity_script_pipe.to.$(id -u)" ] || { log "no scripting pipe after two starts"; return 1; }
	log "scripting pipe up after ${i} s (start $attempt)"
	sleep 3
}

# The pipe's FIFOs can exist while nothing serves them (seen once on a start that looked the same as every other), so a launch is only
# done when a `Message` is answered; otherwise Audacity is started again, up to three times, and the count is logged for the report.
launch_until_answering() {
	local n
	for n in 1 2 3; do
		if launch_audacity && python3 "$HERE/probe.py"; then
			echo "$n" >"$WORK/launch-attempts"
			log "Audacity answers (launch $n of 3)"
			return 0
		fi
		log "launch $n: the pipe did not answer within the probe time"
	done
	return 1
}

install_audacity
start_display
start_audio

if [ "${1:-}" = "--start" ]; then
	trap - EXIT
	launch_until_answering
	exit $?
fi
if [ "${1:-}" = "--hold" ]; then
	launch_audacity
	log "Audacity is running; DISPLAY=$DISPLAY PULSE_SERVER=${PULSE_SERVER:-}"
	sleep "${NU_AUDACITY_HOLD_SECONDS:-3600}"
	exit 0
fi

# Audacity 4: an optional second binary, pinned by URL and SHA-256 in the environment (none is pinned in this repository yet). The test
# starts it and checks that no scripting pipe appears; with no pin it records a SKIP that says so.
launch_audacity4() {
	local image="$WORK/bin/audacity4.AppImage" home4="$WORK/home4"
	[ -n "${NU_AUDACITY4_URL:-}" ] && [ -n "${NU_AUDACITY4_SHA256:-}" ] || return 1
	if [ ! -f "$image" ] || ! echo "$NU_AUDACITY4_SHA256  $image" | sha256sum -c --status; then
		curl --fail --location --silent --show-error --retry 3 --max-time 600 -o "$image.part" "$NU_AUDACITY4_URL" || return 1
		echo "$NU_AUDACITY4_SHA256  $image.part" | sha256sum -c - || { log "the Audacity 4 download is not the pinned file"; return 1; }
		mv "$image.part" "$image"
	fi
	chmod +x "$image"
	[ -x "$WORK/bin4/squashfs-root/AppRun" ] || { mkdir -p "$WORK/bin4" && (cd "$WORK/bin4" && "$image" --appimage-extract >/dev/null); }
	pkill -x audacity 2>/dev/null || true
	rm -f /tmp/audacity_script_pipe.to.* /tmp/audacity_script_pipe.from.*
	rm -rf "${home4:?}" && mkdir -p "$home4/.config"
	printf 'pcm.!default { type pulse }\nctl.!default { type pulse }\n' >"$home4/.asoundrc"
	(HOME="$home4" setsid "$WORK/bin4/squashfs-root/AppRun" >"$WORK/logs/audacity4.log" 2>&1) &
	PIDS+=("$!")
	sleep 5
}

# The ids that need Audacity 3 on the Linux runner; A3-T30 is the Windows job's (windows.ps1) and is not listed here.
# No argument: every Python test, then the Go half. --go: the Go half only. Ids: just those Python tests.
RUN_GO=0
IDS=()
case "${1:-}" in
--go) RUN_GO=1 ;;
"") RUN_GO=1; IDS=(A3-T14 A3-T15 A3-T16 A3-T17 A3-T18 A3-T19 A3-T20 A3-T21 A3-T22 A3-T22b A3-T22c A3-T23 A3-T32 A3-T33) ;;
*) IDS=("$@") ;;
esac
status=0
for id in "${IDS[@]}"; do
	log "=== $id"
	if [ "$id" = A3-T33 ]; then
		if launch_audacity4; then NU_AUDACITY4_RUNNING=1 python3 "$HERE/run_tests.py" "$id" || status=1; else python3 "$HERE/run_tests.py" "$id" || status=1; fi
		pkill -x audacity 2>/dev/null || true
		continue
	fi
	extra=""
	[ "$id" = A3-T32 ] && extra='[Locale]\nLanguage=de\n'
	NU_AUDACITY_EXTRA_CFG="$extra" launch_until_answering || { echo "{\"id\":\"$id\",\"title\":\"launch\",\"status\":\"FAIL\",\"steps\":[{\"step\":\"launch\",\"status\":\"FAIL\",\"detail\":\"no answer from the scripting pipe after three launches\",\"data\":{}}]}" >"$NU_AUDACITY_OUT/launch-$id.json"; status=1; continue; }
	python3 "$HERE/run_tests.py" "$id" || status=1
	import -window root "$NU_AUDACITY_OUT/$id-end.png" 2>/dev/null || true
	pkill -x crashpad_handler 2>/dev/null || true
done

# The adapter half (apps/desktop/internal/dawport/audacity/real_edits_linux_live_test.go): one Go test per fresh Audacity.
GO_TESTS=(TestRealEditsBackups TestRealEditsRoll TestRealEditsCutAndStack TestRealEditsMacro TestRealEditsGainAndClicks)
if [ "$RUN_GO" = 1 ]; then
	for name in "${GO_TESTS[@]}"; do
		log "=== go $name"
		launch_until_answering || { status=1; continue; }
		(cd "$REPO/apps/desktop" && go test -tags audacityreal -run "^$name\$" -v -count=1 -timeout 8m ./internal/dawport/audacity/) 2>&1 | tee -a "$WORK/logs/go-$name.log" | sed 's/^/[go] /'
		[ "${PIPESTATUS[0]}" = 0 ] || status=1
		import -window root "$NU_AUDACITY_OUT/go-$name-end.png" 2>/dev/null || true
		pkill -x crashpad_handler 2>/dev/null || true
	done
fi
python3 "$HERE/summarize.py" "$NU_AUDACITY_OUT" || true
exit "$status"
