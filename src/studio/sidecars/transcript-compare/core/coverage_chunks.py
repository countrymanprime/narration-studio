"""Chunked, overlapping, parallel transcription of one item's played range, for the recording check.

A long item transcribed as one piece is one Whisper decode on one CPU core group, and a chapter an
hour long takes about as long as it plays. This module cuts the item into chunks that overlap by a
crossover, transcribes the chunks in several worker processes (each loads its own copy of the model),
and joins the chunks' words back into one transcript:

- `plan_chunks` makes the chunks. Neighbours overlap by the crossover so a word on a chunk's edge
  is whole in the other chunk.
- `merge_chunks` joins them. The cut between two chunks is the middle of their overlap; a word
  belongs to the chunk its midpoint falls in, so no word is repeated and none is lost.
- `ChunkedTranscriber` is the `Transcriber` the coverage mode uses when chunking is on.

The first chunk always runs alone, in this process: it loads the model once before the workers race
to read the same files, and it settles the language the other chunks use when none was forced, so
a quiet slice is not left to guess it. Every word keeps Whisper's probability for it, which is what
`coverage_mode` reads to find the passages worth a second look with a larger model.
"""

from __future__ import annotations

import math
import multiprocessing
import os
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from multiprocessing.pool import ThreadPool
from types import ModuleType
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from coverage_mode import ItemWords, ManifestItem

SAMPLE_RATE = 16000
"""The rate `compare.decode_segment` decodes to."""

Word = tuple[str, float, float]
Score = float | None

DEFAULT_CHUNK_SECONDS = 300.0
"""The chunk length when several workers are asked for and no length is named: workers share chunks, so they need some."""

DEFAULT_OVERLAP_SECONDS = 6.0
"""The crossover between neighbouring chunks when none is named: each chunk's edge is then 3 s from the cut."""

POLL_SECONDS = 0.2
"""How often a running pool is checked for finished chunks and for a cancel."""


@dataclass(frozen=True)
class Chunk:
    """A stretch of one item, in seconds from the start of its played range."""

    start: float
    end: float

    @property
    def length(self) -> float:
        """The chunk's length in seconds."""
        return self.end - self.start


def plan_chunks(length: float, chunk_seconds: float, overlap_seconds: float) -> list[Chunk]:
    """The chunks of an item `length` seconds long. A chunk is `chunk_seconds` long and each starts
    `overlap_seconds` before the last one ended. Chunking off (`chunk_seconds` 0 or less) or an item
    no longer than a chunk is one chunk. A tail too short to be worth a chunk of its own joins the last
    one. A crossover that would leave no step forward is shrunk to a quarter of the chunk."""
    if not math.isfinite(length) or length <= 0:
        return []
    if chunk_seconds <= 0 or length <= chunk_seconds:
        return [Chunk(0.0, length)]
    overlap = max(0.0, overlap_seconds)
    if overlap >= chunk_seconds / 2:
        overlap = chunk_seconds / 4
    step = chunk_seconds - overlap
    tail = max(2 * overlap, 1.0)
    planned: list[Chunk] = []
    start = 0.0
    while True:
        end = start + chunk_seconds
        if end >= length - tail:
            planned.append(Chunk(start, length))
            return planned
        planned.append(Chunk(start, end))
        start += step


@dataclass(frozen=True)
class ChunkWords:
    """What one chunk heard: its words (in seconds from the start of the item, not of the chunk), the
    probability Whisper gave each (None when the engine gave none), and the language it detected."""

    chunk: Chunk
    words: tuple[Word, ...]
    scores: tuple[Score, ...]
    language: str | None = None


def merge_chunks(results: Sequence[ChunkWords]) -> tuple[tuple[Word, ...], tuple[Score, ...]]:
    """The chunks' words as one transcript in time order. Between two neighbours the cut is the middle
    of their overlap; a word is kept from the chunk its midpoint falls in. Chunks may be given in any
    order."""
    ordered = sorted(results, key=lambda result: result.chunk.start)
    words: list[Word] = []
    scores: list[Score] = []
    for position, result in enumerate(ordered):
        lower = (result.chunk.start + ordered[position - 1].chunk.end) / 2 if position > 0 else -math.inf
        upper = (ordered[position + 1].chunk.start + result.chunk.end) / 2 if position + 1 < len(ordered) else math.inf
        for word, score in zip(result.words, result.scores, strict=True):
            if lower <= (word[1] + word[2]) / 2 < upper:
                words.append(word)
                scores.append(score)
    return tuple(words), tuple(scores)


