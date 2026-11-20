"""Times every page of the real desktop app on the project it was started with (docs/operations/real-app-driver.md, "Timing the pages").

    NARRATION_DEBUG=1 ./start-host.sh /tmp/ns-host /tmp/ns-state 3000 -- --project-folder <seeded book> &
    DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/ns-state/run/bus /usr/bin/python3.12 page_times.py /tmp/ns-state [--quiet 2] [--limit 600]

With NARRATION_DEBUG=1 the page writes one `ui.call.ok` line to the run log for every host call it gets an answer to, with the time
the page waited for it. This presses each page's navigation button and reads those lines: how many calls the page made, when the
first and the last answer came after the press, the calls' summed wait and the slowest one. A page has stopped reading when no
answer has come for --quiet seconds. It prints a Markdown table: the launch (the landing page, read from the log's start), then a
first and a second visit of every page. The Booth is visited once and last, since it covers the navigation.

What it cannot see: time the page spends drawing after its last answer, and how a call's wait divides between the host and the
bridge to the page. scripts/dev/host-read-bench.mjs gives the host's share of the same reads.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

import real_app

PAGES = ["Schedule", "Script", "Story Bible", "Editing", "Proof", "Pickups", "Master & QC", "Delivery", "Settings", "Production"]
# Calls the shell repeats on a timer whatever page is open; they would keep a page from ever going quiet.
TIMER_CALLS = {"SystemTraceBatch", "DawCapabilities", "DawChoice"}


def calls(log: Path, since: float) -> list[tuple[float, str, float]]:
    """(seconds after `since`, binding, milliseconds the page waited) for every answered call logged after `since`."""
    found = []
    for line in log.read_text(encoding="utf-8").splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue  # a line the host is still writing
        if record.get("event") not in ("ui.call.ok", "ui.call.fail"):
            continue
        binding, _, rest = record["msg"].partition(" ")
        at = datetime.fromisoformat(record["ts"]).timestamp()
        if at >= since and binding not in TIMER_CALLS:
            found.append((at - since, binding, float(rest.split("ms")[0])))
    return found


def settle(log: Path, since: float, quiet: float, limit: float) -> list[tuple[float, str, float]]:
    """The calls answered after `since`, once none has been answered for `quiet` seconds (or `limit` seconds have passed)."""
    while True:
        seen = calls(log, since)
        waited = time.time() - since
        last = seen[-1][0] if seen else 0.0
        if waited - last >= quiet or waited >= limit:
            return seen
        time.sleep(0.2)


def row(name: str, seen: list[tuple[float, str, float]]) -> str:
    if not seen:
        return f"| {name} | 0 | | | | |"
    slowest = max(seen, key=lambda call: call[2])
    return (
        f"| {name} | {len(seen)} | {seen[0][0]:.2f} | {seen[-1][0]:.2f} | {sum(call[2] for call in seen) / 1000:.2f} | `{slowest[1]}` {slowest[2] / 1000:.2f} |"
    )


def press(page: str) -> float:
    """Presses the page's navigation button (its name may carry a count: "Proof, 357") and returns when."""
    buttons = [n for n in real_app.find_all("push button") if n.name.lower().split(",")[0] == page.lower()]
    if not buttons:
        raise LookupError(f"no navigation button for {page}\n" + "\n".join(real_app.tree()))
    at = time.time()
    real_app.click(buttons[0])
    return at


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("state", type=Path, help="start-host.sh's state folder")
    parser.add_argument("--quiet", type=float, default=2.0, help="seconds without an answer that end a page's reads")
    parser.add_argument("--limit", type=float, default=600.0, help="seconds to wait for one page at most")
    args = parser.parse_args()
    log = args.state / "AppData/Roaming/narration-studio/logs/run.jsonl"
    started = next(json.loads(line) for line in log.read_text(encoding="utf-8").splitlines() if '"run.start"' in line)
    launch = datetime.fromisoformat(started["ts"]).timestamp()

    print("| Visit | Calls | First answer, s | Last answer, s | Summed wait, s | Slowest call, s |\n| --- | --- | --- | --- | --- | --- |")
    real_app.app(timeout=60)
    print(row("Launch (Production)", settle(log, launch, args.quiet, args.limit)), flush=True)
    # The dialogs a project with no DAW and no credits opens over the page; the navigation is not reachable under them.
    for dismiss in ("Close", "NOT NOW"):
        for button in real_app.find_all("push button", dismiss):
            real_app.click(button)
            time.sleep(1.0)
    for visit in ("first", "second"):
        for page in PAGES:
            at = press(page)
            print(row(f"{page}, {visit}", settle(log, at, args.quiet, args.limit)), flush=True)
    print(row("Booth, first", settle(log, press("Booth"), args.quiet, args.limit)), flush=True)


if __name__ == "__main__":
    main()
