"""The take markers' repeat rule (`core/recording_coverage.py`): an extra run that says the chapter text beside it again.

The host's copy (`src/studio/desktop/internal/recordingcoverage`, `RepeatOf`) answers the same parity file; the rest of the
recording-coverage model and its tests are the host's (`coverage_test.go`)."""

import importlib.util
import json
import sys
from pathlib import Path

CORE = Path(__file__).resolve().parents[1] / "core"
SPEC = importlib.util.spec_from_file_location("transcript_repeat_rule", CORE / "recording_coverage.py")
rule = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = rule  # dataclasses look their module up while the class is built
SPEC.loader.exec_module(rule)


def test_the_repeat_rule_answers_the_shared_parity_cases():
    # The Editing page runs the same rule (src/studio/ui/src/components/editing/model/duplicates.ts saysScriptAgain) on the same file.
    path = Path(__file__).resolve().parents[5] / "tests" / "fixtures" / "repeat-rule" / "parity-cases.json"
    for case in json.loads(path.read_text(encoding="utf-8"))["cases"]:
        script = case["script"].split()
        found = rule.repeat_of(case["run"].split(), script, [0] * len(script), case["prev"], case["next"])
        assert (found is not None) == case["repeat"], case["name"]


def test_two_words_across_a_line_break_are_not_a_whole_line_said_again():
    # "golf hotel" ends one two-word line and starts nothing on its own: the words straddle the break, so they are no repeat.
    doc = ("alpha", "golf", "hotel", "india")
    assert rule.repeat_of(("golf", "hotel"), doc, (0, 0, 1, 1), 2, None) is None
    assert rule.repeat_of(("hotel", "india"), doc, (0, 0, 1, 1), 3, None) == rule.Repeat(start=2, end=4, first=0, last=2)


def test_a_retake_ends_with_the_words_before_and_a_restart_begins_with_the_words_after():
    doc = ("a", "b", "c", "d", "e", "f")
    lines = (0, 0, 0, 1, 1, 1)
    # Before is "c" (index 2), after is "d" (index 3): "a b c" ends with the words up to before.
    assert rule.repeat_of(("a", "b", "c"), doc, lines, 2, 3) == rule.Repeat(start=0, end=3, first=0, last=3)
    assert rule.repeat_of(("d", "e", "f", "x"), doc, lines, 2, 3) == rule.Repeat(start=3, end=6, first=0, last=3)
