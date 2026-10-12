"""Precision, recall, F1, the confidence-bin table, the confident-but-wrong share and the threshold rule of the protocol.

Pure functions over lists of dicts; nothing here reads a file or runs a tool.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass, field
from itertools import pairwise
from typing import Any

from .fingerprint import QUOTE_KINDS, fingerprint, fold

# The bin edges of the protocol: <0.5, 0.5-0.6 ... 0.9-1.0, plus a row for no confidence.
EDGES = (0.0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0)
MIN_BIN_ITEMS = 30
MIN_KIND_ITEMS = 30
VERIFY_BELOW = 0.75
TARGET_SHARE = 0.95
WILSON_Z = 1.96


@dataclass(frozen=True)
class Judged:
    """One emitted item after matching: ``correct`` is None while nobody has judged it."""

    kind: str
    confidence: float | None
    fp: str
    correct: bool | None
    quote_ok: bool = True


@dataclass
class KindScore:
    kind: str
    emitted: int = 0
    judged: int = 0
    unjudged: int = 0
    correct: int = 0
    gold: int = 0
    found: int = 0
    precision: float | None = None
    recall: float | None = None
    f1: float | None = None


@dataclass
class Bin:
    label: str
    items: int
    correct: int
    note: str = ""
    share: float | None = field(init=False, default=None)
    wilson_low: float | None = field(init=False, default=None)

    def __post_init__(self) -> None:
        self.share = self.correct / self.items if self.items else None
        self.wilson_low = wilson_lower(self.correct, self.items)


def wilson_lower(correct: int, items: int, z: float = WILSON_Z) -> float | None:
    """The lower end of the Wilson score interval for ``correct`` of ``items``."""
    if items == 0:
        return None
    p = correct / items
    denominator = 1 + z * z / items
    centre = p + z * z / (2 * items)
    margin = z * math.sqrt(p * (1 - p) / items + z * z / (4 * items * items))
    return (centre - margin) / denominator


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def f1_of(precision: float | None, recall: float | None) -> float | None:
    if precision is None or recall is None or precision + recall == 0:
        return None if precision is None or recall is None else 0.0
    return 2 * precision * recall / (precision + recall)


def quote_ok(item: dict[str, Any], paragraphs: dict[str, str] | None) -> bool:
    """The evidence check: every quote of ``item`` is in the paragraph it names (typography folded). A kind that needs a
    quote and has none fails. With no paragraphs to check against, the check passes (the offline fakes have no book)."""
    quotes = item.get("quotes") or []
    kind = item.get("payload", {}).get("kind", "")
    if kind in QUOTE_KINDS and not quotes:
        return False
    if paragraphs is None:
        return True
    for quote in quotes:
        text = paragraphs.get(quote.get("paragraphId", ""))
        if not quote.get("text") or text is None or fold(quote["text"]) not in fold(text):
            return False
    return True


def judge(
    emitted: Iterable[dict[str, Any]],
    gold_fps: set[str],
    adjudicated: dict[str, bool],
    paragraphs: dict[str, str] | None = None,
) -> list[Judged]:
    """Match each emitted item to the gold. An item is correct when its fingerprint is a gold item or was adjudicated
    valid, and wrong when it was adjudicated invalid or its quote fails the evidence check; otherwise it is unjudged.
    The same fingerprint offered twice counts once, at its highest confidence."""
    best: dict[str, dict[str, Any]] = {}
    for item in emitted:
        fp = fingerprint(item["payload"])
        if not fp:
            continue
        held = best.get(fp)
        if held is None or (item.get("confidence") or -1) > (held.get("confidence") or -1):
            best[fp] = item
    out = []
    for fp, item in best.items():
        ok = quote_ok(item, paragraphs)
        if fp in gold_fps or adjudicated.get(fp) is True:
            correct: bool | None = ok
        elif adjudicated.get(fp) is False or not ok:
            correct = False
        else:
            correct = None
        out.append(Judged(item["payload"]["kind"], item.get("confidence"), fp, correct, ok))
    return out


def score_kinds(judged: list[Judged], gold_by_kind: dict[str, set[str]], adjudicated: dict[str, bool], kinds: Iterable[str]) -> dict[str, KindScore]:
    """Precision over judged items, recall over the pooled gold (gold plus adjudicated-valid items), F1 of the two."""
    result = {}
    for kind in kinds:
        row = KindScore(kind)
        mine = [j for j in judged if j.kind == kind]
        pool = set(gold_by_kind.get(kind, set())) | {fp for fp, valid in adjudicated.items() if valid and fp.startswith(kind + "|")}
        row.emitted = len(mine)
        row.unjudged = sum(j.correct is None for j in mine)
        row.judged = row.emitted - row.unjudged
        row.correct = sum(j.correct is True for j in mine)
        row.gold = len(pool)
        row.found = len({j.fp for j in mine if j.correct is True} & pool)
        row.precision = _ratio(row.correct, row.judged)
        row.recall = _ratio(row.found, row.gold)
        row.f1 = f1_of(row.precision, row.recall)
        result[kind] = row
    return result


def _bin_label(low: float, high: float) -> str:
    return f"<{high:.1f}" if low == EDGES[0] and high == EDGES[1] else f"{low:.1f}-{high:.1f}"


def confidence_bins(judged: Iterable[Judged]) -> list[Bin]:
    """The confidence table: the protocol's bins over judged items with a confidence, then a ``null`` row. A bin under
    MIN_BIN_ITEMS is merged into its lower neighbour (its upper one when it is the lowest) and says so."""
    judged = [j for j in judged if j.correct is not None]
    raw: list[list[Any]] = []  # [low, high, items, correct, note]
    for low, high in pairwise(EDGES):
        last = high == EDGES[-1]
        inside = [j for j in judged if j.confidence is not None and low <= j.confidence and (j.confidence <= high if last else j.confidence < high)]
        raw.append([low, high, len(inside), sum(j.correct is True for j in inside), ""])
    merged = True
    while merged and len(raw) > 1:
        merged = False
        for index, row in enumerate(raw):
            if 0 < row[2] < MIN_BIN_ITEMS:
                target = index - 1 if index > 0 else index + 1
                other = raw[target]
                low, high = min(row[0], other[0]), max(row[1], other[1])
                note = f"merged: a bin under {MIN_BIN_ITEMS} items"
                raw[min(index, target)] = [low, high, row[2] + other[2], row[3] + other[3], note]
                del raw[max(index, target)]
                merged = True
                break
    bins = [Bin(_bin_label(low, high), items, correct, note) for low, high, items, correct, note in raw]
    nulls = [j for j in judged if j.confidence is None]
    bins.append(Bin("null", len(nulls), sum(j.correct is True for j in nulls)))
    return bins


def confident_but_wrong(judged: Iterable[Judged], threshold: float = VERIFY_BELOW) -> tuple[int, int]:
    """(wrong, applied): of the judged items that would be applied (confidence at or above ``threshold``, quote verified),
    how many are wrong. The entry-present condition of the app's rule is not checkable without a Story Bible."""
    applied = [j for j in judged if j.correct is not None and j.confidence is not None and j.confidence >= threshold and j.quote_ok]
    return sum(j.correct is False for j in applied), len(applied)


