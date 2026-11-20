"""Times every page of the real desktop app on the project it was started with (docs/operations/real-app-driver.md, "Timing the pages").

    NARRATION_DEBUG=1 ./start-host.sh /tmp/ns-host /tmp/ns-state 3000 -- --project-folder <seeded book> &
    DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/ns-state/run/bus /usr/bin/python3.12 page_times.py /tmp/ns-state [--quiet 2] [--limit 900] [--launch-only]

With NARRATION_DEBUG=1 the page writes one `ui.call.ok` line to the run log for every host call it gets an answer to, with the time
the page waited for it. This presses each page's navigation button and reads those lines: how many calls the page made, when the
first and the last answer came after the press, the calls' summed wait and the slowest one. A visit is over when, for --quiet
seconds, no answer has come and the host process and WebKit's page process together have used under 40 % of one processor: a slow
read in flight keeps the host busy, and drawing keeps the page busy. "Busy until" is the last moment either was. It prints a Markdown table: the
launch (the landing page, read from the log's start), then a first and a second visit of every page. The Booth is visited once
and last, since it covers the navigation.

What it cannot see: how a call's wait divides between the host and the bridge to the page. scripts/dev/host-read-bench.mjs gives
the host's share of the same reads.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

import real_app

# The app's folder under AppData (config/brand.json), where the run log is.
DATA = json.loads((Path(__file__).resolve().parents[3] / "config/brand.json").read_text(encoding="utf-8"))["identity"]["dataFolder"]
PAGES = ["Schedule", "Script", "Story Bible", "Editing", "Proof", "Pickups", "Master & QC", "Delivery", "Settings", "Production"]
# Calls the shell repeats on a timer whatever page is open; they are no page's own.
TIMER_CALLS = {"SystemTraceBatch", "DawCapabilities", "DawChoice"}
# The host and WebKit's page process, as /proc names them (the kernel keeps 15 characters).
PROCESSES = {"ns-host", "WebKitWebProces"}

Call = tuple[float, str, float]


def calls(log: Path, since: float) -> list[Call]:
    """(seconds after `since`, binding, milliseconds the page waited) for every answered call logged after `since`."""
    found = []
    for line in log.read_text(encoding="utf-8").splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue  # a line the host is still writing
        if record.get("event") not in ("ui.call.ok", "ui.call.fail"):
            continue
        binding, _, rest = record.get("msg", "").partition(" ")
        waited = rest.split("ms")[0]
        if not waited.isdigit():
            continue  # not "<binding> <n>ms": no call's line
        at = datetime.fromisoformat(record["ts"]).timestamp()
        if at >= since and binding not in TIMER_CALLS:
            found.append((at - since, binding, float(waited)))
    return found


def processor_seconds() -> float:
    """Processor time the host and WebKit's page processes have used so far."""
    ticks = 0
    for stat in Path("/proc").glob("[0-9]*/stat"):
        try:
            name, _, rest = stat.read_text(encoding="utf-8").partition("(")[2].rpartition(")")
            if name in PROCESSES:
                ticks += sum(int(n) for n in rest.split()[11:13])
        except (OSError, ValueError):
            continue  # a process that ended while it was read
    return ticks / 100


def settle(log: Path, since: float, quiet: float, limit: float) -> tuple[list[Call], float]:
    """The calls answered after `since` and how long the app stayed busy, once it has been quiet for `quiet` seconds (or `limit` passed)."""
    samples, busy_until = [(time.time(), processor_seconds())], since
    while True:
        time.sleep(0.25)
        now, using = time.time(), processor_seconds()
        samples = [sample for sample in samples if now - sample[0] <= 1.0] or samples[-1:]
        # Busy is more than 40 % of one processor over the last second. The open app idles at about 13 % under Xvfb (its
        # timers and the software renderer); a read or a redraw takes a whole processor.
        if using - samples[0][1] > 0.4 * (now - samples[0][0]):
            busy_until = now
        samples.append((now, using))
        seen = calls(log, since)
        last = since + seen[-1][0] if seen else since
        if now - max(last, busy_until) >= quiet or now - since >= limit:
            return seen, busy_until - since


def row(name: str, settled: tuple[list[Call], float]) -> str:
    seen, busy = settled
    if not seen:
        return f"| {name} | 0 | | | {busy:.2f} | | |"
    slowest = max(seen, key=lambda call: call[2])
    waited = sum(call[2] for call in seen) / 1000
    return f"| {name} | {len(seen)} | {seen[0][0]:.2f} | {seen[-1][0]:.2f} | {busy:.2f} | {waited:.2f} | `{slowest[1]}` {slowest[2] / 1000:.2f} |"


def press(name: str, tries: int = 30) -> float:
    """Presses the button called `name` (a navigation button's name may carry a count: "Proof, 357") and returns when."""
    for _ in range(tries):
        try:
            # The first match, without reading the rest of the tree: the navigation comes before the page, and a page of
            # 15,000 findings takes the accessibility bus longer to read than it waits for an answer.
            is_it = lambda n: n.getRoleName() == "push button" and n.name.lower().split(",")[0] == name.lower()
            button = next((n for _, n in real_app.walk(real_app.app()) if is_it(n)), None)
            if button:
                at = time.time()
                real_app.click(button)
                return at
        except Exception as error:  # noqa: BLE001 the accessibility bus times out while the page is busy; ask again
            print(f"<!-- {name}: {str(error)[:80]} -->", flush=True)
        time.sleep(1.0)
    raise LookupError(f"no button named {name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("state", type=Path, help="start-host.sh's state folder")
    parser.add_argument("--quiet", type=float, default=2.0, help="seconds without an answer or processor use that end a visit")
    parser.add_argument("--limit", type=float, default=900.0, help="seconds to wait for one page at most")
    parser.add_argument("--launch-only", action="store_true", help="print the launch row and stop")
    args = parser.parse_args()
    log = args.state / "AppData/Roaming" / DATA / "logs/run.jsonl"
    if not log.exists():
        parser.error(f"no run log at {log}: start the host with start-host.sh on this state folder first")
    started = next(json.loads(line) for line in log.read_text(encoding="utf-8").splitlines() if '"run.start"' in line)
    launch = datetime.fromisoformat(started["ts"]).timestamp()

    print("| Visit | Calls | First answer, s | Last answer, s | Busy until, s | Summed wait, s | Slowest call, s |")
    print("| --- | --- | --- | --- | --- | --- | --- |")
    print(row("Launch (Production)", settle(log, launch, args.quiet, args.limit)), flush=True)
    if args.launch_only:
        return
    # The dialogs a project with no DAW and no credits opens over the page; the navigation is not reachable under them.
    for dismiss in ("Close", "Not now"):
        try:
            press(dismiss, tries=3)
            time.sleep(1.0)
        except LookupError:
            pass  # the dialog did not open
    for visit in ("first", "second"):
        for page in PAGES:
            at = press(page)
            print(row(f"{page}, {visit}", settle(log, at, args.quiet, args.limit)), flush=True)
    print(row("Booth, first", settle(log, press("Booth"), args.quiet, args.limit)), flush=True)


if __name__ == "__main__":
    main()
