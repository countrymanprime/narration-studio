"""Runs the whole benchmark matrix, one configuration at a time, and writes each run to ``--runs``.

For each book and engine it runs: the book whole; per chapter with 1, 2 and 4 workers; and per chapter cut at ``--bounded-words``
with 4 workers (skipped for the longest books). A run whose result file exists is skipped, so an interrupted benchmark resumes.
Configurations run strictly one after another: they share the machine's cores, so running two at once would time neither.

Usage (after ``prepare_books.py`` and ``setup_installs.py``)::

    python run_benchmark.py --books DIR --installs DIR --runs DIR [--engines gliner booknlp-small booknlp-big]

``--installs`` holds one folder per engine row: ``gliner``, ``booknlp-small``, ``booknlp-big``. On a machine with the app
installed these can be the app's own install folders. Then run ``report.py --runs DIR --books DIR`` for the tables.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINES = {"gliner": "gliner", "booknlp-small": "booknlp", "booknlp-big": "booknlp"}
# The large weights take about 3 GB a worker; a configuration is skipped when workers * the one-worker per-chapter peak would not fit.
MEMORY_SHARE = 0.7
LONG_BOOK_WORDS = 90_000


def total_memory_gb() -> float:
    import psutil

    return psutil.virtual_memory().total / 1e9


def configurations(words: int, bounded_words: int) -> list[tuple[str, int, int | None]]:
    """(mode, workers, max words per chunk) for a book of ``words`` words."""
    out: list[tuple[str, int, int | None]] = [("whole", 1, None), ("chapters", 1, None), ("chapters", 2, None), ("chapters", 4, None)]
    if words <= LONG_BOOK_WORDS:
        out.append(("chapters", 4, bounded_words))
    return out


def name_of(book: str, row: str, mode: str, workers: int, bound: int | None) -> str:
    return f"{book}.{row}.{mode}.w{workers}" + (f".max{bound}" if bound else "") + ".json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--books", required=True, type=Path)
    parser.add_argument("--installs", required=True, type=Path)
    parser.add_argument("--runs", required=True, type=Path)
    parser.add_argument("--engines", nargs="*", default=list(ENGINES), choices=list(ENGINES))
    parser.add_argument("--only-books", nargs="*", help="Gutenberg numbers; default is every book in books.json")
    parser.add_argument("--bounded-words", type=int, default=1500)
    parser.add_argument("--big-up-to-words", type=int, default=65_000, help="the large BookNLP weights are run on books up to this size")
    parser.add_argument("--python", default=sys.executable)
    args = parser.parse_args()
    args.runs.mkdir(parents=True, exist_ok=True)
    books = sorted(json.loads((args.books / "books.json").read_text(encoding="utf-8")), key=lambda b: b["words"])
    for book in books:
        if args.only_books and book["id"] not in args.only_books:
            continue
        for row in args.engines:
            if row == "booknlp-big" and book["words"] > args.big_up_to_words:
                print(f"skip {book['id']} {row}: {book['words']} words is over --big-up-to-words", flush=True)
                continue
            whole_peak = 0.0
            for mode, workers, bound in configurations(book["words"], args.bounded_words):
                out = args.runs / name_of(book["id"], row, mode, workers, bound)
                if out.is_file():
                    if mode == "chapters" and workers == 1:
                        whole_peak = json.loads(out.read_text(encoding="utf-8")).get("peakGB", 0.0)
                    continue
                if whole_peak and workers * whole_peak > MEMORY_SHARE * total_memory_gb():
                    note = {"skipped": f"{workers} workers x {whole_peak} GB would not fit in {total_memory_gb():.0f} GB"}
                    out.with_suffix(".skipped.json").write_text(json.dumps(note), encoding="utf-8")
                    print(f"skip {out.name}: {note['skipped']}", flush=True)
                    continue
                command = [
                    args.python, "-I", str(HERE / "bench_extraction.py"),
                    "--engine", ENGINES[row], "--install", str(args.installs / row),
                    "--manuscript", str(args.books / f"{book['id']}.manuscript.json"),
                    "--mode", mode, "--workers", str(workers), "--out", str(out),
                ]  # fmt: skip
                if bound:
                    command += ["--max-words", str(bound)]
                began = time.time()
                done = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", check=False)
                print(f"{out.name}: exit {done.returncode} in {time.time() - began:.0f}s", flush=True)
                if done.returncode != 0:
                    print(done.stderr[-2000:], file=sys.stderr, flush=True)
                elif mode == "chapters" and workers == 1:
                    whole_peak = json.loads(out.read_text(encoding="utf-8"))["peakGB"]


if __name__ == "__main__":
    main()
