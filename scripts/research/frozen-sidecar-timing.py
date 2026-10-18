"""Times the frozen (PyInstaller --onedir) sidecars' start-up, to split it into the bootloader, the imports and the work.

Run after ``uv run python scripts/release/prepare-resources.py`` has frozen the sidecars into ``.release-build/<name>/dist``:

    uv run python scripts/research/frozen-sidecar-timing.py --out-dir <folder>

For a frozen "hello" program built here with the same PyInstaller (the floor: bootloader, interpreter start and a ``print``), and for each
sidecar's ``--help`` (every module-level import plus argparse, no work), it records the wall time of whole launches from a fresh copy of the
folder (launch 1 meets cold files and any antivirus scan; launches 2 to N do not), then the import profile of the sidecar. It writes
``timing.json``, ``timing.md`` and the raw ``importtime-*.txt`` files to ``--out-dir``. The work part of an operation is its Go-harness time
(``apps/desktop/internal/latency``) minus the ``--help`` time. A research tool, not product code
(docs/research/2026-10-18-sidecar-start-up-and-bridge-round-trip.md).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SIDECARS = {
    "manuscript-guide": ROOT / "sidecars/manuscript-guide/core/manuscript_guide.py",
    "transcript-compare": ROOT / "sidecars/transcript-compare/core/compare.py",
    "manuscript-teleprompter": ROOT / "sidecars/manuscript-teleprompter/core/live_asr.py",
}
EXE_SUFFIX = ".exe" if sys.platform == "win32" else ""


def log(message: str) -> None:
    print(message, flush=True)


def launch(command: list[str], env: dict[str, str] | None = None) -> tuple[float, int, str]:
    """One whole launch in milliseconds, its exit code and its stderr."""
    start = time.perf_counter()
    done = subprocess.run(command, capture_output=True, env=env, cwd=tempfile.gettempdir(), timeout=300, check=False)
    took = (time.perf_counter() - start) * 1000.0
    return took, done.returncode, done.stderr.decode("utf-8", errors="replace")


def summarize(values: list[float]) -> dict[str, float]:
    ordered = sorted(values)
    return {"p50": statistics.median(ordered), "p95": ordered[min(len(ordered) - 1, int(len(ordered) * 0.95 + 0.5))], "max": ordered[-1], "min": ordered[0]}


def freeze_hello(work: Path) -> Path:
    """The smallest frozen program there is, built with the PyInstaller that froze the sidecars."""
    work.mkdir(parents=True, exist_ok=True)
    source = work / "hello.py"
    source.write_text("print('x')\n", encoding="utf-8")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--onedir",
            "--name",
            "hello",
            "--distpath",
            str(work / "dist"),
            "--workpath",
            str(work / "build"),
            "--specpath",
            str(work),
            str(source),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return work / "dist" / "hello"


def measure_folder(label: str, folder: Path, exe_name: str, arguments: list[str], launches: int, fresh_copies: int, scratch: Path) -> dict:
    """Launch 1 of each of `fresh_copies` new copies of the folder (new files: cold cache, a scanner's first look), then launches 2..N of the last."""
    first, rest, codes = [], [], set()
    for copy_index in range(fresh_copies):
        target = scratch / f"{re.sub(r'[^A-Za-z0-9_.-]+', '-', label)}-copy{copy_index}"
        shutil.copytree(folder, target)
        command = [str(target / exe_name), *arguments]
        for index in range(launches):
            took, code, _ = launch(command)
            codes.add(code)
            (first if index == 0 else rest).append(took)
    later = min(launches, 10) - 2  # launch 10 (or the last, in a short run) of each copy, as an index into that copy's launches 2..N
    tenth = [rest[i * (launches - 1) + later] for i in range(fresh_copies)]
    result = {
        "label": label,
        "launch_1_ms": summarize(first),
        "launch_10_ms": summarize(tenth),
        "launches_2_to_n_ms": summarize(rest),
        "exit_codes": sorted(codes),
        "files": sum(1 for entry in folder.rglob("*") if entry.is_file()),
        "megabytes": round(sum(entry.stat().st_size for entry in folder.rglob("*") if entry.is_file()) / 1e6, 1),
    }
    log(
        f"{label}: launch 1 p50 {result['launch_1_ms']['p50']:.0f} ms, launch 10 p50 {result['launch_10_ms']['p50']:.0f} ms, 2..N p50 {result['launches_2_to_n_ms']['p50']:.0f} ms"
    )
    return result


IMPORT_LINE = re.compile(r"^import time:\s+(\d+)\s+\|\s+(\d+)\s+\|\s(\s*)(\S.*)$")


def parse_importtime(text: str) -> dict:
    """Top-level imports (no indentation) with their cumulative microseconds, largest first, and their sum."""
    modules: list[tuple[int, str]] = []
    for line in text.splitlines():
        match = IMPORT_LINE.match(line)
        if match and not match.group(3):
            modules.append((int(match.group(2)), match.group(4)))
    modules.sort(reverse=True)
    return {
        "total_ms": round(sum(cumulative for cumulative, _ in modules) / 1000.0, 1),
        "count": len(modules),
        "top": [[name, round(cumulative / 1000.0, 1)] for cumulative, name in modules[:15]],
    }


def profile_imports(name: str, exe: Path, out_dir: Path) -> dict:
    """The frozen program's own import profile if the bootloader honours PYTHONPROFILEIMPORTTIME; the dev interpreter's otherwise (and always, for comparison)."""
    report: dict = {}
    _, _, stderr = launch([str(exe), "--help"], env={**os.environ, "PYTHONPROFILEIMPORTTIME": "1"})
    (out_dir / f"importtime-{name}-frozen-env.txt").write_text(stderr, encoding="utf-8")
    frozen = parse_importtime(stderr)
    report["frozen_env_var_honoured"] = frozen["count"] > 0
    if frozen["count"] > 0:
        report["frozen"] = frozen
    _, _, stderr = launch(
        [sys.executable, "-X", "importtime", str(SIDECARS[name]), "--help"],
        env={**os.environ, "PYTHONPATH": os.pathsep.join([str(ROOT / "libs/python"), str(SIDECARS[name].parent)])},
    )
    (out_dir / f"importtime-{name}-dev.txt").write_text(stderr, encoding="utf-8")
    report["dev_interpreter"] = parse_importtime(stderr)
    return report


def frozen_with_importtime(name: str, scratch: Path) -> Path | None:
    """Re-freezes from the sidecar's generated spec with ``-X importtime`` built in, when the env var is ignored by the bootloader."""
    spec = ROOT / ".release-build" / name / "spec" / f"{name}.spec"
    if not spec.is_file():
        return None
    text = spec.read_text(encoding="utf-8")
    patched, count = re.subn(r"(exe = EXE\(\s*pyz,\s*a\.scripts,\s*)\[\]", r"\1[('X importtime', None, 'OPTION')]", text, count=1)
    if count != 1:
        return None
    variant = scratch / f"{name}-importtime.spec"
    variant.write_text(patched, encoding="utf-8")
    done = subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--distpath",
            str(scratch / "variant-dist"),
            "--workpath",
            str(scratch / "variant-work"),
            str(variant),
        ],
        cwd=ROOT / ".release-build" / name / "spec",
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    folder = scratch / "variant-dist" / name
    return folder if done.returncode == 0 and (folder / f"{name}{EXE_SUFFIX}").is_file() else None


