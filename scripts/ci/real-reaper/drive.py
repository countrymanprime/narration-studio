"""Drives the REAPER bridge over its file protocol and asserts what comes back, one PASS/FAIL/SKIP line per action.

    python drive.py fetch --dir <dir>                      download the pinned LibriVox chapter (SHA-256 checked); prints its path
    python drive.py run --session <dir> --out <dir> [--target real|fake] [--timeout 120]

`run` writes numbered command files into <session>/commands and reads <session>/events.log, exactly as the Go host does
(apps/desktop/internal/bridge). Target `real` is a REAPER running spikes/ci_real_reaper_launcher.lua; `fake` is scripts/research/bridge-fake-driver.py,
which has no audio or items, so the checks marked real_only are SKIPped there. Exit status 1 when any check fails.
Design and limits: docs/research/real-reaper-ci-integration.md.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "tests" / "fixtures" / "audio" / "librivox-alice"
CHAPTER_ID = "kara_01"  # Alice ch. I, Kara Shallenberg, LibriVox, public domain (sources.json holds URL and SHA-256)
SUITES = ["scenarios_session"]  # modules that register scenarios with scenario.scenario()
REGIONS = [(0.0, 20.0, "Chapter 1"), (20.0, 40.0, "Chapter 2"), (40.0, 60.0, "Chapter 3")]


def enc(value: object) -> str:
    return urllib.parse.quote(str(value), safe="-_.~")


def dec(value: str) -> str:
    return urllib.parse.unquote(value)


class Session:
    def __init__(self, directory: Path) -> None:
        self.dir = directory
        self.sent = 0
        self.offset = 0
        self.seen: list[list[str]] = []  # every event read so far, so the heartbeat check sees what earlier asks consumed
        (directory / "commands").mkdir(parents=True, exist_ok=True)

    def send(self, command: str, *args: object) -> str:
        """Sends one command with a fresh run id and returns the run id."""
        self.sent += 1
        run = f"ci{self.sent}"
        line = "|".join([enc("1"), enc(command), enc(run), *[enc(a) for a in args]])
        target = self.dir / "commands" / f"{self.sent:08d}.cmd"
        partial = target.with_suffix(".tmp")  # the bridge lists *.cmd only, so it never reads a half-written file
        partial.write_text(line + "\n", encoding="utf-8", newline="\n")
        partial.replace(target)
        return run

    def events(self) -> list[list[str]]:
        path = self.dir / "events.log"
        data = path.read_bytes() if path.exists() else b""
        fresh, self.offset = data[self.offset :], len(data)
        parsed = [[dec(p) for p in line.split("|")] for line in fresh.decode("utf-8").splitlines() if line]
        self.seen.extend(parsed)
        return parsed

    def ask(self, command: str, *args: object, until: set[str], timeout: float = 30.0) -> list[list[str]]:
        """Sends a command; returns the events carrying its run id, ending at the first tag in `until`."""
        run = self.send(command, *args)
        got: list[list[str]] = []
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            for event in self.events():
                if len(event) > 1 and event[1] == run:
                    got.append(event)
                    if event[0] in until | {"ERROR"}:
                        return got
            time.sleep(0.05)
        raise TimeoutError(f"{command}: none of {sorted(until)} within {timeout:.0f}s; got {got}")


class Report:
    def __init__(self) -> None:
        self.rows: list[dict[str, str]] = []

    def record(self, name: str, status: str, detail: str = "") -> None:
        self.rows.append({"action": name, "status": status, "detail": detail})
        print(f"{status:4} {name}" + (f" - {detail}" if detail else ""), flush=True)

    def check(self, name: str, fn, *, real_only: bool, target: str) -> None:
        if real_only and target != "real":
            self.record(name, "SKIP", "needs a real REAPER")
            return
        try:
            self.record(name, "PASS", fn() or "")
        except Exception as exc:  # noqa: BLE001 - a failed assertion, a timeout or a bad event: the row fails, the run goes on
            self.record(name, "FAIL", f"{type(exc).__name__}: {exc}")


def last(events: list[list[str]], tag: str) -> list[str]:
    found = [e for e in events if e[0] == tag]
    assert found, f"no {tag} in {[e[0] for e in events]}"
    return found[-1]


def wait_ready(session: Session, timeout: float) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if (session.dir / "ready").exists():
            break
        time.sleep(0.25)
    else:
        raise TimeoutError(f"REAPER did not signal ready within {timeout:.0f}s")
    fixture = session.dir / "fixture.json"
    return json.loads(fixture.read_text(encoding="utf-8")) if fixture.exists() else {}


def run(args: argparse.Namespace) -> int:
    session, out, target = Session(Path(args.session)), Path(args.out), args.target
    out.mkdir(parents=True, exist_ok=True)
    report = Report()
    fixture: dict = {}
    if target == "real":
        fixture = wait_ready(session, args.timeout)
        print(f"REAPER {fixture.get('reaper_version')} on {fixture.get('os')}, chapter {fixture.get('length')} s", flush=True)
    renders = out / "renders"

    def ping():
        e = session.ask("ping", until={"PONG"})
        assert last(e, "PONG")[2], "no navigation version"

    def project():
        e = session.ask("project_state", until={"PROJECT_STATE"})
        rpp = last(e, "PROJECT_STATE")[3]
        if target == "real":
            assert rpp.replace("\\", "/").lower() == fixture["rpp"].replace("\\", "/").lower(), f"active project {rpp}"
        return rpp

    def heartbeat():
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            session.events()
            beats = [e for e in session.seen if e[0] == "PROJECT_STATUS"]
            if beats:
                if target == "real":
                    assert beats[-1][3] == "0", "project reported unsaved"
                return f"changeCount {beats[-1][4]}"
            time.sleep(0.1)
        raise TimeoutError("no PROJECT_STATUS heartbeat in 10 s")

    def transport():
        e = session.ask("chapter_track_state", "", until={"TRACK_STATE_END", "TRACK_STALE"})
        assert last(e, "TRACK_STATE")[3] == "0", "transport not stopped"  # no track named: the transport only
        pos = last(session.ask("play_position", until={"PLAY_POSITION"}), "PLAY_POSITION")
        assert pos[2] == "0", f"play state {pos[2]}"

    def stale_track():
        e = session.ask("chapter_track_state", "{00000000-0000-4000-8000-000000000000}", until={"TRACK_STALE", "TRACK_STATE_END"})
        assert e[-1][0] == "TRACK_STALE", e

    def imported_item():
        e = session.ask("chapter_track_state", fixture["track"], until={"TRACK_STATE_END", "TRACK_STALE"})
        item = last(e, "TRACK_ITEM")
        assert item[2] == fixture["item"], f"item {item[2]}"
        assert item[8].replace("\\", "/").lower().endswith("kara_01.mp3"), f"source {item[8]}"
        assert abs(float(item[5]) - fixture["length"]) < 0.05, f"length {item[5]} vs {fixture['length']}"
        return f"{item[5]} s from {Path(item[8]).name}"

    def create_regions():
        payload = out / "regions.txt"
        payload.write_text("".join(f"{a}|{b}|{t}\n" for a, b, t in REGIONS), encoding="utf-8", newline="\n")
        first = last(session.ask("create_regions", str(payload), "", "0", until={"REGIONS_CREATED"}), "REGIONS_CREATED")
        assert first[2:5] == ["3", "0", "0"], f"created/existing/invalid {first[2:5]}"
        again = last(session.ask("create_regions", str(payload), "", "0", until={"REGIONS_CREATED"}), "REGIONS_CREATED")
        assert again[2:5] == ["0", "3", "0"], f"second send {again[2:5]}"

    def region_state():
        state = last(session.ask("ci_state", until={"CI_STATE"}), "CI_STATE")
        assert state[2] == "3", f"{state[2]} regions"
        assert state[4] == "Narration Utils: create regions", f"undo label {state[4]!r}"
        return f"change count {state[5]}"

    def undo_regions():
        session.ask("ci_undo", until={"CI_UNDONE"})
        state = last(session.ask("ci_state", until={"CI_STATE"}), "CI_STATE")
        assert state[2] == "0", f"{state[2]} regions after one undo"

    def render_config():
        folder = str(renders)
        session.ask("create_regions", str(out / "regions.txt"), "", "0", until={"REGIONS_CREATED"})
        e = last(session.ask("configure_chapter_render", folder, until={"RENDER_CONFIGURED"}), "RENDER_CONFIGURED")
        names = [Path(p.replace("\\", "/")).name for p in e[4].split(";") if p]
        assert names == [f"{t}.wav" for _, _, t in REGIONS], names
        return ", ".join(names)

    def render():
        session.ask("ci_render", until={"CI_RENDERED"}, timeout=120)
        sizes = {t: (renders / f"{t}.wav").stat().st_size for _, _, t in REGIONS}
        assert all(size > 100_000 for size in sizes.values()), sizes
        return f"{len(sizes)} files, {min(sizes.values())} bytes at least"

    c = report.check
    c("ping", ping, real_only=False, target=target)
    c("link/identify project (project_state)", project, real_only=False, target=target)
    c("heartbeat (PROJECT_STATUS)", heartbeat, real_only=False, target=target)
    c("read transport (chapter_track_state, play_position)", transport, real_only=False, target=target)
    c("stale track guid is refused (TRACK_STALE)", stale_track, real_only=False, target=target)
    c("chapter file as an item (chapter_track_state TRACK_ITEM)", imported_item, real_only=True, target=target)
    c("regions: create, then idempotent (create_regions)", create_regions, real_only=False, target=target)
    c("regions: undo label and one-step undo (ci_state, ci_undo)", lambda: [region_state(), undo_regions()][0], real_only=True, target=target)
    c("render: configure per-chapter file names (configure_chapter_render)", render_config, real_only=True, target=target)
    c("render: files written (action 42230)", render, real_only=True, target=target)
    if args.suite:
        import scenario  # the scenario suites arrange, act and assert on real project state (scenario.py)

        for module in SUITES:
            __import__(module)
        media = scenario.make_media(out / "media")
        env = scenario.Env(session, out, fixture, media, audio_mode=fixture.get("audio_mode", "closed"))
        names = set(args.only.split(",")) if args.only else None
        scenario.run_scenarios(env, report, target, names)
    for name in ("ID3 CHAP titles",):
        report.record(name, "SKIP", "not in the prototype (see the research note's matrix)")

    if target == "real" and not args.no_quit:
        try:
            session.send("ci_quit")
        except OSError:
            pass
    failed = [r for r in report.rows if r["status"] == "FAIL"]
    (out / "results.json").write_text(json.dumps({"target": target, "fixture": fixture, "rows": report.rows}, indent=2), encoding="utf-8")
    lines = ["| Action | Status | Detail |", "| --- | --- | --- |"] + [f"| {r['action']} | {r['status']} | {r['detail']} |" for r in report.rows]
    (out / "results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(report.rows) - len(failed)} of {len(report.rows)} rows not failed; {len(failed)} FAIL", flush=True)
    return 1 if failed else 0


def fetch(args: argparse.Namespace) -> int:
    sys.path.insert(0, str(FIXTURES))
    import sources  # the repository's own pinned-download helper

    directory = Path(args.dir)
    sources.fetch(directory, only={CHAPTER_ID})
    source = sources.load_sources()[CHAPTER_ID]
    assert sources.present(source, directory), "the download is not the pinned file"
    print(directory / source["file"])
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--dir", required=True)
    r = sub.add_parser("run")
    r.add_argument("--session", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--target", choices=["real", "fake"], default="real")
    r.add_argument("--timeout", type=float, default=120.0)
    r.add_argument("--suite", action="store_true", help="also run the scenario suites (scenarios_*.py)")
    r.add_argument("--only", default="", help="comma-separated capability names or scenario names to run")
    r.add_argument("--no-quit", action="store_true", help="leave REAPER running (development)")
    ns = parser.parse_args()
    return fetch(ns) if ns.cmd == "fetch" else run(ns)


if __name__ == "__main__":
    sys.exit(main())
