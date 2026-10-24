"""The words the harness renders for every committed recording-coverage case, pinned byte for byte.

The host aligns the chapter to these words and writes the results (`src/studio/desktop/internal/recordingcoverage`). Its golden
test, `results_golden_test.go`, reads this file, writes each case's words files and manifest as `coverage_calibration.write_inputs`
does, and holds the results lines to `fixtures/coverage/results.golden.json`, which `src/studio/desktop/internal/coverage/corpus_test.go`
then runs the stage recommendations over. Pinning the words here keeps that Go test on what the harness really renders. Regenerate
with `UPDATE_CONTRACTS=1` only when a change to the rendering or the cases is intended, then regenerate the results golden on the
Go side (`UPDATE_CONTRACTS=1 go test ./internal/recordingcoverage/`), and say why in the PR."""

import json
import os

import coverage_harness as harness

GOLDEN_PATH = harness.FIXTURE_DIR.parent / "coverage-words.golden.json"


def _render_all():
    """JSON with one word per line, so a change to the rendering reads as a diff of the words it moved."""
    corpus = harness.load_corpus(harness.FIXTURE_DIR)
    cases = []
    for case in sorted(corpus.cases, key=lambda case: case.id):
        items = []
        for item in case.items:
            words = ",\n".join("    " + json.dumps([word.text, word.start, word.end], ensure_ascii=False) for word in item.words)
            items.append(f'   {{"id": {json.dumps(item.id)}, "words": [\n{words}\n   ]}}')
        cases.append(f'  {json.dumps(case.id)}: {{"chapterId": {json.dumps(case.chapter.id)}, "items": [\n' + ",\n".join(items) + "\n  ]}")
    return '{"schemaVersion": 1, "cases": {\n' + ",\n".join(cases) + "\n}}\n"


def test_the_rendered_words_of_the_committed_cases_match_the_golden_file():
    rendered = _render_all()
    if os.environ.get("UPDATE_CONTRACTS"):
        GOLDEN_PATH.write_text(rendered, encoding="utf-8", newline="\n")
    assert GOLDEN_PATH.is_file(), f"no {GOLDEN_PATH.name}: run this test with UPDATE_CONTRACTS=1 and commit it"
    assert rendered == GOLDEN_PATH.read_text(encoding="utf-8")
