"""The sidecar's recording-coverage mode: `compare.py --coverage`.

docs/utilities/recording-coverage.md. For one chapter and the items the host lists in a JSON
manifest (active takes only, in play order; muted items are listed and skipped, Q5 and Q10), this
mode transcribes, and the host does the rest:

1. it reuses each item's words file when it covers the item's played range, and otherwise decodes
   and transcribes that range and writes the words file atomically (temporary file, then rename),
   so a cancelled run keeps every item it finished;
2. it writes a words report to `--out`, tagged lines with one JSON object each:
   `COVERAGE_WORDS|` per playing item (`index`, `itemGuid`, and `words`: `reused` or
   `transcribed`), then, with `--unsure-below`, `COVERAGE_UNSURE|` per passage Whisper was not sure
   of (which the host may re-check with a larger model) and, for the pipelined cascade,
   `COVERAGE_RECHECKED|` per item the large model re-checked. The report is written atomically, so
   it exists only when the run finished.

The host then aligns the chapter to the words and writes the measurements
(`src/studio/desktop/internal/recordingcoverage`). A plain check refuses to reuse a words file
another model made (`covers`), so a model change is a re-transcription, never a silent stale reuse.

`--recheck <windows.json>` is a separate, windows-only mode (`run_recheck`):
instead of the manifest and chapter above, it takes a checked list of windows, each bounded audio
in one item's source and the words file to update, transcribes each with `--model` (one model load
for the run) and splices the result into that words file (`splice_window`), reattributing the
range's model provenance in a new, additive `spans` list. It touches no manifest, chapter or
timeline, and writes no report.

Progress is `stage|pct|message` in the usual file (START, DECODE, LOAD, TRANSCRIBE, WRITE, DONE;
`--recheck` never reaches WRITE), and TRANSCRIBE moves with the seconds transcribed over the
seconds that need transcribing. Exit codes, set by `compare.main`: 0 the words report is complete
(or, for `--recheck`, every window spliced); 1 failed (an `ERROR|0|<message>` progress line, no
report); 2 cancelled through `<progress>.cancel` (a `CANCELLED` progress line, no report, finished
words files kept). Python's `argparse` also exits with 2 on a usage error, with no progress line.

This module does not import `compare.py`: `run` is handed the loaded module as `engine`, so the
mode uses exactly the decoding and transcription of the process it runs in.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import threading
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace
from pathlib import Path
from types import ModuleType

import coverage_activity
import coverage_chunks
import coverage_pipeline

MANIFEST_SCHEMA_VERSION = 1
WORDS_SCHEMA_VERSION = 1
WINDOWS_SCHEMA_VERSION = 1

TRANSCRIBE_START_PCT = 2
TRANSCRIBE_END_PCT = 94
WRITE_PCT = 98

RANGE_TOLERANCE_SECONDS = 0.001
"""How far a cached range may fall short of a played range and still cover it (float rounding)."""

WORDS_FILE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,199}")
"""A words file is named by the host's cache key: a plain file name, never a path."""

_MANIFEST_ITEM_KEYS = frozenset({"index", "itemGuid", "sourceFile", "startOffset", "length", "wordsFile", "muted"})
_WINDOW_KEYS = frozenset({"itemIndex", "itemGuid", "sourceFile", "wordsFile", "start", "end"})

Word = tuple[str, float, float]
Score = float | None


class ManifestError(ValueError):
    """The manifest is not the shape this mode reads; nothing has been read or written yet."""


class WindowsError(ValueError):
    """The windows file (`--recheck`) is not the shape this mode reads, or names a words file
    with nothing cached to splice into; nothing has been read or written yet."""


@dataclass(frozen=True)
class ManifestItem:
    """One item's active take: the played range of its source, in source seconds."""

    index: int
    item_guid: str
    source_file: str
    start_offset: float
    length: float
    words_file: str
    muted: bool

    @property
    def end(self) -> float:
        return self.start_offset + self.length


@dataclass(frozen=True)
class Span:
    """One range of a words file attributed to one model: `[start, end]`
    in the file's own source seconds. A plain file (never spliced by `--recheck`) carries none;
    `spans_or_default` gives it one span, the whole file under its `model`."""

    start: float
    end: float
    model: str


@dataclass(frozen=True)
class ItemWords:
    """A words file: the words said in `[source_start, source_end]` of a source, in source seconds,
    and what shaped them (Q7, Q13: model and language label a result, they do not invalidate it).
    `model` stays the file's original transcription for compatibility; `spans` is empty unless a
    `--recheck` splice has given ranges of the file to another model."""

    words: tuple[Word, ...]
    source_start: float
    source_end: float
    model: str
    language: str | None
    hotwords_hash: str | None
    spans: tuple[Span, ...] = ()
    scores: tuple[Score, ...] = ()
    """Whisper's probability for each word, parallel to `words`; empty when none was recorded (a file
    written before scores existed, or an engine that gave none). A word with no score is never
    called unsure: unknown stays unknown."""

    def __post_init__(self):
        if self.scores and len(self.scores) != len(self.words):
            raise ValueError(f"A words file has {len(self.words)} words but {len(self.scores)} scores")

    def score_of(self, position: int) -> Score:
        """The probability of the word at `position`, or None when none was recorded."""
        return self.scores[position] if position < len(self.scores) else None

    def spans_or_default(self) -> tuple[Span, ...]:
        return self.spans or (Span(self.source_start, self.source_end, self.model),)


