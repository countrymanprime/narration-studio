#!/usr/bin/env python3
"""Create embedded Wails resources from approved local inputs.

The build intentionally freezes only first-party command entry points. Optional
models and voices remain first-use downloads and must never be copied into a
release without an approved provenance entry.
"""

from __future__ import annotations

import argparse
import ast
import os
import shutil
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parents[2]

# Repo-relative locations of everything this script reads or writes. A layout change edits these
# lines and nothing else (see docs/architecture/codebase-map.md).
PYTHON_LIB_DIR = Path("src/studio/libs/python")
CONFIG_DIR = Path("config")
REAPER_DIR = Path("src/studio/integrations/reaper")
SIDECARS_DIR = Path("src/studio/sidecars")
RESOURCES_DIR = Path("src/studio/desktop/cmd/app/resources")

RESOURCES = ROOT / RESOURCES_DIR
RUNTIME = RESOURCES / "runtime"
# The packages of the optional analysis tools, which a sidecar loads from the asset registry's install folder.
OPTIONAL_TOOL_MODULES = ("gliner", "booknlp", "transformers", "torch")


# What those packages import that the guide itself does not, and the metadata transformers checks: the BookNLP adapter keeps the list
# (FREEZE_IMPORTS, FREEZE_IMPORTS_WINDOWS, FREEZE_METADATA), and its `self-check` line `tool-runtime` proves the freeze carries them.
def _adapter_tuple(name: str) -> tuple[str, ...]:
    """A tuple of strings the BookNLP adapter assigns at its top level, read without importing it (it needs the sidecar's packages)."""
    tree = ast.parse((ROOT / SIDECARS_DIR / "manuscript-guide" / "core" / "extraction_booknlp.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == name for target in node.targets):
            return tuple(ast.literal_eval(node.value))
    raise LookupError(f"extraction_booknlp.py assigns no {name}")


OPTIONAL_TOOL_IMPORTS = _adapter_tuple("FREEZE_IMPORTS") + (_adapter_tuple("FREEZE_IMPORTS_WINDOWS") if sys.platform == "win32" else ())
OPTIONAL_TOOL_METADATA = _adapter_tuple("FREEZE_METADATA")
REAPER = RESOURCES / "reaper"

# The freezes run at the same time, so their output is written one whole line at a time.
_PRINT_LOCK = threading.Lock()


class Sidecar(NamedTuple):
    name: str
    entry: Path
    paths: list[Path]
    collect_data: tuple[str, ...] = ()
    copy_metadata: tuple[str, ...] = ()
    collect_binaries: tuple[str, ...] = ()
    exclude_modules: tuple[str, ...] = ()
    hidden_imports: tuple[str, ...] = ()


def emit(text: str) -> None:
    """Write to stdout without ever failing on a character the console encoding cannot show (cp1252 on Windows)."""
    encoding = sys.stdout.encoding or "utf-8"
    with _PRINT_LOCK:
        sys.stdout.write(text.encode(encoding, errors="replace").decode(encoding))
        sys.stdout.flush()


def build_dir(name: str) -> Path:
    return ROOT / ".release-build" / name


def frozen_executable(name: str) -> Path:
    return build_dir(name) / "dist" / name / (f"{name}.exe" if sys.platform == "win32" else name)


def reusable(name: str) -> bool:
    """A finished freeze is its executable plus the two tables of contents that scripts/licenses/notices.py reads."""
    tocs = build_dir(name) / "work" / name
    return frozen_executable(name).is_file() and all((tocs / toc).is_file() for toc in ("Analysis-00.toc", "PYZ-00.toc"))


def install_runtime(name: str) -> None:
    source = frozen_executable(name)
    shutil.copytree(source.parent, RUNTIME / name, dirs_exist_ok=True)
    executable = RUNTIME / name / source.name
    if sys.platform != "win32":
        executable.chmod(executable.stat().st_mode | 0o111)


def reuse(name: str) -> None:
    emit(f"[{name}] reusing the cached freeze in {build_dir(name).relative_to(ROOT).as_posix()}\n")
    install_runtime(name)


def freeze(
    name: str,
    entry: Path,
    paths: list[Path],
    collect_data: tuple[str, ...] = (),
    copy_metadata: tuple[str, ...] = (),
    collect_binaries: tuple[str, ...] = (),
    exclude_modules: tuple[str, ...] = (),
    hidden_imports: tuple[str, ...] = (),
) -> None:
    work = build_dir(name)
    args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--name",
        name,
        "--distpath",
        str(work / "dist"),
        "--workpath",
        str(work / "work"),
        "--specpath",
        str(work / "spec"),
    ]
    for path in paths:
        args.extend(["--paths", str(path)])
    for package in collect_data:
        args.extend(["--collect-data", package])
    for package in copy_metadata:
        args.extend(["--copy-metadata", package])
    for package in collect_binaries:
        args.extend(["--collect-binaries", package])
    for module in exclude_modules:
        args.extend(["--exclude-module", module])
    for module in hidden_imports:
        args.extend(["--hidden-import", module])
    args.append(str(entry))
    # `--clean` wipes PyInstaller's cache directory, which every run shares by default. With the freezes
    # running at once, that would delete files another one is reading, so each gets a cache of its own.
    cache = work / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    # PYTHONIOENCODING: the pipe is read as UTF-8 below, whatever the Windows locale would have written.
    env = {**os.environ, "PYINSTALLER_CONFIG_DIR": str(cache), "PYTHONIOENCODING": "utf-8"}
    # Streamed line by line, each tagged with its sidecar, so the log stays live and readable while three run at once.
    with subprocess.Popen(args, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace") as process:
        for line in process.stdout:
            emit(f"[{name}] {line}")
    if process.returncode != 0:
        raise subprocess.CalledProcessError(process.returncode, args)
    source = frozen_executable(name)
    if not source.is_file():
        raise RuntimeError(f"PyInstaller did not produce {source}")
    install_runtime(name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clean", action="store_true")
    parser.add_argument(
        "--sidecar", choices=["manuscript-guide", "transcript-compare", "manuscript-teleprompter"], help="build one sidecar while diagnosing a platform package"
    )
    # CI restores .release-build from a cache keyed on a hash of every input of the freeze (.github/actions/build-native) and passes
    # --reuse only on an exact hit. A developer's .release-build can be stale, so the flag is never a default.
    parser.add_argument("--reuse", action="store_true", help="install a finished freeze already in .release-build instead of freezing that sidecar again")
    args = parser.parse_args()
    if args.clean:
        shutil.rmtree(RESOURCES, ignore_errors=True)
    if not args.sidecar:
        shutil.rmtree(RUNTIME, ignore_errors=True)
    shared_python = ROOT / PYTHON_LIB_DIR
    sidecars_root = ROOT / SIDECARS_DIR
    sidecars = [
        # Piper speaks through its bundled espeak-ng and needs piper/espeak-ng-data (about 19 MB, plus a few MB of other Piper data);
        # the CMU dictionary (cmudict, read by pronouncing) needs its data file and its package metadata (it reads its own version).
        # PyInstaller has no hook for either: without them a frozen preview could not speak, and the frozen guide logged "CMU
        # pronunciation unavailable (No package metadata was found for cmudict)". the program's `--smoke` runs `manuscript-guide
        # self-check` to prove both load. (The other log line, "eSpeak phonetic fallback unavailable", is the phonemizer package
        # wanting a system libespeak-ng that no build has, on a dev machine too; data files do not fix it.)
        # The optional GLiNER and BookNLP downloads (extraction_gliner.py, extraction_booknlp.py) are imported at run time
        # from the folder the asset registry installed them in, never from the freeze. Their imports are plain
        # ones PyInstaller would follow on a build machine that has the packages, pulling in about 5 GB of torch and
        # transformers, so the four are excluded; verify-installable.mjs checks none of them is in the tree.
        Sidecar(
            "manuscript-guide",
            sidecars_root / "manuscript-guide" / "core" / "manuscript_guide.py",
            [shared_python, sidecars_root / "manuscript-guide" / "core"],
            ("piper", "cmudict"),
            ("cmudict", *OPTIONAL_TOOL_METADATA),
            exclude_modules=OPTIONAL_TOOL_MODULES,
            hidden_imports=OPTIONAL_TOOL_IMPORTS,
        ),
        # faster-whisper ships its Silero VAD model (assets/silero_vad_v6.onnx) as
        # package data and PyInstaller has no hook for it. Without collecting it, a
        # frozen sidecar that uses vad_filter=True fails with NoSuchFile at runtime.
        Sidecar(
            "transcript-compare",
            sidecars_root / "transcript-compare" / "core" / "compare.py",
            [shared_python, sidecars_root / "transcript-compare" / "core"],
            ("faster_whisper",),
        ),
        # live_asr.py imports chapter_script, control_channel, levels, moonshine_engine, locate and align_word
        # (siblings) inside functions; PyInstaller finds them because their directory is on --paths, and chapter_script's
        # narration_common modules through the shared one. The Booth's tracker and flags are the host's (internal/scripttrack).
        # The Moonshine engine (moonshine_voice, Windows only in pyproject.toml) loads its native
        # moonshine.dll, and the onnxruntime.dll beside it, with ctypes from its own package directory.
        # PyInstaller cannot see a ctypes load, so the binaries are collected by hand; its data (sample
        # WAVs, TTS embeddings) is not, since the sidecar loads models only from a catalog install.
        # One of its dependencies is excluded: google_crc32c, an optional speed-up of its downloader's
        # checksum, which the frozen sidecar never runs (moonshine_engine.py).
        # sounddevice (PortAudio) is the built-in recorder's engine, the capture port's wasapi row
        # (capture_wasapi.py), so it is in the build: its DLL
        # (_sounddevice_data/portaudio-binaries, about 2 MB) is loaded with ctypes, and PyInstaller's own
        # sounddevice hook (pyinstaller-hooks-contrib) collects it. verify-installable.mjs checks all three
        # DLLs are in the tree, and the program's `--smoke` runs `manuscript-teleprompter --capabilities --verify`
        # to prove Moonshine's load.
        Sidecar(
            "manuscript-teleprompter",
            sidecars_root / "manuscript-teleprompter" / "core" / "live_asr.py",
            [shared_python, sidecars_root / "manuscript-teleprompter" / "core"],
            ("faster_whisper",),
            collect_binaries=("moonshine_voice",) if sys.platform == "win32" else (),
            exclude_modules=("google_crc32c",),
        ),
    ]
    selected = [sidecar for sidecar in sidecars if args.sidecar in (None, sidecar.name)]
    # Each freeze is one mostly single-threaded PyInstaller process with its own work and output
    # directories, so they run side by side instead of one after another.
    with ThreadPoolExecutor(max_workers=len(selected)) as pool:
        futures = {
            sidecar.name: pool.submit(reuse, sidecar.name) if args.reuse and reusable(sidecar.name) else pool.submit(freeze, *sidecar) for sidecar in selected
        }
    # The pool has drained, so every freeze has finished: report all failures, not just the first.
    failures = {name: error for name, future in futures.items() if (error := future.exception())}
    if failures:
        emit(f"Freeze failed for: {', '.join(failures)}\n")
        raise next(iter(failures.values()))
    shutil.copytree(ROOT / CONFIG_DIR, RESOURCES / "config", dirs_exist_ok=True)
    # The action package is embedded with the desktop host.  At first launch
    # the host materializes it in its per-user cache and writes the installed
    # executable path beside it.  REAPER imports only when the narrator asks.
    # The harness (tests/), the spike scripts (spikes/), the Nx project file and Python caches stay behind.
    shutil.copytree(ROOT / REAPER_DIR, REAPER, dirs_exist_ok=True, ignore=shutil.ignore_patterns("tests", "spikes", "project.json", "__pycache__"))


if __name__ == "__main__":
    main()