def table(report: dict) -> str:
    lines = ["| Program | Launch 1, fresh copy (ms) | Launch 10 (ms) | Launches 2..N p50 (ms) | p95 (ms) | Folder |", "| --- | --- | --- | --- | --- | --- |"]
    for row in report["launches"]:
        lines.append(
            f"| {row['label']} | {row['launch_1_ms']['p50']:.0f} (max {row['launch_1_ms']['max']:.0f}) | {row['launch_10_ms']['p50']:.0f} | "
            f"{row['launches_2_to_n_ms']['p50']:.0f} | {row['launches_2_to_n_ms']['p95']:.0f} | {row['files']} files, {row['megabytes']} MB |"
        )
    lines += ["", "| Sidecar | Import profile | Top-level imports (ms, cumulative) | Largest |", "| --- | --- | --- | --- |"]
    for name, profile in report["imports"].items():
        for kind in ("frozen", "frozen_importtime_build", "dev_interpreter"):
            if kind in profile:
                top = ", ".join(f"{module} {ms}" for module, ms in profile[kind]["top"][:5])
                lines.append(f"| {name} | {kind} | {profile[kind]['total_ms']} | {top} |")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--launches", type=int, default=12, help="launches per fresh copy (launch 1 is the cold one)")
    parser.add_argument("--fresh-copies", type=int, default=3)
    parser.add_argument("--sidecars", default=",".join(SIDECARS))
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    report: dict = {
        "platform": sys.platform,
        "python": sys.version.split()[0],
        "pyinstaller": subprocess.run([sys.executable, "-m", "PyInstaller", "--version"], capture_output=True, text=True, check=False).stdout.strip(),
        "launches": [],
        "imports": {},
        "dev_interpreter_floor_ms": None,
    }
    with tempfile.TemporaryDirectory(prefix="frozen-timing-") as temp:
        scratch = Path(temp)
        report["dev_interpreter_floor_ms"] = summarize([launch([sys.executable, "-c", "pass"])[0] for _ in range(15)])["p50"]
        hello = freeze_hello(scratch / "hello-build")
        report["launches"].append(
            measure_folder("hello (floor: bootloader, interpreter, print)", hello, f"hello{EXE_SUFFIX}", [], args.launches, args.fresh_copies, scratch)
        )
        for name in args.sidecars.split(","):
            folder = ROOT / ".release-build" / name / "dist" / name
            if not (folder / f"{name}{EXE_SUFFIX}").is_file():
                log(f"{name}: no frozen build in {folder}; skipped")
                continue
            report["launches"].append(measure_folder(f"{name} --help", folder, f"{name}{EXE_SUFFIX}", ["--help"], args.launches, args.fresh_copies, scratch))
            profile = profile_imports(name, folder / f"{name}{EXE_SUFFIX}", args.out_dir)
            if not profile["frozen_env_var_honoured"] and name == "manuscript-guide":
                variant = frozen_with_importtime(name, scratch)
                if variant is not None:
                    _, _, stderr = launch([str(variant / f"{name}{EXE_SUFFIX}"), "--help"])
                    (args.out_dir / f"importtime-{name}-frozen-build.txt").write_text(stderr, encoding="utf-8")
                    profile["frozen_importtime_build"] = parse_importtime(stderr)
            report["imports"][name] = profile
    (args.out_dir / "timing.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    markdown = (
        f"Python {report['python']}, PyInstaller {report['pyinstaller']}, {report['platform']}; dev interpreter `-c pass` p50 {report['dev_interpreter_floor_ms']:.0f} ms\n\n"
        + table(report)
    )
    (args.out_dir / "timing.md").write_text(markdown, encoding="utf-8")
    log(markdown)
    return 0


if __name__ == "__main__":
    sys.exit(main())
