"""The larger-model re-check's window rule as a value, for trying variants in the recording-check benchmark.

The shipped rule is the constants in `coverage_pipeline.py` (mirrored in `internal/coverage/plan.go`, held equal by
`tests/fixtures/recheck_windows.json`). A `Rule` names a variant of them plus the score line (`--unsure-below`); `applied` swaps the
pipeline's constants for the length of a block, and running this file as a script does that around `compare.py`, so a benchmark
run measures a variant without any change to the sidecar.

    --rules "current;min10:min=10;words:min=0,pad=1.5,gap=5,line=0.4"

Keys: `min` (shortest window, seconds), `gap` (windows closer than this merge), `pad` (seconds added past each doubtful run), `line` (score line).
"""

from __future__ import annotations

import contextlib
import dataclasses
import json
import os
import runpy
import sys
from pathlib import Path

CORE = Path(__file__).resolve().parents[2] / "src" / "studio" / "sidecars" / "transcript-compare" / "core"
ENV = "NARRATION_RECHECK_RULE"

if str(CORE) not in sys.path:
    sys.path.insert(0, str(CORE))

import coverage_pipeline as pipeline

_KEYS = {"min": "min_window", "gap": "merge_gap", "pad": "edge_pad", "line": "line"}


@dataclasses.dataclass(frozen=True)
class Rule:
    name: str
    min_window: float = pipeline.MIN_WINDOW_SECONDS
    merge_gap: float = pipeline.MERGE_GAP_SECONDS
    edge_pad: float = pipeline.EDGE_PAD_SECONDS
    line: float | None = None
    """The score line; None keeps the one the caller passes."""

    def to_json(self) -> str:
        return json.dumps(dataclasses.asdict(self))

    @classmethod
    def from_json(cls, text: str) -> Rule:
        return cls(**json.loads(text))


def parse_rules(text: str) -> list[Rule]:
    rules: list[Rule] = []
    for part in text.split(";"):
        name, _, body = part.strip().partition(":")
        if not name or any(r.name == name for r in rules):
            raise SystemExit(f"--rules: {part!r} needs a name that is not used twice")
        values: dict[str, float] = {}
        for pair in filter(None, (p.strip() for p in body.split(","))):
            key, eq, raw = pair.partition("=")
            if key not in _KEYS or not eq:
                raise SystemExit(f"--rules: {pair!r} is not min=, gap=, pad= or line=")
            try:
                value = float(raw)
            except ValueError:
                raise SystemExit(f"--rules: {pair!r} is not a number") from None
            if value < 0 or (key == "line" and value > 1):
                raise SystemExit(f"--rules: {pair!r} is out of range")
            values[_KEYS[key]] = value
        rules.append(Rule(name, **values))
    return rules


@contextlib.contextmanager
def applied(rule: Rule):
    saved = (pipeline.MIN_WINDOW_SECONDS, pipeline.MERGE_GAP_SECONDS, pipeline.EDGE_PAD_SECONDS)
    pipeline.MIN_WINDOW_SECONDS, pipeline.MERGE_GAP_SECONDS, pipeline.EDGE_PAD_SECONDS = rule.min_window, rule.merge_gap, rule.edge_pad
    try:
        yield
    finally:
        pipeline.MIN_WINDOW_SECONDS, pipeline.MERGE_GAP_SECONDS, pipeline.EDGE_PAD_SECONDS = saved


def main() -> None:
    """Run the sidecar (`compare.py` and its arguments) under the rule in NARRATION_RECHECK_RULE."""
    rule = Rule.from_json(os.environ[ENV])
    sys.argv = [str(CORE / "compare.py"), *sys.argv[1:]]
    with applied(rule):
        runpy.run_path(str(CORE / "compare.py"), run_name="__main__")


if __name__ == "__main__":
    main()
