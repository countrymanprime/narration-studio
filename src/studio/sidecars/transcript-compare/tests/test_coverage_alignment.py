"""The recording check's word alignment, through the sidecar and the host.

Beside its measurements, the host's results (`src/studio/desktop/internal/recordingcoverage`) carry one `COVERAGE_TOKEN` line per
chapter token (the manuscript word it came from, its status as the check judged it, and where it was heard in its item's source) and
one `COVERAGE_EXTRA` line per run of heard words the chapter does not account for. The flags must equal the check: a token's status
is the status the check counted. Each test runs the sidecar's coverage mode, which writes the words report, then the host's aligner
over it (`go_coverage.py`); an align-only re-run is the host's alone and never transcribes."""

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

import go_coverage
import pytest
import test_coverage_mode as base
from test_coverage_mode import (
    P1,
    P2,
    P3,
    SUBTITLE,
    TITLE,
    WORD_SECONDS,
    _args,
    _item,
    _never_transcribe,
    _project,
    _results,
    _results_path,
    _words_file,
    _write_manifest,
    compare,
    mode,
)

# The coverage mode tests' fixtures, shared rather than copied.
cached_project = base.cached_project
progress = base.progress


def _run(tmp_path, manuscript, manifest, **overrides):
    args = _args(tmp_path, manuscript, manifest, **overrides)
    mode.run(args, compare, _never_transcribe)
    return _results(args)


def _paragraph_words(manuscript):
    data = json.loads(Path(manuscript).read_text(encoding="utf-8"))
    return {p["id"]: p["text"].split() for p in data["paragraphs"]}


def test_every_chapter_token_has_one_line_in_order_naming_its_manuscript_word(tmp_path, cached_project, progress):
    manuscript, manifest = cached_project
    lines = _run(tmp_path, manuscript, manifest)
    tokens = lines["COVERAGE_TOKEN"]
    assert [token["i"] for token in tokens] == list(range(len(tokens)))
    heading = f"{TITLE} {SUBTITLE}".split()
    words = _paragraph_words(manuscript)
    assert [token["text"] for token in tokens[: len(heading)]] == heading
    assert all(token["p"] is None and token["status"] == "heading" for token in tokens[: len(heading)])
    body = tokens[len(heading) :]
    assert len(body) == sum(len(words[pid]) for pid in ("p-000001", "p-000002", "p-000003"))
    for token in body:
        # The word is the w-th whitespace word of its paragraph's text: the UI finds it without tokenizing.
        assert words[token["p"]][token["w"]] == token["text"]


def test_a_read_word_says_which_item_and_where_in_its_source_it_was_heard(tmp_path, cached_project, progress):
    manuscript, manifest = cached_project
    tokens = _run(tmp_path, manuscript, manifest)["COVERAGE_TOKEN"]
    alice = next(token for token in tokens if token["p"] == "p-000001" and token["w"] == 0)
    # Item 0's words start at 10.0 s of source: four heading words, then "Alice".
    assert alice["status"] == "read"
    assert alice["item"] == 0
    assert alice["start"] == pytest.approx(10.0 + 4 * WORD_SECONDS)
    assert alice["end"] == pytest.approx(10.0 + 4 * WORD_SECONDS + 0.25)
    once = next(token for token in tokens if token["p"] == "p-000002" and token["w"] == 0)
    assert (once["status"], once["item"], once["start"]) == ("read", 2, 0.0)


def test_text_never_heard_has_no_time_and_the_checks_own_status(tmp_path, cached_project, progress):
    manuscript, manifest = cached_project
    tokens = _run(tmp_path, manuscript, manifest)["COVERAGE_TOKEN"]
    tail = [token for token in tokens if token["p"] == "p-000003"]
    assert tail and all(token["status"] == "tail" for token in tail)
    assert all(token["item"] is None and token["start"] is None and token["end"] is None for token in tail)


