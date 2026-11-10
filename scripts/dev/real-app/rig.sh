#!/usr/bin/env bash
# The real desktop host and a real REAPER 7.82 on one shared session folder, over a seeded project, ready for real_app.py
# (docs/operations/real-app-driver.md, "Real host plus real REAPER").
#
#   rig.sh up   <work-dir> [seed.py arguments]   seed the project, start JACK (dummy device), REAPER and the host
#   rig.sh down <work-dir>                       stop them
#
# Needs: the built host (NS_HOST, default /tmp/ns-host), xvfb-run, dbus-daemon, jackd (jackd2), REAPER's GTK3 runtime (libgtk-3-0), curl, python3.
# REAPER's tarball is fetched and checked against the pinned hash the CI check uses (scripts/ci/real-reaper/run-linux-check.sh); it runs on a
# scratch cfg (no audio hardware, a JACK dummy device records silence). Writes <work-dir>/env.sh with what a driver needs.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)
CMD=${1:?usage: rig.sh up|down <work-dir> [seed.py arguments]}
WORK=$(mkdir -p "${2:?usage: rig.sh up|down <work-dir> [seed.py arguments]}" && cd "$2" && pwd)
shift 2

stop() {
  for name in host reaper; do
    [ -f "$WORK/$name.pid" ] && kill -9 "-$(cat "$WORK/$name.pid")" 2>/dev/null || true
    rm -f "$WORK/$name.pid"
  done
  pkill -9 -f "$WORK/reaper-dist" 2>/dev/null || true # a plain kill of xvfb-run left REAPER answering the old session folder
  # jackd is asked to stop and its shared memory removed: a killed one leaves files a new one cannot start over.
  [ -f "$WORK/jackd.pid" ] && kill -TERM "-$(cat "$WORK/jackd.pid")" 2>/dev/null || true
  rm -f "$WORK/jackd.pid"
  sleep 1
  rm -rf /dev/shm/jack_* /dev/shm/jack-* 2>/dev/null || true
}

if [ "$CMD" = down ]; then stop; exit 0; fi
[ "$CMD" = up ] || { echo "usage: rig.sh up|down <work-dir>" >&2; exit 2; }
stop
HOST=${NS_HOST:-/tmp/ns-host}
[ -x "$HOST" ] || { echo "build the host first: $HOST" >&2; exit 1; }

VERSION=${REAPER_VERSION:-7.82}
TARBALL="reaper${VERSION//./}_linux_x86_64.tar.xz"
PIN=${REAPER_TARBALL_SHA256:-a4aa961534f22ae5ae910e4ec0c200dcb4476c9f7556806fe09a9743cd582563}
REAPER_DIR="$WORK/reaper-dist/reaper_linux_x86_64/REAPER"
if [ ! -x "$REAPER_DIR/reaper" ]; then
  mkdir -p "$WORK/reaper-dist"
  curl -sSL --fail -m 300 -o "$WORK/reaper-dist/$TARBALL" "https://www.reaper.fm/files/${VERSION%%.*}.x/$TARBALL"
  echo "$PIN  $WORK/reaper-dist/$TARBALL" | sha256sum -c - # nothing is unpacked before the pinned hash matches
  tar -xf "$WORK/reaper-dist/$TARBALL" -C "$WORK/reaper-dist"
fi

PROJECT="$WORK/project" SESSION="$WORK/session" CFG="$WORK/cfg" STATE="$WORK/state"
rm -rf "$PROJECT" "$SESSION" "$CFG" "$STATE"
mkdir -p "$SESSION/commands" "$CFG"
python3 "$HERE/seed.py" "$PROJECT" "$@" > "$WORK/seed.json"
printf '[REAPER]\npromptendrec=0\n' > "$CFG/reaper.ini"

setsid jackd -r -d dummy -r 48000 -p 1024 > "$WORK/jackd.log" 2>&1 &
echo $! > "$WORK/jackd.pid"
sleep 2
kill -0 "$(cat "$WORK/jackd.pid")" 2>/dev/null || { echo "jackd did not start; see $WORK/jackd.log" >&2; exit 1; }
(
  cd "$REAPER_DIR"
  NS_SESSION="$SESSION" NS_REAPER_DIR="$REPO/src/studio/integrations/reaper" NS_CFG="$CFG" \
    exec setsid xvfb-run -a ./reaper -nosplash -newinst -cfgfile "$CFG/reaper.ini" "$PROJECT/Book.rpp" "$HERE/launcher.lua"
) > "$WORK/reaper.log" 2>&1 &
echo $! > "$WORK/reaper.pid"
for _ in $(seq 1 60); do [ -f "$SESSION/ready" ] && break; sleep 2; done
[ -f "$SESSION/ready" ] || { echo "REAPER's bridge did not come up; see $WORK/reaper.log" >&2; exit 1; }

setsid "$HERE/start-host.sh" "$HOST" "$STATE" 3000 -- --project-folder "$PROJECT" --project-file "$PROJECT/Book.rpp" --session-dir "$SESSION" --daw reaper \
  > "$WORK/start-host.log" 2>&1 &
echo $! > "$WORK/host.pid"
sleep 5
cat > "$WORK/env.sh" <<ENV
export DBUS_SESSION_BUS_ADDRESS=unix:path=$STATE/run/bus
export NS_SESSION=$SESSION NS_PROJECT=$PROJECT NS_WORK=$WORK
ENV
echo "rig up: source $WORK/env.sh, then run real_app.py with /usr/bin/python3.12 (seed: $(cat "$WORK/seed.json"))"
