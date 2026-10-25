"""The text rules the host's tokenizer (`src/studio/desktop/internal/compare`) reproduces, pinned in
`tests/fixtures/compare-parity/cases.json`, which `compare_test.go` reads.

compare.py's tokenizer, sentence splitter, chapter units and equivalence loader wrote that file before they were
deleted (2026-10-24), so it is frozen: no Python regenerates it. What is still Python is the number merge in
`narration_common.spoken_forms`, which the teleprompter's live flags use, so this test holds that merge to the
file's answers, and Go is held to the same answers."""

import json
from pathlib import Path

from narration_common import spoken_forms

GOLDEN_PATH = Path(__file__).resolve().parents[5] / "tests" / "fixtures" / "compare-parity" / "cases.json"


def test_the_shared_number_merge_still_gives_the_pinned_answers():
    cases = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))

    assert len(cases["tokenize"]) == len(cases["mergeNumberWords"]) == 64
    for tokens, (merged, index_map) in zip(cases["tokenize"], cases["mergeNumberWords"]):
        assert list(spoken_forms.merge_number_words(tokens, list(range(len(tokens))))) == [merged, index_map], tokens