Transcriber = Callable[[ManifestItem, Callable[[float], None]], ItemWords]
"""Transcribes one item's played range; calls back with the seconds of it done so far."""


# ---------------------------------------------------------------------------
# the manifest


def _number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _manifest_item(raw: object, position: int) -> ManifestItem:
    where = f"manifest item {position}"
    if not isinstance(raw, dict):
        raise ManifestError(f"{where} is not an object")
    missing = sorted(_MANIFEST_ITEM_KEYS - raw.keys())
    unknown = sorted(raw.keys() - _MANIFEST_ITEM_KEYS)
    if missing or unknown:
        raise ManifestError(f"{where}: missing {missing}, unknown {unknown}")
    index = raw["index"]
    if not isinstance(index, int) or isinstance(index, bool) or index < 0:
        raise ManifestError(f"{where}: index must be a whole number, 0 or more")
    for key in ("itemGuid", "sourceFile"):
        if not isinstance(raw[key], str) or not raw[key]:
            raise ManifestError(f"{where}: {key} must be a non-empty string")
    if not _number(raw["startOffset"]) or raw["startOffset"] < 0:
        raise ManifestError(f"{where}: startOffset must be a finite number of seconds, 0 or more")
    if not _number(raw["length"]) or raw["length"] <= 0:
        raise ManifestError(f"{where}: length must be a finite number of seconds above 0")
    if not isinstance(raw["wordsFile"], str) or not WORDS_FILE_NAME.fullmatch(raw["wordsFile"]):
        raise ManifestError(f"{where}: wordsFile must be a plain file name (letters, digits, '.', '_', '-')")
    if not isinstance(raw["muted"], bool):
        raise ManifestError(f"{where}: muted must be true or false")
    return ManifestItem(index, raw["itemGuid"], raw["sourceFile"], float(raw["startOffset"]), float(raw["length"]), raw["wordsFile"], raw["muted"])


def read_manifest(path: str | os.PathLike) -> tuple[ManifestItem, ...]:
    """The manifest's items in play order (by index), checked field by field. The host writes it
    (a trust boundary: `docs/architecture/threat-model.md` row 4e)."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError, RecursionError) as exc:
        raise ManifestError(f"The coverage manifest could not be read: {exc}") from exc
    if not isinstance(data, dict) or data.get("schemaVersion") != MANIFEST_SCHEMA_VERSION:
        raise ManifestError(f"The coverage manifest is not schema version {MANIFEST_SCHEMA_VERSION}")
    raw_items = data.get("items")
    if not isinstance(raw_items, list):
        raise ManifestError("The coverage manifest's items must be a list")
    if not raw_items:
        raise ManifestError("The coverage manifest has no items")
    items = [_manifest_item(raw, position) for position, raw in enumerate(raw_items)]
    seen: set[int] = set()
    for item in items:
        if item.index in seen:
            raise ManifestError(f"The coverage manifest lists item index {item.index} twice")
        seen.add(item.index)
    return tuple(sorted(items, key=lambda item: item.index))


# ---------------------------------------------------------------------------
# words files


def text_hash(text: str | None) -> str | None:
    return None if text is None else "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def _parse_words(data: object) -> ItemWords | None:
    if not isinstance(data, dict) or data.get("schemaVersion") != WORDS_SCHEMA_VERSION:
        return None
    transcription = data.get("transcription")
    words = data.get("words")
    if not (_number(data.get("sourceStart")) and _number(data.get("sourceEnd")) and isinstance(words, list) and isinstance(transcription, dict)):
        return None
    if not isinstance(transcription.get("model"), str):
        return None
    if not all(
        isinstance(word, list)
        and len(word) in (3, 4)
        and isinstance(word[0], str)
        and _number(word[1])
        and _number(word[2])
        and (len(word) == 3 or word[3] is None or _number(word[3]))
        for word in words
    ):
        return None
    spans_raw = data.get("spans", [])
    if not isinstance(spans_raw, list) or not all(
        isinstance(s, dict) and _number(s.get("start")) and _number(s.get("end")) and isinstance(s.get("model"), str) for s in spans_raw
    ):
        return None
    language = transcription.get("language")
    hotwords = transcription.get("hotwordsHash")
    return ItemWords(
        tuple((word[0], float(word[1]), float(word[2])) for word in words),
        float(data["sourceStart"]),
        float(data["sourceEnd"]),
        transcription["model"],
        language if isinstance(language, str) else None,
        hotwords if isinstance(hotwords, str) else None,
        tuple(Span(float(s["start"]), float(s["end"]), s["model"]) for s in spans_raw),
        _parsed_scores(words),
    )


def _parsed_scores(words: list) -> tuple[Score, ...]:
    """The fourth element of each word, or () when no word has one."""
    scores = tuple(float(word[3]) if len(word) == 4 and word[3] is not None else None for word in words)
    return scores if any(score is not None for score in scores) else ()


def read_words_file(path: str | os.PathLike) -> ItemWords | None:
    """A words file, or None when it is absent, unreadable, or not this schema: every one of those
    is a cache miss that costs a transcription, never an error."""
    try:
        return _parse_words(json.loads(Path(path).read_text(encoding="utf-8")))
    except (OSError, ValueError, RecursionError):
        return None


def _write_atomically(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(text, encoding="utf-8", newline="\n")
    os.replace(temporary, path)


def write_words_file(path: str | os.PathLike, words: ItemWords) -> None:
    payload = {
        "schemaVersion": WORDS_SCHEMA_VERSION,
        "sourceStart": words.source_start,
        "sourceEnd": words.source_end,
        "words": [list(word) + ([words.scores[n]] if words.scores else []) for n, word in enumerate(words.words)],
        "transcription": {"model": words.model, "language": words.language, "hotwordsHash": words.hotwords_hash, "vadFilter": True},
    }
    if words.spans:
        payload["spans"] = [{"start": span.start, "end": span.end, "model": span.model} for span in words.spans]
    _write_atomically(Path(path), json.dumps(payload, ensure_ascii=False) + "\n")


def covers(words: ItemWords, item: ManifestItem, model: str | None = None) -> bool:
    """Whether a words file transcribed all of the item's played range. A trim that narrows the
    range keeps it; a trim that widens it needs a new transcription. With `model` given, a plain
    re-check also refuses to reuse a words file another model made (the windows-only `--recheck`
    path never calls this with a model: it splices unconditionally, model mismatch or not)."""
    in_range = words.source_start <= item.start_offset + RANGE_TOLERANCE_SECONDS and words.source_end >= item.end - RANGE_TOLERANCE_SECONDS
    return in_range and (model is None or words.model == model)


def checked_by(args) -> str | None:
    """The larger model whose work a run keeps: the pipeline's `--recheck-model`, or `--checked-by` for a stage the host runs on its own.
    A range that model has already transcribed is checked; a check of unchanged audio never sends it there again."""
    return getattr(args, "recheck_model", None) or getattr(args, "checked_by", None) or None


def checked_ranges(words: ItemWords, model: str | None) -> list[tuple[float, float]]:
    """The ranges of a words file `model` transcribed: the whole file when it made it, else the spans a re-check gave it."""
    if not model:
        return []
    return [(span.start, span.end) for span in words.spans_or_default() if span.model == model]


def inside_ranges(start: float, end: float, ranges: Sequence[tuple[float, float]]) -> bool:
    """Whether `[start, end]` lies within one of `ranges` (the edge tolerance of `covers`)."""
    return any(low <= start + RANGE_TOLERANCE_SECONDS and high >= end - RANGE_TOLERANCE_SECONDS for low, high in ranges)


def unchecked_runs(result: _ItemResult, below: float, model: str | None) -> list[dict]:
    """`unsure_runs` without the passages `model` has already re-checked: the larger model's own doubt is the final word on them."""
    if result.words is None:
        return []
    ranges = checked_ranges(result.words, model)
    return [run for run in unsure_runs(result, below) if not inside_ranges(run["start"], run["end"], ranges)]


