"""Times one extraction run and writes what it found, so whole-book and per-chapter runs can be compared.

It drives the product's own adapters (``extraction_gliner`` and ``extraction_booknlp`` in the manuscript-guide sidecar), so a
number here is the sidecar's number. One invocation is one configuration, in a process of its own so that peak memory is that
configuration's alone:

* ``--mode whole``: one model, the whole book in one call (what a scan does today).
* ``--mode chapters --workers N``: a pool of N processes, each loading the model once, reading one chunk at a time. A chunk is a
  chapter; with ``--max-words W`` a chapter longer than W words is cut at paragraph boundaries (the bounded-chunk variant).

Wall time is from before the model loads to after the last chunk is read. ``loadSeconds`` is the slowest worker's model load, so
``wallSeconds - loadSeconds`` is the reading. Peak memory is the sum of the resident sets of this process and its children,
sampled every 0.1 s (psutil). Everything text is UTF-8.

Usage::

    python bench_extraction.py --engine booknlp --install DIR --manuscript M.json --mode chapters --workers 2 --out run.json
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any, Self

SIDECAR = Path(__file__).resolve().parents[3] / "src" / "studio" / "sidecars" / "manuscript-guide" / "core"
COMMON = Path(__file__).resolve().parents[3] / "src" / "studio" / "libs" / "python"
for folder in (SIDECAR, COMMON):
    if str(folder) not in sys.path:
        sys.path.insert(0, str(folder))


class PeakMemory:
    """Samples the resident memory of this process and its children until stopped; ``peak`` is the largest sum in bytes."""

    def __init__(self) -> None:
        import psutil

        self.process = psutil.Process()
        self.peak = 0
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)

    def sample(self) -> int:
        total = 0
        for process in [self.process, *self.process.children(recursive=True)]:
            try:
                total += process.memory_info().rss
            except Exception:  # noqa: BLE001, S112 (a child that just exited)
                continue
        return total

    def run(self) -> None:
        while not self.stop.is_set():
            self.peak = max(self.peak, self.sample())
            self.stop.wait(0.1)

    def __enter__(self) -> Self:
        self.thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self.stop.set()
        self.thread.join()
        self.peak = max(self.peak, self.sample())


def chunks_of(paragraphs: list[dict[str, str]], max_words: int | None) -> list[list[dict[str, str]]]:
    """The paragraphs grouped by chapter, in manuscript order; a chapter over ``max_words`` is cut between paragraphs."""
    chapters: list[list[dict[str, str]]] = []
    for paragraph in paragraphs:
        if not chapters or chapters[-1][0]["chapterId"] != paragraph["chapterId"]:
            chapters.append([])
        chapters[-1].append(paragraph)
    if not max_words:
        return chapters
    out: list[list[dict[str, str]]] = []
    for chapter in chapters:
        current: list[dict[str, str]] = []
        size = 0
        for paragraph in chapter:
            words = len(paragraph["text"].split())
            if current and size + words > max_words:
                out.append(current)
                current, size = [], 0
            current.append(paragraph)
            size += words
        out.append(current)
    return out


def paragraphs_of(manuscript: Path) -> list[dict[str, str]]:
    """The narratable paragraphs as the sidecar reads them."""
    import manuscript_guide as guide

    return [{"id": p["paragraphId"], "chapterId": p.get("chapterId", ""), "text": p["text"]} for p in guide.load_manuscript(str(manuscript))]


# ---- the engines ----------------------------------------------------------------------------------------------------------------


def make_extractor(engine: str, install: str, threads: int | None, spacy_model: str) -> Any:
    """The product's extractor over a model loaded from ``install``."""
    if threads:
        import torch

        torch.set_num_threads(threads)
    if engine == "gliner":
        import extraction_gliner as source

        return source.GlinerSource(install).extractor()
    import extraction_booknlp as source

    return source.BookNlpSource(install, loader=lambda folder, variant: source.load_model(folder, variant, spacy_model)).extractor()


WORKER: dict[str, Any] = {}


