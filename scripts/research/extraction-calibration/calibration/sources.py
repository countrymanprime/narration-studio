"""The sources the protocol compares. Each run returns a ``SourceRun``: the items, or `not run` with the sentence why."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

NOT_RUN = "not run"
TIMEOUT_SECONDS = 3600


@dataclass
class SourceRun:
    name: str
    status: str  # "ran", "not run" or "fake"
    reason: str = ""
    items: list[dict[str, Any]] = field(default_factory=list)
    versions: dict[str, str] = field(default_factory=dict)
    command: str = ""
    items_by_book: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    def summary(self) -> dict[str, Any]:
        """The run without its items, as the report and results.json hold it."""
        return {"name": self.name, "status": self.status, "reason": self.reason, "versions": self.versions, "command": self.command}


def not_run(name: str, reason: str) -> SourceRun:
    return SourceRun(name, NOT_RUN, reason)


def parse_lines(text: str) -> list[dict[str, Any]]:
    """Suggestions from JSON lines, or one JSON list; a line that is not a suggestion object is an error."""
    text = text.strip()
    rows = json.loads(text) if text.startswith("[") else [json.loads(line) for line in text.splitlines() if line.strip()]
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("payload"), dict):
            raise TypeError("a suggestion line has no payload object")
    return rows


def wheel_version(install: Path, wheel: str, package: str) -> str:
    """The version of ``package`` in ``install/<wheel>``, from its metadata without importing it ('unknown' if absent)."""
    for metadata in sorted((install / wheel).glob(f"{package}-*.dist-info/METADATA")):
        for line in metadata.read_text(encoding="utf-8").splitlines():
            if line.startswith("Version:"):
                return line.split(":", 1)[1].strip()
    return "unknown"


def run_suggest(name: str, repo: Path, manuscript: Path, source: str, extra: list[str], versions: dict[str, str]) -> SourceRun:
    """The sidecar's own ``suggest`` command, as the host runs it, so what is scored is what the app would be offered."""
    core = repo / "sidecars" / "manuscript-guide" / "core"
    # -I ignores PYTHONPATH, so the sidecar's folder and the shared libraries go onto sys.path through -c.
    launcher = "import sys,runpy;sys.path[:0]=sys.argv[1:3];sys.argv=sys.argv[3:];runpy.run_path(sys.argv[0],run_name='__main__')"
    args = [
        str(core / "manuscript_guide.py"),
        "suggest",
        "--source",
        source,
        "--manuscript",
        str(manuscript),
        "--guide",
        str(manuscript.parent / "no-story-bible.json"),
        *extra,
    ]
    command = [sys.executable, "-I", "-c", launcher, str(core), str(repo / "libs" / "python"), *args]
    env = os.environ | {"PYTHONIOENCODING": "utf-8"}
    try:
        done = subprocess.run(command, capture_output=True, text=True, timeout=TIMEOUT_SECONDS, env=env, check=False)
    except subprocess.TimeoutExpired:
        return not_run(name, f"{name} did not finish in {TIMEOUT_SECONDS} seconds.")
    if done.returncode != 0:
        last = (done.stderr.strip().splitlines() or ["no message"])[-1]
        return not_run(name, f"{name} failed to run: {last}")
    return SourceRun(name, "ran", items=parse_lines(done.stdout), versions=versions, command="manuscript_guide.py " + " ".join(args[1:]))


def run_rules(repo: Path, manuscript: Path, commit: str) -> SourceRun:
    return run_suggest("rules", repo, manuscript, "rules", [], {"app commit": commit})


def run_installed(name: str, repo: Path, manuscript: Path, source: str, install: str | None, wheel: str, package: str, spacy_model: str = "") -> SourceRun:
    """GLiNER or BookNLP from an install folder; without one it is `not run` with a sentence, never an error."""
    if not install or not Path(install).is_dir():
        return not_run(name, f"{name} is not installed here (no install folder was given), so it was not run.")
    folder = Path(install)
    extra = ["--install", str(folder)] + (["--spacy-model", spacy_model] if spacy_model else [])
    return run_suggest(name, repo, manuscript, source, extra, {package: wheel_version(folder, wheel, package)})


def read_import(path: str | None) -> SourceRun:
    """An imported LLM file: suggestion lines produced from the app's prompt template. Its SHA-256 is the version."""
    if not path or not Path(path).is_file():
        return not_run("imported file", "No imported LLM file was given, so it was not run.")
    raw = Path(path).read_bytes()
    try:
        items = parse_lines(raw.decode("utf-8"))
    except (ValueError, TypeError, UnicodeDecodeError) as error:
        return not_run("imported file", f"The imported file could not be read: {error}")
    return SourceRun("imported file", "ran", items=items, versions={"sha256": hashlib.sha256(raw).hexdigest()}, command=f"import {Path(path).name}")
