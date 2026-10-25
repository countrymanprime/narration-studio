"""Tests for `compare.py --take-divergence` (core/take_divergence_mode.py):
the manifest, the words report, progress and exit codes. Transcription is replaced by a fake that
returns hand-timed words, so no model is loaded. The span, the chapter, the project's equivalences
and the results file are the host's (`src/studio/desktop/internal/takedivergence`, `run_test.go`)."""

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

CORE = Path(__file__).resolve().parents[1] / "core"
if str(CORE) not in sys.path:
    sys.path.insert(0, str(CORE))

import take_divergence_mode as mode
from narration_common import brand

SPEC = importlib.util.spec_from_file_location("transcript_compare_divergence_mode", CORE / "compare.py")
compare = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(compare)

CHAPTER_TEXT = "Alice was beginning to get very tired. She had nothing to do. Once or twice she had peeped into the book."
TAKE = {"itemGuid": "{ITEM-1}", "takeGuid": "{TAKE-1}", "sourceFile": "take1.wav", "startOffset": 12.5, "length": 4.0}


def project(tmp_path, chapter_text=CHAPTER_TEXT):
    texts = [chapter_text] if isinstance(chapter_text, str) else list(chapter_text)
    """A project folder laid out as the host lays it out: the manuscript under
    <app>/manuscript, the per-project word lists under TranscriptCompare."""
    manuscript = tmp_path / "project" / brand.PROJECT_FOLDER / "manuscript" / "manuscript.json"
    manuscript.parent.mkdir(parents=True)
    manuscript.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "documentId": "doc",
                "chapters": [
                    {"id": "front", "title": "Contents", "contentKind": "front-matter"},
                    {"id": "ch-1", "title": "Chapter One", "contentKind": "narration"},
                ],
                "paragraphs": [
                    {"id": "f-1", "chapterId": "front", "index": 0, "text": "Chapter One"},
                    *({"id": f"p-{n + 1}", "chapterId": "ch-1", "index": n + 1, "text": text} for n, text in enumerate(texts)),
                ],
            }
        ),
        encoding="utf-8",
    )
    return manuscript


def manifest_file(tmp_path, **overrides):
    data = {"schemaVersion": 1, "chapterId": "ch-1", "span": {"firstUnit": 1, "lastUnit": 1}, "takes": [TAKE]}
    data.update(overrides)
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def args_for(tmp_path, manuscript_path, manifest_path, **overrides):
    values = {
        "manifest": str(manifest_path),
        "manuscript": str(manuscript_path),
        "out": str(tmp_path / "results.txt"),
        "progress": str(tmp_path / "progress.txt"),
        "model": "small",
        "model_dir": None,
        "language": "en",
        "device": "cpu",
        "find_repeats": False,
        "chunk_seconds": 0,
    }
    values.update(overrides)
    return argparse.Namespace(**values)


def timed(text, step=0.5):
    return [(word, round(i * step, 3), round(i * step + 0.4, 3)) for i, word in enumerate(text.split())]


def fake_transcriber(by_take):
    return lambda take: timed(by_take[take.take_guid])


def report(path):
    return [(line.split("|", 1)[0], json.loads(line.split("|", 1)[1])) for line in Path(path).read_text(encoding="utf-8").splitlines()]


def progress_stage(path):
    return Path(path).read_text(encoding="utf-8").split("|")[0]


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise SystemExit(f"usage: {message}")


# ---------------------------------------------------------------------------
# the manifest


def test_a_valid_manifest_keeps_its_takes_in_order(tmp_path):
    second = {**TAKE, "takeGuid": "{TAKE-2}", "startOffset": 0}
    manifest = mode.read_manifest(manifest_file(tmp_path, takes=[TAKE, second]))

    assert (manifest.chapter_id, manifest.first_unit, manifest.last_unit) == ("ch-1", 1, 1)
    assert [take.take_guid for take in manifest.takes] == ["{TAKE-1}", "{TAKE-2}"]
    assert manifest.takes[1].start_offset == 0.0


