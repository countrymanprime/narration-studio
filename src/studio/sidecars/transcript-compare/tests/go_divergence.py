"""The host's take-divergence alignment, for this sidecar's test tooling.

The sidecar only transcribes the takes: the host builds the span, aligns each take's words to it and writes the results
(`src/studio/desktop/internal/takedivergence`). The divergence harness measures that Go code through the same
`src/studio/desktop/cmd/proof-align` server as `go_coverage.py`. The names here are the ones `take_divergence.py` had, so
the harness reads as it did. The project's equivalence list is not passed: the harness has none. Nothing here ships.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from types import ModuleType

import go_coverage

MATCHED = "matched"
MISREAD = "misread"
SKIPPED = "skipped"
UNREAD = "unread"
EXTRA = "extra"
BEFORE = "before"
WITHIN = "within"
AFTER = "after"

Word = tuple[str, float, float]
"""A transcript word: text, start and end in seconds from the start of the take's range."""


@dataclass(frozen=True)
class SpanWord:
    index: int
    text: str
    unit: int
    paragraph: int
    tokens: tuple[str, ...]


@dataclass(frozen=True)
class Span:
    """The spoken words of sentence units first_unit..last_unit, and the paragraphs they are in."""

    first_unit: int
    last_unit: int
    first_paragraph: int
    last_paragraph: int
    words: tuple[SpanWord, ...]
    paragraphs: tuple[str, ...] = ()


@dataclass(frozen=True)
class WordResult:
    index: int
    status: str
    start: float | None
    end: float | None


@dataclass(frozen=True)
class Divergence:
    """One place a take departs from the span; an extra sits before first_word (None after the last word)."""

    kind: str
    position: str
    first_word: int | None
    last_word: int | None
    manuscript_text: str
    audio_text: str
    start: float | None
    end: float | None


@dataclass(frozen=True)
class TakeAlignment:
    words: tuple[WordResult, ...]
    divergences: tuple[Divergence, ...]
    extra_words: int


def build_span(_engine: ModuleType, paragraphs: Sequence[str], first_unit: int, last_unit: int) -> Span:
    """The span as the host builds it; a span outside the chapter raises go_coverage.AlignError with the host's message."""
    reply = go_coverage._SERVER.request({"op": "span", "paragraphs": list(paragraphs), "firstUnit": first_unit, "lastUnit": last_unit})
    words = tuple(SpanWord(w["index"], w["text"], w["unit"], w["paragraph"], tuple(w["tokens"])) for w in reply["words"])
    return Span(reply["firstUnit"], reply["lastUnit"], reply["firstParagraph"], reply["lastParagraph"], words, tuple(paragraphs))


def align_take(_engine: ModuleType, span: Span, transcript: Sequence[Word]) -> TakeAlignment:
    """One take's words aligned to span as the host aligns them, times in seconds from the start of the take's range."""
    reply = go_coverage._SERVER.request(
        {
            "op": "alignTake",
            "paragraphs": list(span.paragraphs),
            "firstUnit": span.first_unit,
            "lastUnit": span.last_unit,
            "words": [[text, float(start), float(end)] for text, start, end in transcript],
        }
    )
    words = tuple(WordResult(w["index"], w["status"], w["start"], w["end"]) for w in reply["words"])
    divergences = tuple(
        Divergence(d["kind"], d["position"], d["firstWord"], d["lastWord"], d["manuscriptText"], d["audioText"], d["start"], d["end"])
        for d in reply["divergences"]
    )
    return TakeAlignment(words, divergences, reply["extraWords"])
