#!/usr/bin/env bash
# Real-REAPER bridge check on Linux: REAPER runs under xvfb with no audio device (it reports "audio device closed"), the pinned
# LibriVox chapter is fetched, and drive.py drives the real bridge. Run on 2026-10-19 against REAPER 7.82 (docs/research/real-reaper-ci-integration.md).
#
#   run-linux-check.sh <out-dir> [reaper-tarball-sha256]
# Needs xvfb-run, python3, curl and REAPER's GTK3 runtime (libgtk-3-0), and jackd2 for the rows that play or record (NARRATION_CI_JACK=0
# leaves those rows SKIPped and runs with the audio device closed). Everything is written under <out-dir>.
#
# Audio: `jackd -d dummy` is a sound server with no hardware; REAPER connects to it by itself (title bar "JACK", 2 in, 2 out), so
# transport, recording and monitoring run for real. What is recorded is silence. REAPER's "prompt to save recorded files" is turned
# off in the scratch reaper.ini (promptendrec=0), since the dialog would wait for a click that never comes.
set -euo pipefail

OUT=$(mkdir -p "$1" && cd "$1" && pwd)
VERSION=${REAPER_VERSION:-7.82}
TARBALL="reaper${VERSION//./}_linux_x86_64.tar.xz"
PIN=${2:-${REAPER_TARBALL_SHA256:-a4aa961534f22ae5ae910e4ec0c200dcb4476c9f7556806fe09a9743cd582563}}
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)

mkdir -p "$OUT/dl" "$OUT/cfg" "$OUT/out" "$OUT/session/commands"
# -L: www.reaper.fm answers 302 to dlcf.reaper.fm. Nothing is unpacked before the pinned hash matches.
curl -sSL --fail -m 300 -o "$OUT/dl/$TARBALL" "https://www.reaper.fm/files/${VERSION%%.*}.x/$TARBALL"
echo "$PIN  $OUT/dl/$TARBALL" | sha256sum -c -
tar -xf "$OUT/dl/$TARBALL" -C "$OUT/dl"
cp "$OUT/dl/reaper_linux_x86_64/REAPER/EULA.txt" "$OUT/reaper-EULA.txt"

AUDIO=$(python3 "$HERE/drive.py" fetch --dir "$OUT/librivox" | tail -1)
printf '<REAPER_PROJECT 0.1 "7.0" 0\n>\n' > "$OUT/CiBook.rpp"
printf '[REAPER]\npromptendrec=0\n' > "$OUT/cfg/reaper.ini"

AUDIO_MODE=closed
if [ "${NARRATION_CI_JACK:-1}" = 1 ] && command -v jackd >/dev/null; then
  # -r: no realtime scheduling (a runner has no rtprio rights); the dummy driver's 48 kHz, 1024-frame clock is all the rows need.
  setsid jackd -r -d dummy -r 48000 -p 1024 > "$OUT/jackd.log" 2>&1 &
  JACK_PID=$!
  sleep 2
  AUDIO_MODE=jack-dummy
fi

export NARRATION_CI_AUDIO_MODE="$AUDIO_MODE" NARRATION_CI_SESSION="$OUT/session" NARRATION_CI_OUT="$OUT/out" NARRATION_CI_CFG="$OUT/cfg"
export NARRATION_CI_AUDIO="$AUDIO" NARRATION_CI_REAPER_DIR="$REPO/integrations/reaper"
(cd "$OUT/dl/reaper_linux_x86_64/REAPER" && exec xvfb-run -a ./reaper -nosplash -newinst -cfgfile "$OUT/cfg/reaper.ini" \
  "$OUT/CiBook.rpp" "$REPO/integrations/reaper/spikes/ci_real_reaper_launcher.lua") > "$OUT/reaper.log" 2>&1 &
REAPER_PID=$!
trap 'pkill -f "$OUT/cfg/reaper.ini" || true; kill "$REAPER_PID" "${JACK_PID:-}" 2>/dev/null || true' EXIT

set +e
python3 "$HERE/drive.py" run --session "$OUT/session" --out "$OUT/out" --target real --timeout 90 --suite
RC=$?
set -e
if [ -n "${GITHUB_STEP_SUMMARY:-}" ] && [ -f "$OUT/out/results.md" ]; then
  { echo '### Real-REAPER bridge check (Linux)'; cat "$OUT/out/results.md"; } >> "$GITHUB_STEP_SUMMARY"
fi
exit "$RC"