def played_words(words: ItemWords, item: ManifestItem) -> list[Word]:
    """The words whose midpoint lies in the item's played range."""
    return [word for word in words.words if item.start_offset <= (word[1] + word[2]) / 2 <= item.end]


# ---------------------------------------------------------------------------
# transcription


def load_whisper_model(
    model_size: str, model_dir: str | None, device: str, cpu_threads: int = 0, num_workers: int = 1
):  # pragma: no cover - needs a Whisper model
    """The faster-whisper model. `cpu_threads` 0 leaves the thread count to faster-whisper; a run with several
    workers gives each its share of the CPUs so they do not fight over them. `num_workers` is how many threads may
    call `transcribe` at once on this one instance, so the workers of an item pool share one copy of the weights."""
    from faster_whisper import WhisperModel

    # model_dir is the host's hash-verified asset directory; local_files_only keeps faster-whisper
    # off the network, as compare.transcribe does (threat-model row 1a).
    compute_type = "int8" if device == "cpu" else "float16"
    return WhisperModel(
        model_dir or model_size, device=device, compute_type=compute_type, local_files_only=bool(model_dir), cpu_threads=cpu_threads, num_workers=num_workers
    )


_load_whisper_model = load_whisper_model
"""The name the calibration harness and older callers use."""


class WhisperTranscriber:
    """Decodes an item's played range and transcribes it with one Whisper model, loaded on first use
    (an all-cached run never loads it) and kept for the rest of the run. Several threads may call it: the model is
    loaded once, and with `serialize` (a GPU) they take the model one call at a time."""

    def __init__(
        self, engine: ModuleType, *, model_size: str, language: str | None, hotwords: str | None, model_factory: Callable[[], object], serialize: bool = False
    ):
        self._engine = engine
        self._model_size = model_size
        self._language = language
        self._hotwords = hotwords
        self._factory = model_factory
        self._model = None
        self._load_lock = threading.Lock()
        self._turn = threading.Lock() if serialize else None

    def _loaded(self):
        with self._load_lock:
            if self._model is None:
                self._model = self._factory()
            return self._model

    def __call__(self, item: ManifestItem, on_seconds: Callable[[float], None]) -> ItemWords:
        audio = self._engine.decode_segment(item.source_file, item.start_offset, item.length)
        model = self._loaded()
        if self._turn is None:
            return self._transcribe(model, item, audio, on_seconds)
        with self._turn:
            return self._transcribe(model, item, audio, on_seconds)

    def _transcribe(self, model, item: ManifestItem, audio, on_seconds: Callable[[float], None]) -> ItemWords:
        segments, info = model.transcribe(audio, language=self._language, word_timestamps=True, vad_filter=True, hotwords=self._hotwords or None)
        words: list[Word] = []
        scores: list[Score] = []
        for segment in segments:
            for word in segment.words or ():
                words.append((word.word.strip(), round(item.start_offset + word.start, 3), round(item.start_offset + word.end, 3)))
                probability = getattr(word, "probability", None)
                scores.append(None if probability is None else round(float(probability), 3))
            on_seconds(min(segment.end, item.length))
        recorded = tuple(scores) if any(score is not None for score in scores) else ()
        return ItemWords(tuple(words), item.start_offset, item.end, self._model_size, info.language, text_hash(self._hotwords), scores=recorded)


