"""Times GLiNER and BookNLP run at the same time against the same two run one after the other (what a scan does today).

Each engine reads the whole book in a process of its own, with torch limited to ``--threads`` threads (default: half the
processors). The sequential baseline is the two whole-book runs ``run_benchmark.py`` already wrote. Run it after the benchmark
matrix: it must have the machine to itself.

Usage: ``python run_pipeline.py --books DIR --installs DIR --runs DIR [--weights small]``; writes ``<book>.pipeline.<weights>.json``.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--books", required=True, type=Path)
    parser.add_argument("--installs", required=True, type=Path)
    parser.add_argument("--runs", required=True, type=Path)
    parser.add_argument("--weights", default="small", choices=("small", "big"))
    parser.add_argument("--threads", type=int, default=max(1, (os.cpu_count() or 2) // 2))
    parser.add_argument("--only-books", nargs="*")
    args = parser.parse_args()
    for book in sorted(json.loads((args.books / "books.json").read_text(encoding="utf-8")), key=lambda b: b["words"]):
        if args.only_books and book["id"] not in args.only_books:
            continue
        out = args.runs / f"{book['id']}.pipeline.{args.weights}.json"
        if out.is_file():
            continue
        runs = {"gliner": args.installs / "gliner", "booknlp": args.installs / f"booknlp-{args.weights}"}
        began = time.perf_counter()
        procs = {}
        for engine, install in runs.items():
            result = args.runs / f"{book['id']}.pipe-{engine}.tmp"
            command = [
                sys.executable, "-I", str(HERE / "bench_extraction.py"), "--engine", engine, "--install", str(install),
                "--manuscript", str(args.books / f"{book['id']}.manuscript.json"), "--mode", "whole",
                "--threads", str(args.threads), "--out", str(result),
            ]  # fmt: skip
            procs[engine] = (subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8"), result)
        walls, peak = {}, {}
        for engine, (proc, result) in procs.items():
            proc.communicate()
            walls[engine] = round(time.perf_counter() - began, 2)
            if proc.returncode == 0:
                peak[engine] = json.loads(result.read_text(encoding="utf-8"))["peakGB"]
            result.unlink(missing_ok=True)
        wall = round(time.perf_counter() - began, 2)
        prefix = "booknlp-small" if args.weights == "small" else "booknlp-big"
        sequential = sum(json.loads((args.runs / f"{book['id']}.{row}.whole.w1.json").read_text(encoding="utf-8"))["wallSeconds"] for row in ("gliner", prefix))
        record = {"book": book["id"], "weights": args.weights, "threadsEach": args.threads, "wallSeconds": wall, "finishedAt": walls,
                  "peakGBEach": peak, "sequentialSeconds": round(sequential, 2), "speedup": round(sequential / wall, 2)}  # fmt: skip
        out.write_text(json.dumps(record), encoding="utf-8")
        print(json.dumps(record), flush=True)


if __name__ == "__main__":
    main()
