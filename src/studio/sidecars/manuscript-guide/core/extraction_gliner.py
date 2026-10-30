"""The GLiNER source of the extraction port (SN-X71): candidate names from an optional, separately installed model.

GLiNER labels spans of text with the labels it is asked for. This adapter asks for the labels in ``LABELS`` and offers
each name it finds as an ``entry`` suggestion: the type is the label's Story Bible category, the confidence is the score
GLiNER gave the span (``None`` when it gave none), and the quote is the sentence the span is in, a verbatim slice of its
paragraph. GLiNER does not group names, attribute speech or read properties, so it offers no alias, speaker, property,
relationship or claim. A name found more than once is offered once, from the span with the highest score.

Nothing here reaches the network. The model and its Python packages are an optional download the host installs through
the asset registry (``config/analysis-assets.json``); the host passes that install folder as ``--install``. The
loader puts the folder's unpacked wheels on ``sys.path``, tells Hugging Face to stay offline, and loads the weights from
the folder; the freeze never carries ``gliner``, ``transformers`` or ``torch`` (``scripts/release/prepare-resources.py``).
A missing or damaged install is a sentence for the narrator, never a traceback.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import multiprocessing
import os
import sys
import threading
from collections.abc import Callable, Iterable, Iterator
from concurrent.futures import Executor, ProcessPoolExecutor
from pathlib import Path
from typing import Any, Protocol

import manuscript_guide as guide
from narration_common.logging_utils import log
from narration_common.ports.extraction import AVAILABLE, BUILT_IN, GLINER, Availability, Book, RawSuggestion

# What GLiNER is asked to find, and the Story Bible category each label becomes. The labels are the prompts the model
# reads (the 2026-10-10 trial used character, place and object); the values are guide.VALID_CATEGORIES.
LABELS = {
    "character": "Character",
    "place": "Place",
    "object": "Item",
    "group": "Organization",
}

# Spans GLiNER scores below this are dropped before they reach the narrator. 0.5 is GLiNER's own default threshold and
# the one the 2026-10-10 trial measured recall at (docs/research/studio-next-gliner-spike.md); below it the trial's
# false positives ("she", "the hedgehog") outnumber names. The score is not calibrated: the 75% rule still decides.
SCORE_FLOOR = 0.5

# GLiNER reads at most a few hundred tokens at once; a longer paragraph is read in windows of this many words, as the
# trial chunked its chapters.
CHUNK_WORDS = 180

# A chapter longer than this many words is read in pieces cut between paragraphs when a scan reads chapters side by side: the
# pieces keep the workers evenly loaded (docs/research/studio-next-extraction-chunking-benchmark.md: 1.9x against 1.6x on a 60k-word book).
CHAPTER_WORDS = 1500

# The encoder gliner_config.json names. GLiNER builds it from its config and its tokenizer by that name; the install carries the
# encoder's config.json, SentencePiece vocabulary and tokenizer config under Hugging Face's own names (no weights: pytorch_model.bin
# holds every encoder parameter). GLiNER reads a tokenizer_config.json beside its weights instead of fetching one, and
# ``_local_encoder`` reads the config from the install instead of a request to Hugging Face.
ENCODER = "microsoft/deberta-v3-small"
ENCODER_FILES = ("config.json", "spm.model", "tokenizer_config.json")

REQUIRED_FILES = ("pytorch_model.bin", "gliner_config.json", *ENCODER_FILES)
GLINER_WHEEL = "wheel-gliner"
WHEEL_PREFIX = "wheel-"

NOT_DOWNLOADED = "GLiNER is not downloaded."

DESCRIPTOR = next(row for row in BUILT_IN if row.name == GLINER)


class Model(Protocol):
    """What the adapter needs of ``gliner.GLiNER``."""

    def predict_entities(self, text: str, labels: list[str], threshold: float = 0.5) -> list[dict[str, Any]]:
        """The spans of ``text`` with one of ``labels``: ``start``, ``end``, ``text``, ``label`` and ``score``."""
        ...


def damage(install: Path | None) -> str:
    """Why ``install`` cannot be loaded, as a sentence, or ``""`` when every file the adapter needs is there."""
    if install is None or not Path(install).is_dir():
        return NOT_DOWNLOADED
    missing = [name for name in (*REQUIRED_FILES, GLINER_WHEEL) if not (Path(install) / name).exists()]
    if missing:
        return f"GLiNER's download is damaged: {', '.join(missing)} is missing. Repair it in Analysis tools."
    return ""


def load_model(install: Path) -> Model:
    """Loads GLiNER from ``install`` alone: its unpacked wheels go on ``sys.path`` and the weights are read by path."""
    install = Path(install)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    for wheel in sorted(install.glob(WHEEL_PREFIX + "*"), reverse=True):
        if str(wheel) not in sys.path:
            sys.path.insert(0, str(wheel))
    with _local_encoder(install):
        from gliner import GLiNER

        return GLiNER.from_pretrained(str(install), local_files_only=True)


@contextlib.contextmanager
def _local_encoder(install: Path) -> Iterator[None]:
    """While GLiNER loads, ``AutoConfig.from_pretrained`` of ``ENCODER`` reads the install folder's config.json instead, so the load
    names no repository. Any other name (the install folder, which the tokenizer reads) goes to the real loader, offline."""
    from transformers import AutoConfig

    real = AutoConfig.__dict__["from_pretrained"]

    def config(cls: Any, name: Any, *args: Any, **kwargs: Any) -> Any:
        if str(name) == ENCODER:
            name, kwargs = str(install), {**kwargs, "local_files_only": True}
        return real.__func__(cls, name, *args, **kwargs)

    AutoConfig.from_pretrained = classmethod(config)
    try:
        yield
    finally:
        AutoConfig.from_pretrained = real


def _chunks(text: str) -> list[tuple[int, str]]:
    """``text`` in windows of at most CHUNK_WORDS words, each with the offset it starts at."""
    starts, at = [], 0
    for word in text.split():
        at = text.index(word, at)
        starts.append(at)
        at += len(word)
    if len(starts) <= CHUNK_WORDS:
        return [(0, text)]
    out = []
    for first in range(0, len(starts), CHUNK_WORDS):
        start = starts[first]
        end = starts[first + CHUNK_WORDS] if first + CHUNK_WORDS < len(starts) else len(text)
        out.append((start, text[start:end]))
    return out


class GlinerExtractor:
    """The extract role over a loaded model."""

    def __init__(self, model: Model, log_line: Callable[[str], None]):
        self.model = model
        self.log = log_line

    def _spans(self, paragraph: dict[str, str]) -> list[tuple[dict[str, Any], int, int]]:
        """The spans of one paragraph whose label is in LABELS and whose text is at the offsets given, in paragraph offsets."""
        text = paragraph["text"]
        found = []
        for offset, chunk in _chunks(text):
            for item in self.model.predict_entities(chunk, list(LABELS), threshold=SCORE_FLOOR):
                if item.get("label") not in LABELS:
                    continue
                score = item.get("score")
                if score is not None and float(score) < SCORE_FLOOR:
                    continue
                start, end = offset + int(item["start"]), offset + int(item["end"])
                name = str(item.get("text", "")).strip()
                if not name or text[start:end].strip() != name:
                    self.log(f"Dropped a GLiNER name: {name!r} is not at the place it was found in paragraph {paragraph['id']!r}.")
                    continue
                found.append((item, start, end))
        return found

    def extract(self, book: Book) -> list[RawSuggestion]:
        """One entry suggestion per name, from the span with the highest score (the first when none has one)."""
        best: dict[str, RawSuggestion] = {}
        for paragraph in book["paragraphs"]:
            for item, start, end in self._spans(paragraph):
                name = paragraph["text"][start:end].strip()
                score = None if item.get("score") is None else float(item["score"])
                offered: RawSuggestion = {
                    "payload": {"kind": "entry", "name": name, "type": LABELS[item["label"]], "aliases": [], "description": "", "appearsIn": []},
                    "confidence": score,
                    "quotes": [{"paragraphId": paragraph["id"], "text": guide.sentence_around(paragraph["text"], start, end)}],
                    "chapterId": paragraph.get("chapterId", ""),
                }
                keep_better(best, offered)
        return list(best.values())


def name_key(raw: RawSuggestion) -> str:
    """The key a name is offered once under: its letters and digits, lower case."""
    name = raw["payload"]["name"]
    return guide.normalize_name(name) or name.lower()


def keep_better(best: dict[str, RawSuggestion], raw: RawSuggestion) -> None:
    """Holds ``raw`` under its name unless the name is held with a score at least as high (the first one holds on a tie, and a
    held score is never replaced by none)."""
    key, held, score = name_key(raw), best.get(name_key(raw)), raw["confidence"]
    if held is not None and (score is None or (held["confidence"] is not None and held["confidence"] >= score)):
        return
    best[key] = raw


def merge(parts: Iterable[list[RawSuggestion]]) -> list[RawSuggestion]:
    """Per-chunk results, in manuscript order, as the one result a whole-book read would give: a name is offered once, from the
    highest score, and the names stay in the order they were first met. GLiNER keeps nothing between paragraphs, so this is
    exactly the whole-book result."""
    best: dict[str, RawSuggestion] = {}
    for part in parts:
        for raw in part:
            keep_better(best, raw)
    return list(best.values())


def chunks_of(paragraphs: list[dict[str, str]], max_words: int = CHAPTER_WORDS) -> list[list[dict[str, str]]]:
    """The paragraphs grouped by chapter in manuscript order; a chapter over ``max_words`` is cut between paragraphs (one
    paragraph is never split, so a suggestion's quote stays inside its paragraph)."""
    out: list[list[dict[str, str]]] = []
    size = 0
    for paragraph in paragraphs:
        words = len(paragraph["text"].split())
        new_chapter = not out or out[-1][0].get("chapterId", "") != paragraph.get("chapterId", "")
        if new_chapter or size + words > max_words:
            out.append([])
            size = 0
        out[-1].append(paragraph)
        size += words
    return out


class GlinerSource:
    """The GLiNER row. ``install`` is the folder the host installed the tool in, or ``None`` when it is not installed;
    ``loader`` loads a model from it (``load_model``, or a fake in a test)."""

    descriptor = DESCRIPTOR

    def __init__(self, install: str | Path | None, loader: Callable[[Path], Model] = load_model, log: Callable[[str], None] = log):
        self.install = Path(install) if install else None
        self.loader = loader
        self.log = log

    def available(self) -> Availability:
        """Whether every file of the install is there; it loads nothing."""
        reason = damage(self.install)
        return Availability(False, reason) if reason else AVAILABLE

    def extractor(self) -> GlinerExtractor:
        """Loads the model, or refuses with the reason it cannot."""
        availability = self.available()
        if not availability.ok:
            raise self.descriptor.unavailable(availability.reason)
        assert self.install is not None
        try:
            model = self.loader(self.install)
        except Exception as exc:
            raise self.descriptor.unavailable(f"GLiNER could not be loaded: {str(exc) or type(exc).__name__}. Repair it in Analysis tools.") from exc
        return GlinerExtractor(model, self.log)


def line(raw: RawSuggestion) -> dict[str, Any]:
    """One line of ``suggest --source gliner``: the raw suggestion under its source's name."""
    return {"source": GLINER, **raw}


def _paragraphs(manuscript: str) -> list[dict[str, str]]:
    return [{"id": p["paragraphId"], "chapterId": p.get("chapterId", ""), "text": p["text"]} for p in guide.load_manuscript(manuscript)]


def process_pool(workers: int, install: str, threads: int) -> Executor:
    """A pool of ``workers`` processes, each loading the model from ``install`` once and limited to ``threads`` torch threads."""
    return ProcessPoolExecutor(workers, mp_context=multiprocessing.get_context("spawn"), initializer=_start_worker, initargs=(install, threads))


_worker: GlinerExtractor | None = None


def watch_parent(parent: Any, leave: Callable[[], None], interval: float = 1.0) -> threading.Thread:
    """Starts a thread that calls ``leave`` once ``parent`` (a ``multiprocessing`` process) is no longer alive. A cancelled scan
    kills the sidecar, not the workers it started; without this they run on, a chunk at a time, until the machine is restarted."""

    def watch() -> None:
        while parent.is_alive():
            threading.Event().wait(interval)
        leave()

    thread = threading.Thread(target=watch, daemon=True)
    thread.start()
    return thread


def _start_worker(install: str, threads: int) -> None:
    """A pool process's start: watches the sidecar that started it, loads the model and limits torch to ``threads`` threads (the
    cores are shared by the workers)."""
    global _worker
    if (parent := multiprocessing.parent_process()) is not None:
        watch_parent(parent, lambda: os._exit(1))
    # The model loads first: loading puts the install's unpacked wheels (torch among them) on sys.path, which a frozen worker needs
    # before it can import torch.
    model = load_model(Path(install))
    limit_threads(threads)
    _worker = GlinerExtractor(model, log)


def _read_chunk(paragraphs: list[dict[str, str]]) -> list[RawSuggestion]:
    assert _worker is not None
    return _worker.extract({"paragraphs": paragraphs})


def note_line(text: str) -> str:
    """A sentence for the narrator, printed ahead of the suggestions: the host shows it in the scan's result box."""
    return json.dumps({"note": text}, ensure_ascii=False)


def progress_line(done: int, total: int, failed: list[str]) -> str:
    """The record printed after each chunk is read, ahead of the suggestions: ``done`` of ``total`` chunks, and the ids of the
    chapters whose chunk could not be read. The host shows it in the scan's result box and does not take it for a suggestion."""
    return json.dumps({"progress": {"done": done, "total": total, "failed": failed}}, ensure_ascii=False)


def read_chunks(
    paragraphs: list[dict[str, str]],
    workers: int,
    pool: Callable[[int], Executor],
    reader: Callable[[list[dict[str, str]]], list[RawSuggestion]] = _read_chunk,
    report: Callable[[str], None] = lambda text: print(text, flush=True),
) -> list[RawSuggestion]:
    """Reads the manuscript chapter by chapter with ``workers`` processes at once and merges the results in manuscript order, so
    the answer does not depend on which worker finishes first. A chunk that cannot be read is logged and left out; the others are
    kept. Raises only when no chunk could be read."""
    chunks = chunks_of(paragraphs)
    parts: list[list[RawSuggestion]] = []
    failed: list[str] = []
    problems: list[str] = []
    with pool(min(workers, len(chunks))) as executor:
        futures = [executor.submit(reader, chunk) for chunk in chunks]
        for done, (chunk, future) in enumerate(zip(chunks, futures, strict=True), 1):
            try:
                parts.append(future.result())
            except Exception as exc:  # noqa: BLE001 (any reader failure costs one chunk, not the scan)
                chapter = chunk[0].get("chapterId", "")
                problems.append(f"{type(exc).__name__}: {exc}")
                log(f"GLiNER could not read a part of chapter {chapter!r}: {exc}", level="warn")
                if chapter not in failed:
                    failed.append(chapter)
            report(progress_line(done, len(chunks), failed))
    if len(problems) == len(chunks):
        raise ValueError(f"GLiNER could not read the book: {problems[0]}")
    return merge(parts)


def limit_threads(threads: int) -> None:
    """Limits torch to ``threads`` threads in this process. Two sources reading at once with a thread for every processor each
    run more than four times slower than one after the other (4 processors, 2026-10-29): the host names a budget instead."""
    import torch

    torch.set_num_threads(max(1, threads))


def read_whole(args: argparse.Namespace, paragraphs: list[dict[str, str]], loader: Callable[[Path], Model]) -> list[RawSuggestion]:
    """The one-process read of the whole manuscript, with torch limited to ``--threads`` when the host named a budget."""
    threads = getattr(args, "threads", 0) or 0

    def limited(install: Path) -> Model:
        model = loader(install)
        if threads:
            limit_threads(threads)
        return model

    return GlinerSource(args.install or None, loader=limited).extractor().extract({"paragraphs": paragraphs})


def suggest(args: argparse.Namespace, loader: Callable[[Path], Model] = load_model) -> None:
    """``suggest --source gliner --manuscript M --install DIR [--workers N]``: print GLiNER's suggestions as JSON lines. It writes
    nothing. ``--threads`` is the most torch threads all its processes use together (0: every processor). With ``--workers`` 2 or more the chapters are read side by side, each worker its own copy of the model, and a progress
    record (``progress_line``) is printed after each chunk."""
    paragraphs = _paragraphs(args.manuscript)
    workers = min(max(1, getattr(args, "workers", 1) or 1), len(chunks_of(paragraphs)))
    if workers > 1:
        # The source checks the install first, as the one-process read does, so a missing download is the same sentence.
        reason = damage(Path(args.install) if args.install else None)
        if reason:
            raise DESCRIPTOR.unavailable(reason)
        budget = getattr(args, "threads", 0) or os.cpu_count() or 1
        try:
            found = read_chunks(paragraphs, workers, lambda n: process_pool(n, str(args.install), max(1, budget // n)))
        except Exception as exc:  # noqa: BLE001 (workers that cannot start, or die: the book is read whole instead)
            log(f"GLiNER's workers failed: {type(exc).__name__}: {exc}", level="warn")
            print(note_line("GLiNER could not run its workers side by side, so it read the book in one piece."), flush=True)
            found = read_whole(args, paragraphs, loader)
    else:
        found = read_whole(args, paragraphs, loader)
    for raw in found:
        print(json.dumps(line(raw), ensure_ascii=False))


def version(install: Path) -> str:
    """The version of the gliner wheel in ``install``, read from its metadata without importing it."""
    for metadata in sorted((Path(install) / GLINER_WHEEL).glob("gliner-*.dist-info/METADATA")):
        for text in metadata.read_text(encoding="utf-8").splitlines():
            if text.startswith("Version:"):
                return text.split(":", 1)[1].strip()
    raise ValueError("the gliner wheel has no version in its metadata")


def self_check(install: str | Path | None) -> dict[str, Any]:
    """The smoke test's line for GLiNER: its version when installed, "not installed" when not (a pass: it is optional),
    and a failure only for an install that is there but damaged."""
    reason = damage(Path(install) if install else None)
    if reason == NOT_DOWNLOADED:
        return {"name": "gliner", "ok": True, "detail": "not installed"}
    if reason:
        return {"name": "gliner", "ok": False, "detail": reason}
    try:
        return {"name": "gliner", "ok": True, "detail": f"gliner {version(Path(install))}"}
    except (OSError, ValueError) as exc:
        return {"name": "gliner", "ok": False, "detail": str(exc)}
