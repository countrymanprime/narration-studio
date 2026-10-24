"""The rule that an extra run of words says the chapter text beside it again: a second take (issue #2251 item 30).

The take markers (`compare.diff_and_build_markers`) set `repeat_of` on an EXTRA with it. Recording coverage itself, the model this
rule came from, is the host's (`src/studio/desktop/internal/recordingcoverage`), which carries the same rule as `RepeatOf`; both
answer `tests/fixtures/repeat-rule/parity-cases.json`. This copy goes when the markers move to the host too
(`docs/research/sidecar-go-vs-python.md`, step 1).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

MIN_REPEAT_TOKENS = 3
"""The fewest chapter words an extra run must say again to be a repeat, unless they are a whole line:
fewer can be a stutter or an echo ("the the")."""


@dataclass(frozen=True)
class Repeat:
    """An extra run that says chapter text again, a second take of it (issue #2251 item 30): its words
    `[first, last)` are the chapter's tokens `[start, end)`, the ones heard just before or just after it.
    The rest of the run, if any, is an aside ("sorry", "once more")."""

    start: int
    end: int
    first: int
    last: int


def repeat_of(run: Sequence[str], doc: Sequence[str], line_of: Sequence[object], before: int | None, after: int | None) -> Repeat | None:
    """Whether a run of extra words says the chapter text beside it again, and which part of it.

    `before` is the doc token heard just before the run and `after` the one heard just after it (None
    at either end). The run is a retake when it ends with the words up to `before` (an aside may come
    first), or a restart when it begins with the words from `after` (an aside may follow). The words
    said again must be at least `MIN_REPEAT_TOKENS`, or a whole line (`line_of` names each doc token's
    line). The longer match wins; a tie is a retake."""
    best: Repeat | None = None
    if before is not None:
        k = 0
        while k < len(run) and k <= before and run[len(run) - 1 - k] == doc[before - k]:
            k += 1
        if k:
            best = Repeat(start=before + 1 - k, end=before + 1, first=len(run) - k, last=len(run))
    if after is not None:
        k = 0
        while k < len(run) and after + k < len(doc) and run[k] == doc[after + k]:
            k += 1
        if k and (best is None or k > best.end - best.start):
            best = Repeat(start=after, end=after + k, first=0, last=k)
    if best is None:
        return None
    if best.end - best.start >= MIN_REPEAT_TOKENS or _whole_line(line_of, best.start, best.end):
        return best
    return None


def _whole_line(line_of: Sequence[object], start: int, end: int) -> bool:
    line = line_of[start]
    if any(line_of[i] != line for i in range(start, end)):
        return False
    return (start == 0 or line_of[start - 1] != line) and (end == len(line_of) or line_of[end] != line)