def test_the_flags_equal_the_check(tmp_path, progress):
    # A skip in the middle of P2 and a misread word in P1: the per-token statuses must add up to the
    # paragraph lines, the summary and the regions the check itself wrote.
    manuscript = _project(tmp_path)
    words_dir = tmp_path / "words"
    words_dir.mkdir()
    p1 = P1.replace("sister", "cistern", 1)
    p2 = " ".join(P2.split()[:3] + P2.split()[9:])
    _words_file(words_dir / "item-0.json", f"{TITLE} {SUBTITLE} {p1} {p2} {P3}", 0.0, 40.0)
    manifest = _write_manifest(tmp_path / "manifest.json", [_item(0, "{A}", "a.wav", 0.0, 40.0)])
    lines = _run(tmp_path, manuscript, manifest)
    tokens = lines["COVERAGE_TOKEN"]
    body = [token for token in tokens if token["status"] != "heading"]
    present = {"read", "misread"}
    summary = lines["COVERAGE"][0]
    assert sum(token["status"] in present for token in body) == summary["presentTokens"]
    assert sum(token["status"] not in present for token in body) == summary["missingTokens"]
    for paragraph in lines["COVERAGE_PARAGRAPH"]:
        mine = [token for token in body if token["p"] == paragraph["id"]]
        assert len(mine) == paragraph["tokens"]
        assert sum(token["status"] in present for token in mine) == paragraph["present"]
    kinds = Counter(token["status"] for token in body if token["status"] not in present)
    regions = Counter()
    for region in lines["COVERAGE_REGION"]:
        regions[region["kind"]] += region["tokenCount"]
    assert kinds == regions
    assert kinds["skip"] == 6
    assert sum(extra["tokens"] for extra in lines.get("COVERAGE_EXTRA", [])) == summary["extraTokens"]
    cistern = next(token for token in body if token["p"] == "p-000001" and token["text"] == "sister")
    assert cistern["status"] == "misread"
    assert cistern["heard"] == "cistern"
    assert cistern["item"] == 0 and cistern["start"] is not None


def test_words_heard_that_the_chapter_does_not_account_for_are_extra_runs(tmp_path, progress):
    manuscript = _project(tmp_path)
    words_dir = tmp_path / "words"
    words_dir.mkdir()
    aside = "sorry let me try that bit again from the top please"
    _words_file(words_dir / "item-0.json", f"{TITLE} {SUBTITLE} {P1} {aside} {P2} {P3}", 0.0, 60.0)
    manifest = _write_manifest(tmp_path / "manifest.json", [_item(0, "{A}", "a.wav", 0.0, 60.0)])
    lines = _run(tmp_path, manuscript, manifest)
    (extra,) = lines["COVERAGE_EXTRA"]
    assert extra["text"] == aside
    assert extra["tokens"] == len(aside.split())
    heard_before = 4 + len(P1.split())
    assert extra["start"] == {"itemIndex": 0, "itemGuid": "{A}", "sourceTime": pytest.approx(heard_before * WORD_SECONDS)}
    last = heard_before + len(aside.split()) - 1
    assert extra["end"] == {"itemIndex": 0, "itemGuid": "{A}", "sourceTime": pytest.approx(last * WORD_SECONDS + 0.25)}
    # It sits after P1's last word.
    tokens = lines["COVERAGE_TOKEN"]
    after = tokens[extra["afterToken"]]
    assert (after["p"], after["w"]) == ("p-000001", len(P1.split()) - 1)
    assert all(token["status"] in ("heading", "read") for token in tokens)
    assert extra["repeatOf"] is None  # an aside, not chapter text said again


def test_a_sentence_said_twice_is_an_extra_run_that_names_the_chapter_words_it_repeats(tmp_path, progress):
    # Issue #2251 item 30: the end of P1 said again after "again please" is a second take, not words outside the script.
    manuscript = _project(tmp_path)
    words_dir = tmp_path / "words"
    words_dir.mkdir()
    again = " ".join(P1.split()[-4:])
    _words_file(words_dir / "item-0.json", f"{TITLE} {SUBTITLE} {P1} again please {again} {P2} {P3}", 0.0, 60.0)
    manifest = _write_manifest(tmp_path / "manifest.json", [_item(0, "{A}", "a.wav", 0.0, 60.0)])
    lines = _run(tmp_path, manuscript, manifest)
    (extra,) = lines["COVERAGE_EXTRA"]
    # Either copy may be the one the alignment left over; the run names the four words either way.
    assert sorted(extra["text"].split()) == sorted(f"again please {again}".split())
    repeat = extra["repeatOf"]
    assert repeat["last"] - repeat["first"] == 4 and repeat["end"] - repeat["start"] == 4
    assert extra["text"].split()[repeat["first"] : repeat["last"]] == again.split()
    tokens = lines["COVERAGE_TOKEN"]
    assert [token["text"] for token in tokens[repeat["start"] : repeat["end"]]] == P1.split()[-4:]
    assert repeat["text"] == again


