"""Downloads the model files of GLiNER and BookNLP (small and large) into install folders, as the app's Analysis tools do.

The files and their SHA-256 sums come from ``config/analysis-assets.json``. The wheels are not downloaded (their folders are left empty): the benchmark
imports the Python packages from the environment it runs in (``pip install torch gliner booknlp==1.0.8 psutil pyarrow``).
Usage: ``python setup_installs.py --out DIR``. Every file is written to ``DIR/<tool id>/``; a file that is already there with the
right sum is kept.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
CATALOG = REPO / "config" / "analysis-assets.json"
TOOLS = ("gliner", "booknlp-small", "booknlp-big")


def sha256(path: Path) -> str:
    """The SHA-256 of ``path``, read in blocks."""
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def fetch(url: str, target: Path, expected: str) -> None:
    """Downloads ``url`` to ``target`` and checks its sum."""
    if target.is_file() and sha256(target) == expected:
        return
    with urllib.request.urlopen(url) as reply, target.open("wb") as file:
        while block := reply.read(1 << 20):
            file.write(block)
    if sha256(target) != expected:
        target.unlink()
        raise SystemExit(f"{target.name}: the download does not match the catalog's SHA-256")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--tools", nargs="*", default=list(TOOLS), choices=TOOLS)
    args = parser.parse_args()
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    for tool in catalog["tools"]:
        if tool["id"] not in args.tools:
            continue
        folder = args.out / tool["id"]
        folder.mkdir(parents=True, exist_ok=True)
        # The adapters look for the unpacked wheel's folder; here the package comes from the environment, so it is empty.
        (folder / ("wheel-gliner" if tool["id"] == "gliner" else "wheel-booknlp")).mkdir(exist_ok=True)
        for item in tool["files"]:
            if item["name"].endswith(".whl"):
                continue
            print(f"{tool['id']}/{item['name']}", file=sys.stderr)
            fetch(item["url"], folder / item["name"], item["sha256"])


if __name__ == "__main__":
    main()