@dataclass(frozen=True)
class Recommendation:
    status: str  # "stays", "moves", "no-edge", "not-run" or "one-book"
    value: float
    sentence: str


def qualifying_edge(per_book: dict[str, list[Judged]], target: float = TARGET_SHARE) -> float | None:
    """The lowest bin edge at which, on each book separately, the items at or above it are at least ``target`` correct."""
    for edge in EDGES[1:-1]:
        shares = []
        for judged in per_book.values():
            above = [j for j in judged if j.correct is not None and j.confidence is not None and j.confidence >= edge]
            shares.append(sum(j.correct is True for j in above) / len(above) if above else -1.0)
        if shares and all(share >= target for share in shares):
            return edge
    return None


def recommend(per_book: dict[str, list[Judged]], current: float = VERIFY_BELOW, target: float = TARGET_SHARE, on: str = "all kinds pooled") -> Recommendation:
    """The protocol's decision rule for one set of items per scored book: the value moves only to a bin edge and only
    when both scored books agree; with no edge that qualifies, the rule stays and the finding goes to the owner."""
    books = {name: judged for name, judged in per_book.items() if any(j.correct is not None for j in judged)}
    if not books:
        return Recommendation("not-run", current, f"`VerifyBelow` stays {current}: no scored book was judged, so every figure is `not run`.")
    if len(books) < 2:
        return Recommendation("one-book", current, f"`VerifyBelow` stays {current}: only one scored book was judged, and the value moves only when both agree.")
    edge = qualifying_edge(books, target)
    if edge is None:
        return Recommendation(
            "no-edge",
            current,
            f"`VerifyBelow` stays {current}: no confidence edge reaches {target:.0%} correct on each book for {on}, so no confidence is trusted; raise it with the owner.",
        )
    if edge == current:
        return Recommendation("stays", current, f"`VerifyBelow` stays {current}: it is the lowest edge at {target:.0%} correct on each book for {on}.")
    return Recommendation(
        "moves", edge, f"`VerifyBelow` could move from {current} to {edge}: the lowest edge at {target:.0%} correct on each book for {on}; the owner decides."
    )


def recommend_overall(per_kind: dict[str, dict[str, list[Judged]]], current: float = VERIFY_BELOW, target: float = TARGET_SHARE) -> Recommendation:
    """The whole-app answer: the highest of the per-kind answers, over the kinds with MIN_KIND_ITEMS judged items on
    each book (a smaller kind is reported but cannot move the threshold). Without such a kind the pooled items decide
    nothing and the value stays."""
    answers: dict[str, Recommendation] = {}
    for kind, per_book in per_kind.items():
        enough = {b: j for b, j in per_book.items() if sum(x.correct is not None for x in j) >= MIN_KIND_ITEMS}
        if len(enough) >= 2:
            answers[kind] = recommend(enough, current, target, on=f"`{kind}`")
    if not answers:
        return Recommendation(
            "not-run",
            current,
            f"`VerifyBelow` stays {current}: no kind has {MIN_KIND_ITEMS} judged items on each of two scored books, so nothing is enough to move it.",
        )
    if any(a.status == "no-edge" for a in answers.values()):
        failing = sorted(k for k, a in answers.items() if a.status == "no-edge")
        return Recommendation(
            "no-edge",
            current,
            f"`VerifyBelow` stays {current}: no edge reaches {target:.0%} correct on each book for {', '.join(failing)}; raise it with the owner.",
        )
    value = max(a.value for a in answers.values())
    if value == current:
        return Recommendation("stays", current, f"`VerifyBelow` stays {current}: no kind with enough items supports a higher value.")
    return Recommendation(
        "moves", value, f"`VerifyBelow` could move from {current} to {value}, the highest per-kind answer by the protocol's rule; the owner decides."
    )