def start_worker(engine: str, install: str, threads: int | None, spacy_model: str) -> None:
    """Pool initializer: loads the model once in this worker and records how long it took."""
    began = time.perf_counter()
    WORKER["pid"] = os.getpid()
    try:
        WORKER["extractor"] = make_extractor(engine, install, threads, spacy_model)
        WORKER["load_error"] = ""
    except Exception as exc:  # noqa: BLE001 (a pool re-spawns a worker whose initializer raises, forever; report it per chunk instead)
        WORKER["load_error"] = f"{type(exc).__name__}: {exc}"
    WORKER["load"] = time.perf_counter() - began


def read_chunk(job: tuple[int, list[dict[str, str]]]) -> dict[str, Any]:
    """Reads one chunk with the worker's model. A failure is returned, not raised, so the other chunks are kept."""
    index, paragraphs = job
    began = time.perf_counter()
    try:
        if WORKER["load_error"]:
            raise RuntimeError(WORKER["load_error"])
        found = WORKER["extractor"].extract({"paragraphs": paragraphs})
        error = ""
    except Exception as exc:  # noqa: BLE001 (reported per chunk)
        found, error = [], f"{type(exc).__name__}: {exc}"
    return {
        "index": index,
        "seconds": time.perf_counter() - began,
        "words": sum(len(p["text"].split()) for p in paragraphs),
        "load": WORKER["load"],
        "pid": WORKER["pid"],
        "error": error,
        "suggestions": [{**item, "chunk": index} for item in found],
    }


def run(args: argparse.Namespace) -> dict[str, Any]:
    paragraphs = paragraphs_of(args.manuscript)
    words = sum(len(p["text"].split()) for p in paragraphs)
    jobs = [(0, paragraphs)] if args.mode == "whole" else list(enumerate(chunks_of(paragraphs, args.max_words)))
    workers = 1 if args.mode == "whole" else args.workers
    threads = args.threads if args.threads is not None else (None if args.mode == "whole" else max(1, (os.cpu_count() or 1) // workers))
    context = mp.get_context("spawn")
    began = time.perf_counter()
    with PeakMemory() as memory, context.Pool(workers, start_worker, (args.engine, str(args.install), threads, args.spacy_model)) as pool:
        results = list(pool.imap(read_chunk, jobs, chunksize=1))
    wall = time.perf_counter() - began
    results.sort(key=lambda r: r["index"])
    return {
        "engine": args.engine,
        "install": Path(args.install).name,
        "manuscript": args.manuscript.name,
        "mode": args.mode,
        "workers": workers,
        "torchThreads": threads,
        "maxWords": args.max_words,
        "cpus": os.cpu_count(),
        "words": words,
        "chunks": len(jobs),
        "wallSeconds": round(wall, 2),
        "loadSeconds": round(max(r["load"] for r in results), 2),
        "peakGB": round(memory.peak / 1e9, 2),
        "failedChunks": [r["index"] for r in results if r["error"]],
        "errors": [r["error"] for r in results if r["error"]],
        "chunkSeconds": [round(r["seconds"], 2) for r in results],
        "chunkWords": [r["words"] for r in results],
        "suggestions": [s for r in results for s in r["suggestions"]],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--engine", required=True, choices=("gliner", "booknlp"))
    parser.add_argument("--install", required=True, type=Path)
    parser.add_argument("--manuscript", required=True, type=Path)
    parser.add_argument("--mode", required=True, choices=("whole", "chapters"))
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--max-words", type=int, default=None, help="cut a chapter longer than this at a paragraph boundary")
    parser.add_argument("--threads", type=int, default=None, help="torch threads per process (default: all for whole, cpus/workers for chapters)")
    parser.add_argument("--spacy-model", default="en_core_web_sm")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    outcome = run(args)
    args.out.write_text(json.dumps(outcome, ensure_ascii=False), encoding="utf-8")
    brief = {k: v for k, v in outcome.items() if k not in ("suggestions", "chunkSeconds", "chunkWords")}
    print(json.dumps(brief, ensure_ascii=False))


if __name__ == "__main__":
    main()