def test_a_manifest_may_name_its_span_by_paragraphs_instead_of_sentences(tmp_path):
    """The workspace's Takes panel compares a passage (whole paragraphs), and only the sidecar numbers sentences."""
    manifest = mode.read_manifest(manifest_file(tmp_path, span={"firstParagraph": 0, "lastParagraph": 2}))

    assert (manifest.first_paragraph, manifest.last_paragraph) == (0, 2)
    assert (manifest.first_unit, manifest.last_unit) == (None, None)


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"span": {"firstParagraph": 2, "lastParagraph": 1}}, "firstParagraph <= lastParagraph"),
        ({"span": {"firstParagraph": True, "lastParagraph": 1}}, "whole paragraph numbers"),
        ({"span": {"firstParagraph": 0}}, "missing \\['lastParagraph'\\]"),
        ({"span": {"firstUnit": 0, "lastUnit": 1, "firstParagraph": 0, "lastParagraph": 1}}, "not both"),
    ],
)
def test_a_malformed_paragraph_span_is_refused_with_what_is_wrong(tmp_path, overrides, message):
    with pytest.raises(mode.ManifestError, match=message):
        mode.read_manifest(manifest_file(tmp_path, **overrides))


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"schemaVersion": 2}, "schema version"),
        ({"chapterId": ""}, "chapterId"),
        ({"span": {"firstUnit": 2, "lastUnit": 1}}, "firstUnit <= lastUnit"),
        ({"span": {"firstUnit": True, "lastUnit": 1}}, "whole sentence numbers"),
        ({"span": {"firstUnit": 0}}, "missing \\['lastUnit'\\]"),
        ({"span": [0, 1]}, "span is not an object"),
        ({"takes": []}, "non-empty list"),
        ({"takes": ["take.wav"]}, "take 0 is not an object"),
        ({"takes": [{**TAKE, "extra": 1}]}, "unknown \\['extra'\\]"),
        ({"takes": [{**TAKE, "takeGuid": ""}]}, "takeGuid must be"),
        ({"takes": [{**TAKE, "startOffset": -1}]}, "startOffset must be"),
        ({"takes": [{**TAKE, "length": 0}]}, "length must be"),
        ({"takes": [{**TAKE, "length": "4"}]}, "length must be"),
        ({"surprise": 1}, "unknown \\['surprise'\\]"),
    ],
)
def test_a_malformed_manifest_is_refused_with_what_is_wrong(tmp_path, overrides, message):
    with pytest.raises(mode.ManifestError, match=message):
        mode.read_manifest(manifest_file(tmp_path, **overrides))


def test_an_unreadable_or_non_object_manifest_is_refused(tmp_path):
    with pytest.raises(mode.ManifestError, match="could not be read"):
        mode.read_manifest(tmp_path / "missing.json")
    path = tmp_path / "list.json"
    path.write_text("[]", encoding="utf-8")
    with pytest.raises(mode.ManifestError, match="is not an object"):
        mode.read_manifest(path)


# ---------------------------------------------------------------------------
# a run


def test_each_take_gets_its_words_in_manifest_order_timed_from_the_start_of_its_range(tmp_path):
    second = {**TAKE, "takeGuid": "{TAKE-2}", "sourceFile": "take2.wav", "startOffset": 3.0}
    manuscript = project(tmp_path)
    args = args_for(tmp_path, manuscript, manifest_file(tmp_path, takes=[TAKE, second]))
    transcriber = fake_transcriber({"{TAKE-1}": "She had nothing to do", "{TAKE-2}": "She had nothing two do"})

    assert mode.main(Parser(), args, compare, transcriber) == mode.EXIT_DONE

    assert report(args.out) == [
        ("TAKE_TRANSCRIPTION", {"language": "en", "model": "small"}),
        ("TAKE_WORDS", {"index": 0, "takeGuid": "{TAKE-1}", "words": [list(word) for word in timed("She had nothing to do")]}),
        ("TAKE_WORDS", {"index": 1, "takeGuid": "{TAKE-2}", "words": [list(word) for word in timed("She had nothing two do")]}),
    ]
    assert Path(args.out).read_text(encoding="utf-8").startswith('TAKE_TRANSCRIPTION|{"language":"en","model":"small"}\nTAKE_WORDS|{"index":0,')
    assert progress_stage(args.progress) == "DONE"
    assert not Path(args.out + ".tmp").exists()


def test_a_take_with_no_words_and_no_language_are_written_as_such(tmp_path):
    args = args_for(tmp_path, project(tmp_path), manifest_file(tmp_path), language=None)

    assert mode.main(Parser(), args, compare, lambda _take: []) == mode.EXIT_DONE

    assert report(args.out) == [("TAKE_TRANSCRIPTION", {"language": None, "model": "small"}), ("TAKE_WORDS", {"index": 0, "takeGuid": "{TAKE-1}", "words": []})]