def worker_count(requested: int, chunks: int, cpus: int, max_by_model: dict[str, int], model: str, device: str) -> int:
    """How many worker processes to start. 0 asks for the model's own memory cap (each worker holds a
    full copy of the model); a number the narrator named is kept, up to the CPUs and the chunks. A GPU
    runs one: the workers would only contend for it. Never below one."""
    if device == "cuda":
        return 1
    wanted = requested if requested > 0 else max_by_model.get(model, 2)
    return max(1, min(wanted, chunks, cpus))


class ChunkCancelled(Exception):
    """A chunk saw the run's cancel file between two of its segments and stopped. The transcriber turns it into the engine's own cancel."""


@dataclass(frozen=True)
class ChunkJob:
    """One chunk's audio and everything a worker needs to transcribe it. It is pickled to the worker."""

    chunk: Chunk
    audio: np.ndarray
    model_size: str
    model_dir: str | None
    device: str
    language: str | None
    hotwords: str | None
    cpu_threads: int
    cancel_path: str | None = None
    """The run's cancel file: a worker stops between segments when it exists, so a cancel does not wait for a whole chunk."""
    sharers: int = 1
    """The item workers that may call this process's model at once: a chunk run in this process shares one model between
    them (faster-whisper's `num_workers`), so items side by side are not queued behind one another."""


_MODELS: dict[tuple, object] = {}
"""One model per process: a worker loads it for its first chunk and keeps it for the rest."""

_MODELS_LOCK = threading.Lock()
"""Item workers (threads) can reach the first chunk's in-process load together; the second waits for the first's model."""


def whisper_chunk(job: ChunkJob) -> ChunkWords:
    """Transcribe one chunk with faster-whisper. Runs in a worker process (or here, for one worker)."""
    import coverage_mode  # a sibling module; imported late because it imports this one

    key = (job.model_size, job.model_dir, job.device, job.cpu_threads, job.sharers)
    with _MODELS_LOCK:
        if key not in _MODELS:  # pragma: no cover - needs a Whisper model
            _MODELS[key] = coverage_mode.load_whisper_model(job.model_size, job.model_dir, job.device, job.cpu_threads, job.sharers)
        model = _MODELS[key]
    segments, info = model.transcribe(job.audio, language=job.language, word_timestamps=True, vad_filter=True, hotwords=job.hotwords or None)
    words: list[Word] = []
    scores: list[Score] = []
    for segment in segments:
        if job.cancel_path and os.path.exists(job.cancel_path):
            raise ChunkCancelled
        for word in segment.words or ():
            words.append((word.word.strip(), round(job.chunk.start + word.start, 3), round(job.chunk.start + word.end, 3)))
            probability = getattr(word, "probability", None)
            scores.append(None if probability is None else round(float(probability), 3))
    return ChunkWords(job.chunk, tuple(words), tuple(scores), info.language)


def spawn_pool(processes: int):  # pragma: no cover - starts child processes
    """A pool of freshly started interpreters: nothing is inherited from this process, so a worker
    cannot see this process's model or open files."""
    return multiprocessing.get_context("spawn").Pool(processes)


