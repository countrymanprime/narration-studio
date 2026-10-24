"""The words the divergence harness renders for every committed take-divergence case, pinned byte for byte.

The host aligns each take's words to its span and writes the results (`src/studio/desktop/internal/takedivergence`). Its golden
test, `results_golden_test.go`, reads this file, builds each case's manifest, manuscript and words report, and holds the results to
`fixtures/divergence/results.golden.txt`, which the sidecar's own Python mode wrote before the alignment moved to the host.
Regenerate with `UPDATE_CONTRACTS=1` only when the cases or the rendering change on purpose, then regenerate the results golden on
the Go side (`UPDATE_CONTRACTS=1 go test ./internal/takedivergence/`), and say why in the PR."""

import json
import os

import divergence_harness as harness

GOLDEN_PATH = harness.FIXTURE.parent / "words.golden.json"


def _render_all(engine):
    paragraphs, cases = harness.load_cases()
    out = []
    for case in cases:
        plan = harness.plan_case(engine, paragraphs, case)
        takes = []
        for timing in sorted(harness.TIMINGS):
            words = harness.transcript_of(plan, harness.TIMINGS[timing](plan))
            lines = ",\n".join("    " + json.dumps(list(word), ensure_ascii=False) for word in words)
            takes.append(f'   {{"timing": {json.dumps(timing)}, "words": [\n{lines}\n   ]}}')
        span = json.dumps({"firstUnit": case.first_unit, "lastUnit": case.last_unit})
        out.append(f'  {json.dumps(case.id)}: {{"span": {span}, "takes": [\n' + ",\n".join(takes) + "\n  ]}")
    return '{"schemaVersion": 1, "cases": {\n' + ",\n".join(out) + "\n}}\n"


def test_the_rendered_words_of_the_committed_cases_match_the_golden_file():
    rendered = _render_all(harness.load_compare())
    if os.environ.get("UPDATE_CONTRACTS"):
        GOLDEN_PATH.write_text(rendered, encoding="utf-8", newline="\n")
    assert GOLDEN_PATH.is_file(), f"no {GOLDEN_PATH.name}: run this test with UPDATE_CONTRACTS=1 and commit it"
    assert rendered == GOLDEN_PATH.read_text(encoding="utf-8")