def test_the_whisper_transcriber_decodes_the_take_range_with_the_project_hints(tmp_path):
    manuscript = project(tmp_path)
    (tmp_path / "project" / "TranscriptCompare").mkdir()
    (tmp_path / "project" / "TranscriptCompare" / "vocabulary_hints.txt").write_text("Arelian\n", encoding="utf-8")
    calls = []
    engine = SimpleNamespace(
        project_data_path=compare.project_data_path,
        decode_segment=lambda *a: calls.append(("decode", a)) or "audio",
        transcribe=lambda audio, *a, **kw: calls.append(("transcribe", audio, a, kw)) or [("She", 0.0, 0.3)],
    )
    args = args_for(tmp_path, manuscript, "unused", model_dir="C:/models/small")

    transcriber = mode.whisper_transcriber(engine, args, mode._project_hints(engine, str(manuscript)))
    words = transcriber(mode.Take("i", "t", "take1.wav", 12.5, 4.0))

    assert words == [("She", 0.0, 0.3)]
    assert calls == [
        ("decode", ("take1.wav", 12.5, 4.0)),
        ("transcribe", "audio", ("small", "en", "cpu"), {"hotwords": "Arelian", "model_dir": "C:/models/small"}),
    ]


def test_no_hints_file_means_no_hotwords(tmp_path):
    assert mode._project_hints(compare, str(project(tmp_path))) is None


def test_a_failed_transcription_is_an_error_line_and_no_report(tmp_path):
    args = args_for(tmp_path, project(tmp_path), manifest_file(tmp_path))

    def fails(_take):
        raise RuntimeError("The take's source file could not be decoded")

    assert mode.main(Parser(), args, compare, fails) == mode.EXIT_FAILED

    assert Path(args.progress).read_text(encoding="utf-8").startswith("ERROR|0|The take's source file could not be decoded")
    assert not Path(args.out).exists()


def test_a_cancel_between_takes_stops_with_no_results_and_clears_the_request(tmp_path):
    second = {**TAKE, "takeGuid": "{TAKE-2}"}
    args = args_for(tmp_path, project(tmp_path), manifest_file(tmp_path, takes=[TAKE, second]))
    cancel = Path(args.progress + ".cancel")
    transcribed = []

    def cancel_after_first(take):
        transcribed.append(take.take_guid)
        cancel.write_text("", encoding="utf-8")
        return timed("She had nothing to do")

    assert mode.main(Parser(), args, compare, cancel_after_first) == mode.EXIT_CANCELLED

    assert transcribed == ["{TAKE-1}"]
    assert progress_stage(args.progress) == "CANCELLED"
    assert not cancel.exists()
    assert not Path(args.out).exists()


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"out": None}, "--out required"),
        ({"manifest": None}, "--manifest required"),
        ({"find_repeats": True}, "--find-repeats cannot"),
        ({"chunk_seconds": 30}, "--chunk-seconds cannot"),
    ],
)
def test_conflicting_or_missing_arguments_are_usage_errors(tmp_path, overrides, message):
    args = args_for(tmp_path, "m.json", "manifest.json", **overrides)

    with pytest.raises(SystemExit, match=message):
        mode.main(Parser(), args, compare, fake_transcriber({}))


# ---------------------------------------------------------------------------
# through compare.py


def run_compare(*argv):
    return subprocess.run([sys.executable, str(CORE / "compare.py"), *argv], capture_output=True, text=True, timeout=120, check=False)


def test_compare_py_runs_the_mode_and_exits_1_on_a_bad_manifest(tmp_path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text('{"schemaVersion": 1}', encoding="utf-8")
    progress = tmp_path / "progress.txt"

    result = run_compare(
        "--take-divergence", "--manifest", str(manifest), "--manuscript", str(project(tmp_path)), "--out", str(tmp_path / "r.txt"), "--progress", str(progress)
    )

    assert result.returncode == 1, result.stderr
    assert progress.read_text(encoding="utf-8").startswith("ERROR|0|The take-divergence manifest: missing")


def test_compare_py_exits_2_on_a_usage_error(tmp_path):
    result = run_compare("--take-divergence", "--manuscript", str(project(tmp_path)), "--manifest", "m.json")

    assert result.returncode == 2
    assert "--out required with --take-divergence" in result.stderr