class ChunkedTranscriber:
    """The coverage mode's `Transcriber` when chunking is on: decodes an item's played range once,
    transcribes its chunks in up to `workers` processes and joins the result. `cpus` bounds the processors its chunk processes may use
    together (default: all of them); an item pool gives each of its workers a share."""

    def __init__(
        self,
        engine: ModuleType,
        *,
        model_size: str,
        model_dir: str | None,
        device: str,
        language: str | None,
        hotwords: str | None,
        chunk_seconds: float,
        overlap_seconds: float,
        workers: int,
        progress_path: str | None,
        decode: Callable[[ManifestItem], np.ndarray] | None = None,
        chunk_fn: Callable[[ChunkJob], ChunkWords] | None = None,
        pool_factory: Callable[[int], object] | None = None,
        plain: Callable[[ManifestItem, Callable[[float], None]], ItemWords] | None = None,
        cpus: int | None = None,
        sharers: int = 1,
        activity=None,
    ):
        self._engine = engine
        self._model_size = model_size
        self._model_dir = model_dir
        self._device = device
        self._language = language
        self._hotwords = hotwords
        self._chunk_seconds = chunk_seconds
        self._overlap_seconds = overlap_seconds
        self._workers = workers
        self._progress_path = progress_path
        self._decode = decode or (lambda item: engine.decode_segment(item.source_file, item.start_offset, item.length))
        self._chunk_fn = chunk_fn or whisper_chunk
        # No pool named: the chunks run as threads on this process's one model (faster-whisper's `num_workers`), as the item pool's items do. A cold
        # process per chunk loaded its own copy of the model and measured barely faster than one (docs/research/recording-check-benchmark.md).
        self._in_process = pool_factory is None
        self._pool_factory = pool_factory or (lambda threads: ThreadPool(threads))
        self._plain = plain
        self._cpus = cpus
        self._sharers = max(1, sharers)
        self._activity = activity

    def __call__(self, item: ManifestItem, on_seconds: Callable[[float], None]) -> ItemWords:
        """Transcribe the item's played range. `on_seconds` is told how much of it is done as chunks finish. An item that is one
        chunk goes to the plain transcriber, which reports progress and sees a cancel segment by segment."""
        if self._plain is not None and len(plan_chunks(item.length, self._chunk_seconds, self._overlap_seconds)) <= 1:
            return self._plain(item, on_seconds)
        try:
            return self._chunked(item, on_seconds)
        except ChunkCancelled:
            self._engine.check_cancelled(self._progress_path)  # raises the engine's own cancel
            raise

    def _chunked(self, item: ManifestItem, on_seconds: Callable[[float], None]) -> ItemWords:
        from coverage_mode import ItemWords, text_hash

        audio = self._decode(item)
        length = len(audio) / SAMPLE_RATE
        planned = plan_chunks(length, self._chunk_seconds, self._overlap_seconds)
        if not planned:
            return ItemWords((), item.start_offset, item.end, self._model_size, self._language, text_hash(self._hotwords))
        cpus = self._cpus or os.cpu_count() or 1
        workers = worker_count(self._workers, len(planned), cpus, getattr(self._engine, "MAX_WORKERS_BY_MODEL", {}), self._model_size, self._device)
        # `cpus` is set when this transcriber is one worker of an item pool: it owns that many threads, so even one chunk worker is bounded
        threads = max(1, cpus // workers) if workers > 1 or self._cpus else 0
        total = sum(chunk.length for chunk in planned)
        cancel_path = self._progress_path + ".cancel" if self._progress_path else None

        def credit(chunk: Chunk) -> float:
            """The seconds of the item a finished chunk accounts for; the overlap is not counted twice."""
            return chunk.length / total * item.length

        def job(chunk: Chunk, language: str | None, here: bool) -> ChunkJob:
            """`here`: the chunk runs in this process, whose model the other item workers share; a spawned process has its own."""
            piece = audio[int(chunk.start * SAMPLE_RATE) : int(chunk.end * SAMPLE_RATE)]
            sharers = max(self._sharers, workers) if here else 1
            return ChunkJob(chunk, piece, self._model_size, self._model_dir, self._device, language, self._hotwords, threads, cancel_path, sharers)

        first = self._chunk_fn(job(planned[0], self._language, True))
        results = [first]
        done = credit(planned[0])
        on_seconds(done)
        self._chunk_done(item, remaining=len(planned) - 1, workers=workers)
        language = self._language or first.language
        rest = [job(chunk, language, workers == 1 or self._in_process) for chunk in planned[1:]]
        if workers == 1 or not rest:
            for pending in rest:
                self._engine.check_cancelled(self._progress_path)
                results.append(self._chunk_fn(pending))
                done += credit(pending.chunk)
                on_seconds(done)
                self._chunk_done(item, remaining=len(rest) - len(results) + 1, workers=workers)
        else:

            def collect(finished: ChunkWords) -> None:
                nonlocal done
                results.append(finished)
                done += credit(finished.chunk)
                on_seconds(done)
                self._chunk_done(item, remaining=len(planned) - len(results), workers=workers)

            self._run_pool(rest, workers, collect)
        words, scores = merge_chunks(results)
        shifted = tuple((text, round(item.start_offset + start, 3), round(item.start_offset + end, 3)) for text, start, end in words)
        return replace(ItemWords(shifted, item.start_offset, item.end, self._model_size, language, text_hash(self._hotwords)), scores=scores)

    def _chunk_done(self, item: ManifestItem, remaining: int, workers: int) -> None:
        """Tell the activity log a chunk finished and how many of this item's chunks run at once for the rest (the item's first chunk runs alone)."""
        if self._activity is None:
            return
        self._activity.unit_done()
        self._activity.working(item.index, min(workers, remaining))

    def _run_pool(self, jobs: Sequence[ChunkJob], workers: int, collect: Callable[[ChunkWords], None]) -> None:
        """Hand each chunk of `jobs` to `collect` as it finishes. A cancel, a failed chunk or a failing
        `collect` ends every worker at once."""
        pool = self._pool_factory(workers)
        try:
            waiting = [pool.apply_async(self._chunk_fn, (pending,)) for pending in jobs]
            while waiting:
                self._engine.check_cancelled(self._progress_path)
                ready = [result for result in waiting if result.ready()]
                for result in ready:
                    waiting.remove(result)
                    collect(result.get())
                if not ready:
                    time.sleep(POLL_SECONDS)
            pool.close()
            pool.join()
        except BaseException:
            pool.terminate()
            raise
