"""Mutation checks for the bridge harness: each entry of mutations.json breaks one safety-relevant line of the Lua
source, and the harness must fail. A surviving mutation means a guard has no test that would notice it disappearing.

An entry whose ``find`` text no longer occurs exactly once also fails the run, so refactoring the Lua source means
updating this file in the same change instead of quietly losing a check.

An entry may name the platforms (``sys.platform`` values) where it is ``equivalent_on``, with ``why``: a guard no input
can reach there, so no test can catch its removal (the network-share guard on Windows, where a path that starts with
two slashes never passes the drive-letter check after it). It is still checked on every other platform, and is
reported, not counted, where it is equivalent.
"""

from __future__ import annotations

import json
import multiprocessing
import os
import re
import shutil
import sys
import tempfile
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from lupa.lua54 import LuaError, LuaRuntime

SuiteRunner = Callable[..., tuple[int, int, list[str]]]


def _mutated_copy(reaper_dir: Path, scratch: Path, entry: dict) -> Path:
    target = scratch / "reaper"
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    for source in reaper_dir.glob("*.lua"):
        shutil.copy2(source, target / source.name)
    file = target / entry["file"]
    text = file.read_text(encoding="utf-8")
    occurrences = text.count(entry["find"])
    if occurrences != 1:
        raise ValueError(f"mutation {entry['name']!r}: expected its text once in {entry['file']}, found {occurrences}")
    file.write_text(text.replace(entry["find"], entry["replace"]), encoding="utf-8", newline="")
    loaded = LuaRuntime(unpack_returned_tuples=True).eval("loadfile")(str(file))
    syntax_error = loaded[1] if isinstance(loaded, tuple) else None  # loadfile answers (nil, message) on a syntax error
    if syntax_error:
        raise ValueError(f"mutation {entry['name']!r} does not compile, so it proves nothing: {syntax_error}")
    return target


def _own_tests(tests_dir: Path, reaper_dir: Path, lua_file: str) -> tuple[str, ...]:
    """The test files that almost always catch a mutation of a feature file: the one named after it
    (narration_transport.lua -> transport_test.lua) and every one that sends a command the file registers (the
    stack_takes tests are in stack_test.lua, not takes_test.lua). Running them first, and stopping at the first
    failure, keeps the whole check fast. A mutation no test catches still runs every file, so the outcome is the same
    as a full run."""
    stem = Path(lua_file).stem.removeprefix("narration_")
    commands = re.findall(r"register\('([a-z_]+)'", (reaper_dir / lua_file).read_text(encoding="utf-8"))
    senders = [
        test_file.name
        for test_file in sorted(tests_dir.glob("*_test.lua"))
        if any(re.search(rf"['\"]{command}['\"]", test_file.read_text(encoding="utf-8")) for command in commands)
    ]
    return (f"{stem}_test.lua", *senders)


def _check(tests_dir: Path, reaper_dir: Path, run_suite: SuiteRunner, entry: dict) -> tuple[str, str]:
    """One mutation in its own scratch copy: ("caught", line) or ("survived", line). Runs in a worker process."""
    scratch = Path(tempfile.mkdtemp(prefix="reaper-mutation-"))
    try:
        mutated = _mutated_copy(reaper_dir, scratch, entry)
        try:
            _, failed, _ = run_suite(mutated, verbose=False, first=_own_tests(tests_dir, reaper_dir, entry["file"]), stop_at_failure=True)
        except (LuaError, RuntimeError) as error:  # a mutation that breaks loading is caught too
            return "caught", f"  caught (suite raised {type(error).__name__}): {entry['name']}"
        if failed:
            return "caught", f"  caught ({failed} failing): {entry['name']}"
        return "survived", f"  SURVIVED: {entry['name']}"
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def run_mutations(tests_dir: Path, reaper_dir: Path, run_suite: SuiteRunner, jobs: int | None = None) -> int:
    """Checks every mutation, `jobs` at a time in worker processes (one per CPU by default): each has its own copy of the
    Lua source and its own Lua states, so they share nothing. The lines print in mutations.json order whatever order
    they finish in. An entry whose `find` does not apply still fails the whole run."""
    entries = json.loads((tests_dir / "mutations.json").read_text(encoding="utf-8"))
    counted: list[dict] = []
    equivalent = 0
    for entry in entries:
        if sys.platform in entry.get("equivalent_on", ()):
            if not entry.get("why"):
                raise ValueError(f"mutation {entry['name']!r}: equivalent_on needs a why")
            equivalent += 1
            print(f"  equivalent on {sys.platform}, not counted: {entry['name']} ({entry['why']})")
            continue
        counted.append(entry)
    workers = max(1, jobs if jobs is not None else (os.cpu_count() or 1))
    if workers == 1:
        results = [_check(tests_dir, reaper_dir, run_suite, entry) for entry in counted]
    else:
        # spawn on every platform: Windows has only spawn, so the path CI checks on Linux is the one Windows runs.
        with ProcessPoolExecutor(max_workers=workers, mp_context=multiprocessing.get_context("spawn")) as pool:
            results = list(pool.map(_check, *zip(*[(tests_dir, reaper_dir, run_suite, entry) for entry in counted])))
    survivors = [entry["name"] for entry, (outcome, _) in zip(counted, results) if outcome == "survived"]
    for _, line in results:
        print(line)
    checked = len(entries) - equivalent
    print(f"{checked - len(survivors)} of {checked} mutations caught")
    return 1 if survivors else 0