# ---------------------------------------------------------------------------
# the run


_PROGRESS_LOCK = threading.RLock()
"""Every writer of the progress file takes this: the file is replaced through one temporary name, which two threads must not share."""


class _Progress:
    """Progress that never moves backwards, and TRANSCRIBE from seconds done over seconds to do. Several workers report into it: each
    item in flight has its own seconds so far (`update`), and a finished one moves into the total done (`finish`)."""

    def __init__(self, engine: ModuleType, path: str | None, total_seconds: float):
        self._engine = engine
        self._path = path
        self._total = total_seconds
        self._finished = 0.0
        self._active: dict[object, float] = {}
        self._pct = 0
        self._lock = _PROGRESS_LOCK

    @property
    def done(self) -> float:
        with self._lock:
            return self._finished + sum(self._active.values())

    def set_total(self, seconds: float) -> None:
        """Change what the done seconds are measured against: a pipelined run learns how much the larger model has to do as it goes."""
        with self._lock:
            self._total = seconds

    def report(self, stage: str, pct: int, message: str) -> None:
        with self._lock:
            self._pct = max(self._pct, pct)
            self._engine.write_progress(self._path, stage, self._pct, message)

    def transcribed(self, seconds: float, message: str) -> None:
        with self._lock:
            share = min(1.0, seconds / self._total) if self._total > 0 else 1.0
            self.report("TRANSCRIBE", TRANSCRIBE_START_PCT + int((TRANSCRIBE_END_PCT - TRANSCRIBE_START_PCT) * share), message)

    def update(self, key: object, seconds: float, message: str) -> None:
        with self._lock:
            self._active[key] = seconds
            self.transcribed(self.done, message)

    def finish(self, key: object, seconds: float, message: str) -> None:
        with self._lock:
            self._active.pop(key, None)
            self._finished += seconds
            self.transcribed(self.done, message)

    def credit(self, seconds: float, message: str) -> None:
        with self._lock:
            self._finished += seconds
            self.transcribed(self.done, message)

    @property
    def pct(self) -> int:
        return self._pct


@dataclass(frozen=True)
class _ItemResult:
    item: ManifestItem
    source: str | None  # "reused", "transcribed", or None for a muted item
    words: ItemWords | None
    played: tuple[Word, ...]


def _chapter(engine: ModuleType, manuscript: str, chapter_id: str) -> dict:
    for chapter in engine.load_manuscript_chapters(manuscript):
        if chapter["id"] == chapter_id:
            return chapter
    raise ValueError(f"Chapter '{chapter_id}' is not a narration chapter of the manuscript.")


def units_of(item: ManifestItem, args) -> int:
    """How many transcriptions `item` takes: its chunks when the run cuts long items up, otherwise one (`coverage_activity`'s unit)."""
    seconds = getattr(args, "chunk_seconds", 0) or 0
    overlap = getattr(args, "chunk_overlap_seconds", None) or coverage_chunks.DEFAULT_OVERLAP_SECONDS
    return max(1, len(coverage_chunks.plan_chunks(item.length, seconds, overlap)))


def _words_for(
    item: ManifestItem,
    path: Path,
    transcriber: Transcriber,
    progress: _Progress,
    engine: ModuleType,
    args,
    label: str,
    activity: coverage_activity.ActivityLog | None = None,
) -> _ItemResult:
    """Reuse the item's words file if it covers the item with this run's model, otherwise
    transcribe and write it. The write is atomic: a words file that exists is whole."""
    cached = read_words_file(path)
    if cached is not None and _covers_for(cached, item, args):
        return _ItemResult(item, "reused", cached, tuple(played_words(cached, item)))
    engine.check_cancelled(args.progress)
    progress.report("DECODE", progress.pct, f"Decoding item {label}...")
    key = ("item", item.index)

    def on_seconds(seconds: float) -> None:
        engine.check_cancelled(args.progress)
        done = min(max(seconds, 0.0), item.length)
        progress.update(key, done, f"Transcribing item {label}... {engine.format_time(done)} / {engine.format_time(item.length)}")

    if activity:
        activity.working(key)
    try:
        words = transcriber(item, on_seconds)
    finally:
        if activity:
            activity.working(key, 0)
    write_words_file(path, words)
    progress.finish(key, item.length, f"Transcribed item {label}")
    if activity:
        if units_of(item, args) == 1:  # a chunked item's chunks count themselves (ChunkedTranscriber)
            activity.unit_done()
        activity.item_done()
    return _ItemResult(item, "transcribed", words, tuple(played_words(words, item)))