def test_a_fully_read_chapter_has_no_extra_lines(tmp_path, progress):
    manuscript = _project(tmp_path)
    words_dir = tmp_path / "words"
    words_dir.mkdir()
    _words_file(words_dir / "item-0.json", f"{TITLE} {SUBTITLE} {P1} {P2} {P3}", 0.0, 40.0)
    manifest = _write_manifest(tmp_path / "manifest.json", [_item(0, "{A}", "a.wav", 0.0, 40.0)])
    lines = _run(tmp_path, manuscript, manifest)
    assert "COVERAGE_EXTRA" not in lines
    assert {token["status"] for token in lines["COVERAGE_TOKEN"]} == {"heading", "read"}


def test_the_measurement_lines_are_unchanged_by_the_alignment_lines(tmp_path, cached_project, progress):
    # Additive (docs/utilities/recording-coverage.md's tagged lines): the lines the host already reads come first, at the same
    # schema version, and the new tags come after them.
    manuscript, manifest = cached_project
    lines = _run(tmp_path, manuscript, manifest)
    out = _results_path(_args(tmp_path, manuscript, manifest))
    tags = [line.split("|", 1)[0] for line in out.read_text(encoding="utf-8").splitlines()]
    first_new = tags.index("COVERAGE_TOKEN")
    assert set(tags[:first_new]) == {"COVERAGE", "COVERAGE_ITEM", "COVERAGE_PARAGRAPH", "COVERAGE_REGION"}
    assert set(tags[first_new:]) <= {"COVERAGE_TOKEN", "COVERAGE_EXTRA"}
    assert lines["COVERAGE"][0]["schemaVersion"] == 1


# ---------------------------------------------------------------------------
# the token statuses in the model


def test_token_statuses_are_the_checks_statuses():
    aligned = go_coverage.AlignedChapter(
        doc_tokens=("a", "b", "c", "d", "e", "f", "g", "h"),
        doc_words=("A", "B", "C", "D", "E", "F", "G", "H"),
        token_paragraph=(0,) * 8,
        paragraph_ids=("p1",),
        audio_tokens=("a", "b", "c", "x", "e", "f", "g", "h", "z"),
        opcodes=(("equal", 0, 3, 0, 3), ("replace", 3, 4, 3, 4), ("equal", 4, 8, 4, 8), ("insert", 8, 8, 8, 9)),
    )
    coverage = go_coverage.coverage(aligned)
    assert [status for status, _audio in coverage.tokens] == ["read", "read", "read", "misread", "read", "read", "read", "read"]
    assert [audio for _status, audio in coverage.tokens] == list(range(8))
    assert coverage.extras == ((8, 9),)
    assert coverage.present_tokens == 8
    assert sum(end - start for start, end in coverage.extras) == coverage.extra_tokens


# ---------------------------------------------------------------------------
# align-only: the host's alone


def test_align_only_with_every_item_cached_gives_the_same_report(tmp_path, cached_project, progress):
    manuscript, manifest = cached_project
    args = _args(tmp_path, manuscript, manifest)
    mode.run(args, compare, _never_transcribe)
    _results(args)
    first = _results_path(args).read_bytes()
    _results(args, words_report=False)
    assert _results_path(args).read_bytes() == first


def test_align_only_refuses_when_an_item_is_not_cached(tmp_path, cached_project, progress):
    manuscript, manifest = cached_project
    (tmp_path / "words" / "item-2.json").unlink()
    args = _args(tmp_path, manuscript, manifest)
    with pytest.raises(go_coverage.AlignError, match="item 2"):
        _results(args, words_report=False)
    assert not _results_path(args).exists()


@pytest.mark.parametrize("option", [["--align-only"], ["--max-misread-run", "8"], ["--min-anchor-run", "3"]])
def test_the_cli_no_longer_takes_the_alignment_options_the_host_owns(tmp_path, cached_project, option):
    # Changed when the alignment moved to the host: the sidecar only transcribes, so it has no align-only re-run or alignment parameters.
    manuscript, manifest = cached_project
    command = [sys.executable, str(Path(compare.__file__)), "--coverage", *option, "--manuscript", str(manuscript), "--manifest", str(manifest)]
    command += ["--chapter-id", "c-0001", "--words-dir", str(tmp_path / "words"), "--out", str(tmp_path / "out.txt")]
    result = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
    assert result.returncode == 2
    assert "unrecognized arguments" in result.stderr and option[0] in result.stderr
