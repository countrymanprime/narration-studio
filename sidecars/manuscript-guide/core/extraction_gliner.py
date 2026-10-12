"""The GLiNER source of the extraction port (SN-X71): candidate names from an optional, separately installed model.

GLiNER labels spans of text with the labels it is asked for. This adapter asks for the labels in ``LABELS`` and offers
each name it finds as an ``entry`` suggestion: the type is the label's Story Bible category, the confidence is the score
GLiNER gave the span (``None`` when it gave none), and the quote is the sentence the span is in, a verbatim slice of its
paragraph. GLiNER does not group names, attribute speech or read properties, so it offers no alias, speaker, property,
relationship or claim. A name found more than once is offered once, from the span with the highest score.

Nothing here reaches the network. The model and its Python packages are an optional download the host installs through
the asset registry (``config/analysis-assets.json``, ADR 0848); the host passes that install folder as ``--install``. The
loader puts the folder's unpacked wheels on ``sys.path``, tells Hugging Face to stay offline, and loads the weights from
the folder; the freeze never carries ``gliner``, ``transformers`` or ``torch`` (``scripts/release/prepare-resources.py``).
A missing or damaged install is a sentence for the narrator, never a traceback.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol

import extraction_rules
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

# The files an install must have before the adapter tries to load it: the weights, their config and the gliner wheel.
REQUIRED_FILES = ("pytorch_model.bin", "gliner_config.json")
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
    from gliner import GLiNER

    return GLiNER.from_pretrained(str(install), local_files_only=True)


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
                key = guide.normalize_name(name) or name.lower()
                held = best.get(key)
                if held is not None and (score is None or (held["confidence"] is not None and held["confidence"] >= score)):
                    continue
                best[key] = {
                    "payload": {"kind": "entry", "name": name, "type": LABELS[item["label"]], "aliases": [], "description": "", "appearsIn": []},
                    "confidence": score,
                    "quotes": [{"paragraphId": paragraph["id"], "text": extraction_rules.sentence_around(paragraph["text"], start, end)}],
                    "chapterId": paragraph.get("chapterId", ""),
                }
        return list(best.values())


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


def suggest(args: argparse.Namespace, loader: Callable[[Path], Model] = load_model) -> None:
    """``suggest --source gliner --manuscript M --install DIR``: print GLiNER's suggestions as JSON lines. It writes nothing."""
    extractor = GlinerSource(args.install or None, loader=loader).extractor()
    for raw in extractor.extract({"paragraphs": _paragraphs(args.manuscript)}):
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