def _collect_words(
    items: Sequence[ManifestItem],
    words_dir: Path,
    transcriber: Transcriber,
    engine: ModuleType,
    args,
    workers: int = 1,
    activity: coverage_activity.ActivityLog | None = None,
) -> list[_ItemResult]:
    """Every playing item's words, `workers` items at a time (one is the plain loop). A cancel or a failure stops the items not yet
    started; the ones finished keep their words files."""
    playing = [item for item in items if not item.muted]
    pending = []
    for item in playing:
        hit = _is_covered(words_dir, item, args)
        engine.log("checked the item's cached words", level="debug", event="coverage.cache", item_index=item.index, item_guid=item.item_guid, hit=hit)
        if not hit:
            pending.append(item)
    progress = _Progress(engine, args.progress, sum(item.length for item in pending))
    results = {item.index: _ItemResult(item, None, None, ()) for item in items if item.muted}

    def label_of(position: int, item: ManifestItem) -> str:
        return f"{pending.index(item) + 1}/{len(pending)}" if item in pending else f"{position + 1}"

    def work(position: int, item: ManifestItem) -> _ItemResult:
        engine.check_cancelled(args.progress)
        return _words_for(item, words_dir / item.words_file, transcriber, progress, engine, args, label_of(position, item), activity)

    def landed(item: ManifestItem, result: _ItemResult) -> None:
        if item in pending and result.source == "reused":  # another item wrote its words file first
            progress.credit(item.length, f"Reused the words of item {label_of(playing.index(item), item)}")
        results[item.index] = result

    if workers <= 1 or len(playing) <= 1:
        for position, item in enumerate(playing):
            landed(item, work(position, item))
    else:
        pool = ThreadPoolExecutor(workers, thread_name_prefix="item")
        queue = coverage_pipeline.Pending(engine, args.progress)
        try:
            for position, item in enumerate(playing):
                queue.submit(pool, item, work, position, item)
            queue.drain(landed)
        finally:
            pool.shutdown(wait=True, cancel_futures=True)
    engine.check_cancelled(args.progress)
    return [results[item.index] for item in items]


def _covers_for(words: ItemWords, item: ManifestItem, args) -> bool:
    """Whether a words file serves this run: made by its own model, or by the larger model that already checked it (`checked_by`)."""
    larger = checked_by(args)
    return covers(words, item, args.model) or (larger is not None and covers(words, item, larger))


def _is_covered(words_dir: Path, item: ManifestItem, args) -> bool:
    cached = read_words_file(words_dir / item.words_file)
    return cached is not None and _covers_for(cached, item, args)


def _line(tag: str, payload: dict) -> str:
    return f"{tag}|{json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':'))}\n"


UNSURE_GAP_WORDS = 2
"""Confident words allowed between two unsure ones before they are separate passages."""

UNSURE_MIN_WORDS = 2
"""Unsure words a passage needs to be reported, unless one of them is far below the line."""

UNSURE_FAR_BELOW = 0.5
"""A single word under this share of the threshold is reported on its own."""


def unsure_runs(result: _ItemResult, below: float) -> list[dict]:
    """The passages of an analyzed item whose words Whisper was not sure of: runs of played words with a
    probability under `below`, joined across up to `UNSURE_GAP_WORDS` confident words. A run needs at
    least `UNSURE_MIN_WORDS` unsure words, or one far below the line. Words with no score are never unsure.
    Each is `{itemIndex, itemGuid, start, end, words, minScore}`, in the item's source seconds."""
    words = result.words
    if words is None or not words.scores or below <= 0:
        return []
    played = [
        (position, word, words.scores[position])
        for position, word in enumerate(words.words)
        if result.item.start_offset <= (word[1] + word[2]) / 2 <= result.item.end
    ]
    runs: list[list[tuple[int, Word, Score]]] = []
    quiet = UNSURE_GAP_WORDS + 1
    for entry in played:
        score = entry[2]
        if score is not None and score < below:
            if runs and quiet <= UNSURE_GAP_WORDS:
                runs[-1].append(entry)
            else:
                runs.append([entry])
            quiet = 0
        else:
            quiet += 1
    out = []
    for run in runs:
        lowest = min(score for _p, _w, score in run if score is not None)
        if len(run) < UNSURE_MIN_WORDS and lowest >= below * UNSURE_FAR_BELOW:
            continue
        out.append(
            {
                "itemIndex": result.item.index,
                "itemGuid": result.item.item_guid,
                "start": run[0][1][1],
                "end": run[-1][1][2],
                "words": len(run),
                "minScore": lowest,
            }
        )
    return out


