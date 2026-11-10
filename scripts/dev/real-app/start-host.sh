#!/usr/bin/env bash
# Starts the built desktop host headless on Linux so real_app.py can read and click its window through the accessibility bus (AT-SPI).
#
#   start-host.sh <host-binary> <state-dir> [seconds]
#
# Needs xvfb-run, dbus-daemon, at-spi2-core and WebKitGTK's runtime; build the binary first (docs/operations/real-app-driver.md).
# The host gets a private HOME and a session bus at <state-dir>/run/bus, which WebKit's bubblewrap proxy needs (a bare dbus-run-session
# failed there). The WebKit sandbox stays on. Prints the bus address, then runs until the timeout.
set -euo pipefail
BIN=$(realpath "$1"); STATE=$(mkdir -p "$2" && cd "$2" && pwd); SECONDS_TO_RUN=${3:-1800}
export HOME="$STATE/home" XDG_RUNTIME_DIR="$STATE/run"
mkdir -p "$HOME/.cache/webkitgtk" "$XDG_RUNTIME_DIR"; chmod 700 "$XDG_RUNTIME_DIR"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
export GTK_A11Y=atspi NO_AT_BRIDGE=0 ACCESSIBILITY_ENABLED=1
rm -f "$XDG_RUNTIME_DIR/bus"
dbus-daemon --session --address="$DBUS_SESSION_BUS_ADDRESS" --nofork --nopidfile > "$STATE/dbus.log" 2>&1 &
BUS_PID=$!
trap 'kill "$BUS_PID" 2>/dev/null || true' EXIT
echo "DBUS_SESSION_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS"
cd "$STATE" # the host writes an AppData/ folder under its working directory on Linux
timeout "$SECONDS_TO_RUN" xvfb-run -a -s "-screen 0 1440x900x24" "$BIN" > "$STATE/host.log" 2>&1
