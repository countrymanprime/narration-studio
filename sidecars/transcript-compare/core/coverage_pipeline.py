"""The recording check's worker budget and its pipelined model cascade (docs/design/recording-check-pipeline.md).

Two things live here, both inside one sidecar process:

- The **budget**: how many items each model transcribes at once and how many CPU threads each of those
  gets, so that `workers * threads` summed over both models never passes the computer's processors.
  A model is loaded once per process and shared by its workers (faster-whisper's `num_workers`), so a
  worker costs threads, not a second copy of the weights. A GPU takes one worker per model and one call
  at a time (`shared_instance`).
- The **pipeline**: the small model's workers transcribe the items; as each item's words file is
  final, its doubtful passages (`coverage_mode.unsure_runs`) go to the large model's workers, which
  splice them into the same file. The chapter is aligned once, when both are done.

What the pipeline cannot do is re-check the passages the first pass left *missing*: those are known only
after the whole chapter is aligned, so the host plans and runs them afterwards, as it always did.
"""

from __future__ import annotations

import os
import threading
from collections.abc import Callable, Sequence
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass, replace
from pathlib import Path
from types import ModuleType

EDGE_PAD_SECONDS = 3.0
MIN_WINDOW_SECONDS = 25.0
MERGE_GAP_SECONDS = 20.0
WHOLE_CHAPTER_FRACTION = 0.60
"""MC3's window rules, the same numbers as `plan.go` (`windowEdgePadSeconds`, `windowMinSeconds`,
`windowMergeGapSeconds`, `windowWholeChapterFraction`); `tests/fixtures/recheck_windows.json` is read by both test suites so they cannot drift."""

MODEL_COST = {"tiny": 1, "base": 2, "small": 5, "medium": 15, "large-v3-turbo": 8, "large-v3": 20}
"""Relative CPU cost of one second of audio per model, rough orders of magnitude used only to split the processors between the two models."""

DEFAULT_COST = 5
DOUBT_SHARE = 0.15
"""The share of a chapter the large model is expected to see: it weighs the large model's cost when the processors are split, and
reserves room in the progress denominator until the real share is known."""

POLL_SECONDS = 0.1
"""How often a running pool is checked for finished work and for a cancel."""


def cpu_count() -> int:
    """The processors this run may use. A function so a test can name a computer."""
    return os.cpu_count() or 1


@dataclass(frozen=True)
class ModelBudget:
    """One model's share: `workers` items at once, each decoding with `threads` CPU threads."""

    workers: int
    threads: int


@dataclass(frozen=True)
class PipelineBudget:
    """Both models' shares. `serial` (one processor) runs everything on one worker, one job at a time. `shared_instance` (a GPU) has
    every worker of a model take turns on one loaded model."""

    first: ModelBudget
    recheck: ModelBudget
    serial: bool = False
    shared_instance: bool = False