def _words_report(results: Sequence[_ItemResult], unsure: Sequence[dict], rechecked: Sequence[dict]) -> str:
    """The words report the host aligns from: per playing item whether its words were reused or transcribed, then the passages
    Whisper doubted and the ones the pipeline re-checked."""
    lines = [
        _line("COVERAGE_WORDS", {"index": result.item.index, "itemGuid": result.item.item_guid, "words": result.source}) for result in results if result.source
    ]
    lines += [_line("COVERAGE_UNSURE", passage) for passage in unsure]
    lines += [_line("COVERAGE_RECHECKED", summary) for summary in rechecked]
    return "".join(lines)


def shared_transcriber(
    engine: ModuleType, args, model: str, budget: coverage_pipeline.ModelBudget | None, *, shared_instance: bool = False, model_dir: str | None = None
) -> WhisperTranscriber:
    """A transcriber of `model` that many item workers may call: the model is loaded once, with `budget.workers` concurrent calls
    allowed and `budget.threads` CPU threads for each, and with `shared_instance` (a GPU) the calls take turns on it."""
    progress_path = args.progress
    directory = args.model_dir if model_dir is None else model_dir

    def factory():  # pragma: no cover - needs a Whisper model
        with _PROGRESS_LOCK:
            engine.write_progress(progress_path, "LOAD", TRANSCRIBE_START_PCT, f"Loading Whisper model '{model}'...")
        if budget is None:
            return _load_whisper_model(model, directory, args.device)
        return _load_whisper_model(model, directory, args.device, budget.threads, budget.workers)

    hotwords = engine.load_vocabulary_hints(args.manuscript)
    return WhisperTranscriber(engine, model_size=model, language=args.language, hotwords=hotwords, model_factory=factory, serialize=shared_instance)


def _default_transcriber(
    engine: ModuleType,
    args,
    budget: coverage_pipeline.ModelBudget | None = None,
    *,
    shared_instance: bool = False,
    activity: coverage_activity.ActivityLog | None = None,
) -> Transcriber:
    """The first pass's transcriber. With a `budget` (an item pool), the plain transcriber is the shared one and a long item's chunk
    processes share the `budget.threads` one item worker owns, so the pool and the chunks together stay inside the processors."""
    plain = shared_transcriber(engine, args, args.model, budget, shared_instance=shared_instance)
    chunk_seconds = getattr(args, "chunk_seconds", 0) or 0
    workers = getattr(args, "parallel_workers", 0) or 0
    if chunk_seconds > 0:
        # `--parallel-workers` is every transcription at once: the item pool's workers share it, so a long item cut into
        # chunks starts its share of the processes and the run never holds more copies of the model than the host planned.
        sharers = 1 if budget is None else budget.workers
        if workers > 0 and budget is not None:
            workers = max(1, workers // budget.workers)
        return coverage_chunks.ChunkedTranscriber(
            engine,
            model_size=args.model,
            model_dir=args.model_dir,
            device=args.device,
            language=args.language,
            hotwords=plain._hotwords,
            chunk_seconds=chunk_seconds,
            overlap_seconds=getattr(args, "chunk_overlap_seconds", None) or coverage_chunks.DEFAULT_OVERLAP_SECONDS,
            workers=workers,
            progress_path=args.progress,
            plain=plain,
            cpus=None if budget is None else budget.threads,
            sharers=sharers,
            activity=activity,
        )
    return plain


def _item_workers(args, engine: ModuleType, model: str, pending: int) -> coverage_pipeline.ModelBudget:
    """How many items of `pending` this run transcribes at once with `model`, from the processors and `--parallel-workers`."""
    return coverage_pipeline.plan_item_workers(
        coverage_pipeline.cpus_for(args),
        getattr(args, "parallel_workers", 0) or 0,
        model,
        pending,
        getattr(args, "device", "cpu"),
        getattr(engine, "MAX_WORKERS_BY_MODEL", {}),
    )


def _pipelined(args) -> bool:
    """Whether this run is the one-process cascade: a re-check model and a score line were named."""
    return bool(getattr(args, "recheck_model", None)) and (getattr(args, "unsure_below", None) or 0) > 0


def run(args, engine: ModuleType, transcriber: Transcriber | None = None, recheck_transcriber: Transcriber | None = None) -> None:
    """The coverage mode. Raises `engine.Cancelled` on cancel; any other exception is a failure. With `--recheck-model` and a score
    line the first pass and the re-check of its doubtful passages run together (`coverage_pipeline.collect`); `recheck_transcriber`
    stands in for the larger model."""
    out = Path(args.out)
    out.unlink(missing_ok=True)  # a words report left from an earlier run must not pass for this one
    engine.write_progress(args.progress, "START", 0, "Starting...")
    engine.check_cancelled(args.progress)
    items = read_manifest(args.manifest)
    _chapter(engine, args.manuscript, args.chapter_id)  # refuse an unknown chapter before transcribing anything

    rechecked: list[dict] = []
    words_dir = Path(args.words_dir)
    todo = [item for item in items if not item.muted and not _is_covered(words_dir, item, args)]
    pending = len(todo)
    units = sum(units_of(item, args) for item in todo)
    requested = getattr(args, "parallel_workers", 0) or 0
    chunking = (getattr(args, "chunk_seconds", 0) or 0) > 0
    activity = coverage_activity.ActivityLog(coverage_activity.path_for(args.progress), model=args.model, workers=1, units=units, items=pending)
    if _pipelined(args):
        budget = coverage_pipeline.plan_budget(
            coverage_pipeline.cpus_for(args),
            getattr(args, "parallel_workers", 0) or 0,
            args.model,
            args.recheck_model,
            max(1, pending),
            getattr(args, "device", "cpu"),
            getattr(engine, "MAX_WORKERS_BY_MODEL", {}),
        )
        engine.log(
            "pipelined the model cascade",
            event="coverage.pipeline",
            first=[budget.first.workers, budget.first.threads],
            recheck=[budget.recheck.workers, budget.recheck.threads],
            cpus=budget.cpus,
        )
        activity.set_workers(max(budget.first.workers, requested if chunking else 0))
        activity.expect_recheck(args.recheck_model, budget.recheck.workers)
        first = transcriber or _default_transcriber(engine, args, budget.first, shared_instance=budget.shared_instance, activity=activity)
        recheck = recheck_transcriber or shared_transcriber(
            engine, args, args.recheck_model, budget.recheck, shared_instance=budget.shared_instance, model_dir=getattr(args, "recheck_model_dir", None)
        )
        results, rechecked = coverage_pipeline.collect(items, words_dir, first, recheck, engine, args, budget, activity)
    else:
        pool = _item_workers(args, engine, args.model, max(1, pending))
        activity.set_workers(max(pool.workers, requested if chunking else 0))
        results = _collect_words(
            items, words_dir, transcriber or _default_transcriber(engine, args, pool, activity=activity), engine, args, pool.workers, activity
        )

    activity.flush()
    engine.check_cancelled(args.progress)
    engine.write_progress(args.progress, "WRITE", WRITE_PCT, "Writing the words report...")
    below = getattr(args, "unsure_below", None) or 0.0
    unsure = [] if _pipelined(args) else [passage for result in results for passage in unchecked_runs(result, below, checked_by(args))]
    _write_atomically(out, _words_report(results, unsure, rechecked))
    engine.log(f"Wrote the words report of chapter {args.chapter_id} to {out}")
    engine.write_progress(args.progress, "DONE", 100, "Finished")


# ---------------------------------------------------------------------------
# the windows-only recheck mode


@dataclass(frozen=True)
class Window:
    """One window of audio to re-check with a stronger model, bounded by the words the first pass
    matched on either side of a missing region (planned by the host)."""

    item_index: int
    item_guid: str
    source_file: str
    words_file: str
    start: float
    end: float

    @property
    def length(self) -> float:
        return self.end - self.start


def _window(raw: object, position: int) -> Window:
    where = f"window {position}"
    if not isinstance(raw, dict):
        raise WindowsError(f"{where} is not an object")
    missing = sorted(_WINDOW_KEYS - raw.keys())
    unknown = sorted(raw.keys() - _WINDOW_KEYS)
    if missing or unknown:
        raise WindowsError(f"{where}: missing {missing}, unknown {unknown}")
    index = raw["itemIndex"]
    if not isinstance(index, int) or isinstance(index, bool) or index < 0:
        raise WindowsError(f"{where}: itemIndex must be a whole number, 0 or more")
    for key in ("itemGuid", "sourceFile"):
        if not isinstance(raw[key], str) or not raw[key]:
            raise WindowsError(f"{where}: {key} must be a non-empty string")
    if not isinstance(raw["wordsFile"], str) or not WORDS_FILE_NAME.fullmatch(raw["wordsFile"]):
        raise WindowsError(f"{where}: wordsFile must be a plain file name (letters, digits, '.', '_', '-')")
    if not _number(raw["start"]) or raw["start"] < 0:
        raise WindowsError(f"{where}: start must be a finite number of seconds, 0 or more")
    if not _number(raw["end"]) or raw["end"] <= raw["start"]:
        raise WindowsError(f"{where}: end must be a finite number of seconds after start")
    return Window(index, raw["itemGuid"], raw["sourceFile"], raw["wordsFile"], float(raw["start"]), float(raw["end"]))


def read_windows(path: str | os.PathLike) -> tuple[Window, ...]:
    """The `--recheck` windows file: what to re-transcribe and where to splice it, checked field by
    field before anything is opened, the same trust boundary as the manifest (threat-model row 4e)."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError, RecursionError) as exc:
        raise WindowsError(f"The coverage windows file could not be read: {exc}") from exc
    if not isinstance(data, dict) or data.get("schemaVersion") != WINDOWS_SCHEMA_VERSION:
        raise WindowsError(f"The coverage windows file is not schema version {WINDOWS_SCHEMA_VERSION}")
    raw_windows = data.get("windows")
    if not isinstance(raw_windows, list):
        raise WindowsError("The coverage windows file's windows must be a list")
    if not raw_windows:
        raise WindowsError("The coverage windows file has no windows")
    return tuple(_window(raw, position) for position, raw in enumerate(raw_windows))


def _overwrite_spans(spans: Sequence[Span], start: float, end: float, model: str) -> tuple[Span, ...]:
    """`spans`, a file's existing per-range model attribution, with `[start, end]` reassigned to
    `model`: a span the window covers wholly is dropped, one it straddles is split at the window's
    edge and the part outside the window keeps its own model."""
    kept: list[Span] = []
    for span in spans:
        if span.end <= start or span.start >= end:
            kept.append(span)
            continue
        if span.start < start:
            kept.append(Span(span.start, start, span.model))
        if span.end > end:
            kept.append(Span(end, span.end, span.model))
    kept.append(Span(start, end, model))
    return tuple(sorted(kept, key=lambda span: span.start))


def splice_window(existing: ItemWords, window: Window, new: Sequence[Word] | ItemWords, model: str) -> ItemWords:
    """`existing` with `window`'s range re-checked: the words it replaced are gone, the window's
    own new words stand in for them (edge words dropped), and the range is reattributed to `model`
    in `spans`. `existing.model` is left as it was, for compatibility. `new` may be the re-check's
    `ItemWords`, whose scores then come along with the words; plain words have none."""
    new_words = new.words if isinstance(new, ItemWords) else tuple(new)
    new_scores = new.scores if isinstance(new, ItemWords) else ()
    kept = [(word, existing.score_of(position)) for position, word in enumerate(existing.words) if not (window.start <= (word[1] + word[2]) / 2 <= window.end)]
    added = [(word, new_scores[position] if new_scores else None) for position, word in enumerate(new_words) if window.start < word[1] and word[2] < window.end]
    merged = sorted(kept + added, key=lambda pair: pair[0][1])
    words = tuple(word for word, _score in merged)
    scores = tuple(score for _word, score in merged) if any(score is not None for _word, score in merged) else ()
    spans = _overwrite_spans(existing.spans_or_default(), window.start, window.end, model)
    return replace(existing, words=words, spans=spans, scores=scores)


def run_recheck(args, engine: ModuleType, transcriber: Transcriber | None = None) -> None:
    """The windows-only recheck mode (`--coverage --recheck`): transcribes
    only the given windows with `--model`, one model load for the run, and splices the new words
    into each affected words file. Touches no manifest, chapter or timeline, and writes no results
    file. Raises `engine.Cancelled` on cancel; any other exception is a failure."""
    engine.write_progress(args.progress, "START", 0, "Starting...")
    engine.check_cancelled(args.progress)
    windows = read_windows(args.recheck)
    words_dir = Path(args.words_dir)
    by_file: dict[str, list[Window]] = {}
    for window in windows:
        by_file.setdefault(window.words_file, []).append(window)
    unchecked: dict[str, list[Window]] = {}
    for words_file, file_windows in by_file.items():
        cached = read_words_file(words_dir / words_file)
        if cached is None:
            raise WindowsError(f"The coverage windows file names {words_file!r}, which has no words cached to splice into.")
        # A window this model has already transcribed is checked: splicing it again would cost the same work for the same words.
        done = checked_ranges(cached, args.model)
        if remaining := [window for window in file_windows if not inside_ranges(window.start, window.end, done)]:
            unchecked[words_file] = remaining
    by_file = unchecked
    windows = [window for file_windows in by_file.values() for window in file_windows]

    pool = _item_workers(args, engine, args.model, len(by_file))
    transcribe = transcriber or _default_transcriber(engine, args, pool)
    progress = _Progress(engine, args.progress, sum(window.length for window in windows))
    # This stage's windows are the run's only work, so they are the log's "first pass"; the host reads them as the re-check's (activity.go).
    activity = coverage_activity.ActivityLog(
        coverage_activity.path_for(args.progress), model=args.model, workers=pool.workers, units=len(windows), items=len(by_file)
    )

    def recheck_file(words_file: str, file_windows: list[Window]) -> None:
        """One words file's windows, in order, then one atomic write: a file has a single writer however many files run at once."""
        path = words_dir / words_file
        existing = read_words_file(path)
        for number, window in enumerate(file_windows):
            engine.check_cancelled(args.progress)
            label = f"item {window.item_index}"
            progress.report("DECODE", progress.pct, f"Decoding the re-check window of {label}...")
            key = ("window", words_file, number)
            item = ManifestItem(window.item_index, window.item_guid, window.source_file, window.start, window.length, words_file, False)

            def on_seconds(seconds: float, _key=key, _length=window.length, _label=label) -> None:
                engine.check_cancelled(args.progress)
                done = min(max(seconds, 0.0), _length)
                progress.update(_key, done, f"Re-checking {_label}... {engine.format_time(done)} / {engine.format_time(_length)}")

            activity.working(key)
            try:
                result = transcribe(item, on_seconds)
            finally:
                activity.working(key, 0)
            existing = splice_window(existing, window, result, args.model)
            progress.finish(key, window.length, f"Re-checked {label}")
            activity.unit_done()
        write_words_file(path, existing)
        activity.item_done()

    if pool.workers <= 1 or len(by_file) <= 1:
        for words_file, file_windows in by_file.items():
            recheck_file(words_file, file_windows)
    else:
        executor = ThreadPoolExecutor(pool.workers, thread_name_prefix="re-check")
        queue = coverage_pipeline.Pending(engine, args.progress)
        try:
            for words_file, file_windows in by_file.items():
                queue.submit(executor, words_file, recheck_file, words_file, file_windows)
            queue.drain(lambda _tag, _outcome: None)
        finally:
            executor.shutdown(wait=True, cancel_futures=True)
    activity.flush()
    engine.check_cancelled(args.progress)
    engine.write_progress(args.progress, "DONE", 100, "Finished")