def plan_item_workers(cpus: int, requested: int, model: str, items: int, device: str, max_by_model: dict[str, int]) -> ModelBudget:
    """How many of `items` one model transcribes at once with `cpus` processors. 0 asks for the automatic count: the model's memory
    cap, but never so many that a worker is left one thread (the measured four workers on four processors was slower than two). A
    named number is kept up to the items and the processors. A GPU runs one."""
    if device == "cuda":
        return ModelBudget(1, 1)
    cpus = max(1, cpus)
    cap = max_by_model.get(model, 2)
    wanted = requested if requested > 0 else min(cap, max(1, cpus // 2))
    workers = max(1, min(wanted, items, cpus))
    return ModelBudget(workers, max(1, cpus // workers))


def plan_budget(cpus: int, requested: int, first_model: str, recheck_model: str, items: int, device: str, max_by_model: dict[str, int]) -> PipelineBudget:
    """The two models' shares of `cpus`. The processors are split by what each model costs on the part of the chapter it sees; each
    model then plans its own workers inside its share. The large model never goes past its memory cap, whatever was asked."""
    shared = device == "cuda"
    if cpus < 2:
        return PipelineBudget(ModelBudget(1, 1), ModelBudget(1, 1), serial=True, shared_instance=shared)
    first_cost = MODEL_COST.get(first_model, DEFAULT_COST)
    recheck_cost = MODEL_COST.get(recheck_model, 2 * DEFAULT_COST) * DOUBT_SHARE
    first_cpus = min(cpus - 1, max(1, round(cpus * first_cost / (first_cost + recheck_cost))))
    first = plan_item_workers(first_cpus, requested, first_model, items, device, max_by_model)
    recheck = plan_item_workers(cpus - first_cpus, requested, recheck_model, items, device, max_by_model)
    cap = max_by_model.get(recheck_model, 2)
    if recheck.workers > cap:
        recheck = ModelBudget(cap, max(1, (cpus - first_cpus) // cap))
    return PipelineBudget(first, recheck, shared_instance=shared)


# ---------------------------------------------------------------------------
# the windows


def pad_window(start: float, end: float, item_start: float, item_end: float) -> tuple[float, float]:
    """A doubtful passage widened past its words and up to the shortest window worth transcribing, kept inside its item: the host's
    `padWindow` (`plan.go`). A shortfall on one side shifts onto the other, so a window near an edge keeps its length."""
    low, high = start - EDGE_PAD_SECONDS, end + EDGE_PAD_SECONDS
    extra = MIN_WINDOW_SECONDS - (high - low)
    if extra > 0:
        low -= extra / 2
        high += extra / 2
    if low < item_start:
        high += item_start - low
        low = item_start
    if high > item_end:
        low -= high - item_end
        high = item_end
    return max(low, item_start), high


def merge_windows(windows: Sequence[tuple[float, float]]) -> list[tuple[float, float]]:
    """The windows of one words file, merged when closer than `MERGE_GAP_SECONDS`: transcribing the gap costs no more than a second call."""
    merged: list[tuple[float, float]] = []
    for start, end in sorted(windows):
        if merged and start - merged[-1][1] < MERGE_GAP_SECONDS:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


class DoubtGate:
    """Decides what the large model is asked for, item by item, as the small model finishes them. Passages are padded and merged as the
    host would; once the windows asked for pass `WHOLE_CHAPTER_FRACTION` of the played seconds the large model would redo most of the
    chapter anyway, so `escalated` turns on: this item and every one before it is re-checked whole."""

    def __init__(self, played_seconds: float):
        self._played = played_seconds
        self._asked = 0.0
        self._lock = threading.Lock()
        self.escalated = False

    def windows_for(self, item, runs: Sequence[dict]) -> tuple[list[tuple[float, float]], bool]:
        """(the windows to ask for, whether this call turned escalation on)."""
        if not runs and not self.escalated:
            return [], False
        with self._lock:
            tripped = False
            if self.escalated:
                windows = [(item.start_offset, item.end)]
            else:
                windows = merge_windows([pad_window(run["start"], run["end"], item.start_offset, item.end) for run in runs])
                self._asked += sum(end - start for start, end in windows)
                if self._asked > WHOLE_CHAPTER_FRACTION * self._played:
                    self.escalated = tripped = True
                    windows = [(item.start_offset, item.end)]
            return windows, tripped


# ---------------------------------------------------------------------------
# a pool that can be fed while it is drained


class Pending:
    """Futures from one or more pools, drained in the order they finish. A finished future's callback may submit more. A cancel, a
    failed job or a failing callback stops every job not yet started and raises once the running ones have ended."""

    def __init__(self, engine: ModuleType, progress_path: str | None):
        self._engine = engine
        self._progress_path = progress_path
        self._futures: dict[Future, object] = {}

    def submit(self, pool: ThreadPoolExecutor, tag: object, fn: Callable, *args) -> None:
        """Run `fn(*args)` on `pool`; `tag` comes back with its result."""
        self._futures[pool.submit(fn, *args)] = tag

    def drain(self, on_done: Callable[[object, object], None]) -> None:
        """Hand each finished job's `(tag, result)` to `on_done`, until nothing is left. Raises a job's own exception, or the engine's cancel."""
        try:
            while self._futures:
                finished, _ = wait(list(self._futures), timeout=POLL_SECONDS, return_when=FIRST_COMPLETED)
                self._engine.check_cancelled(self._progress_path)
                for future in finished:
                    tag = self._futures.pop(future)
                    on_done(tag, future.result())
        except BaseException:
            for future in self._futures:
                future.cancel()
            raise


# ---------------------------------------------------------------------------
# the pipelined run


def collect(items, words_dir: Path, first, recheck, engine: ModuleType, args, budget: PipelineBudget):
    """The pipelined `coverage_mode._collect_words`: every playing item's words, the doubtful passages re-checked by the large model as
    soon as the small model has finished each item. Returns the per-item results in manifest order, and the re-check summaries by item."""
    import coverage_mode as mode  # a sibling module; imported late because it imports this one

    playing = [item for item in items if not item.muted]
    pending = [item for item in playing if not mode._is_covered(words_dir, item, args.model)]
    first_seconds = sum(item.length for item in pending)
    progress = mode._Progress(engine, args.progress, first_seconds * (1 + DOUBT_SHARE))
    current = {item.index: mode._ItemResult(item, None, None, ()) for item in items if item.muted}
    summaries: dict[int, dict] = {}
    asked = {"seconds": 0.0}
    gate = DoubtGate(sum(item.length for item in playing))
    below = float(args.unsure_below)
    locks = {item.index: threading.Lock() for item in playing}
    first_pool = ThreadPoolExecutor(budget.first.workers, thread_name_prefix="first-pass")
    recheck_pool = first_pool if budget.serial else ThreadPoolExecutor(budget.recheck.workers, thread_name_prefix="re-check")
    queue = Pending(engine, args.progress)
    first_done = set()

    def first_job(item, label):
        return mode._words_for(item, words_dir / item.words_file, first, progress, engine, args, label)

    def recheck_job(item, windows, whole):
        with locks[item.index]:  # one writer per words file; the first pass's write is final before this job exists
            engine.check_cancelled(args.progress)
            result = current[item.index]
            words = result.words
            for number, (start, end) in enumerate(windows, 1):
                window = mode.Window(item.index, item.item_guid, item.source_file, item.words_file, start, end)
                piece = mode.ManifestItem(item.index, item.item_guid, item.source_file, start, end - start, item.words_file, False)
                key = ("re-check", item.index, number, whole)
                label = f"item {item.index}"

                def on_seconds(seconds: float, _key=key, _length=piece.length, _label=label) -> None:
                    engine.check_cancelled(args.progress)
                    done = min(max(seconds, 0.0), _length)
                    progress.update(_key, done, f"Re-checking {_label}... {engine.format_time(done)} / {engine.format_time(_length)}")

                words = mode.splice_window(words, window, recheck(piece, on_seconds), args.recheck_model)
                progress.finish(key, piece.length, f"Re-checked {label}")
            mode.write_words_file(words_dir / item.words_file, words)
            updated = replace(result, words=words, played=tuple(mode.played_words(words, item)))
            current[item.index] = updated
            return updated, windows, whole

    def plan(item, result):
        runs = mode.unsure_runs(result, below)
        windows, tripped = gate.windows_for(item, runs)
        scheduled = []
        if windows:
            scheduled.append((item, windows, gate.escalated))
        if tripped:  # the large model is about to redo most of the chapter: finish the items already past the gate whole too
            scheduled.extend(
                (earlier, [(earlier.start_offset, earlier.end)], True) for earlier in playing if earlier.index in first_done and earlier is not item
            )
        for target, target_windows, whole in scheduled:
            seconds = sum(end - start for start, end in target_windows)
            asked["seconds"] += seconds
            queue.submit(recheck_pool, "recheck", recheck_job, target, target_windows, whole)
        progress.set_total(first_seconds + max(asked["seconds"], first_seconds * DOUBT_SHARE))

    def on_done(tag, outcome):
        if tag == "first":
            item = outcome.item
            if item in pending and outcome.source == "reused":  # another item wrote its words file first
                progress.credit(item.length, f"Reused the words of item {item.index}")
            with locks[item.index]:
                current[item.index] = outcome
            first_done.add(item.index)
            plan(item, outcome)
            return
        result, windows, whole = outcome
        summary = summaries.setdefault(
            result.item.index, {"itemIndex": result.item.index, "itemGuid": result.item.item_guid, "windows": 0, "seconds": 0.0, "whole": False}
        )
        summary["windows"] += len(windows)
        summary["seconds"] = round(summary["seconds"] + sum(end - start for start, end in windows), 3)
        summary["whole"] = summary["whole"] or whole

    try:
        for position, item in enumerate(playing):
            label = f"{pending.index(item) + 1}/{len(pending)}" if item in pending else f"{position + 1}"
            queue.submit(first_pool, "first", first_job, item, label)
        queue.drain(on_done)
    finally:
        for pool in {first_pool, recheck_pool}:
            pool.shutdown(wait=True, cancel_futures=True)
    engine.check_cancelled(args.progress)
    progress.set_total(first_seconds + asked["seconds"])
    progress.transcribed(progress.done, "Checked the passages the first model doubted")
    progress.report("ALIGN", mode.ALIGN_PCT, "Aligning the chapter to the recording...")
    return [current[item.index] for item in items], [summaries[index] for index in sorted(summaries)]
