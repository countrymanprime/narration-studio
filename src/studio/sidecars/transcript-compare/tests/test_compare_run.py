"""compare.py's main run (`run`): it transcribes and writes the words the host builds the markers from
(`src/studio/desktop/internal/comparerun`, which also chooses the chapter before the run starts). Decoding and
transcription are replaced by fakes, so no model is loaded.

The words report is pinned byte for byte in `fixtures/compare/words-report.golden.txt`, which the host's
`TestTheSidecarsWordsReportReadsAsWritten` reads as the sidecar meant it. Regenerate with `UPDATE_CONTRACTS=1` only for
an intended change, and say why in the PR."""

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

CORE = Path(__file__).resolve().parents[1] / "core"
COMPARE_PATH = CORE / "compare.py"
SPEC = importlib.util.spec_from_file_location("transcript_compare_run", COMPARE_PATH)
compare = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(compare)

GOLDEN = Path(__file__).resolve().parent / "fixtures" / "compare" / "words-report.golden.txt"

WORDS = [
    ("Chapter", 0.0, 0.4),
    ("one", 0.5, 0.8),
    ("She", 1.5, 1.8),
    ("had", 1.9, 2.1),
    ("nothing", 2.2, 2.6),
    ("two", 2.7, 2.9),
    ("do.", 3.0, 3.3),
    ("Café", 9.0, 9.4),
    ("“naïve”", 9.5, 10.0),
]


def project(tmp_path):
    manuscript = tmp_path / "project" / "app" / "manuscript" / "manuscript.json"
    manuscript.parent.mkdir(parents=True)
    manuscript.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "documentId": "d",
                "chapters": [{"id": "c-1", "title": "Chapter One"}, {"id": "c-2", "title": "Chapter Two"}],
                "paragraphs": [
                    {"id": "p-1", "chapterId": "c-1", "index": 0, "text": "She had nothing to do."},
                    {"id": "p-2", "chapterId": "c-2", "index": 1, "text": "Café naïve."},
                ],
            }
        ),
        encoding="utf-8",
    )
    return manuscript


def run_args(tmp_path, **overrides):
    manifest = tmp_path / "segments.txt"
    manifest.write_text("3|b.wav|0.5|4.0\n1|a.wav|100.25|8.123\n", encoding="utf-8")
    values = {
        "progress": str(tmp_path / "progress.txt"),
        "manuscript": str(project(tmp_path)),
        "manifest": str(manifest),
        "chapter_title": None,
        "track_name": "Chapter One",
        "chunk_seconds": 0,
        "parallel_workers": 0,
        "model": "small",
        "language": "en",
        "device": "cpu",
        "model_dir": None,
        "out": str(tmp_path / "words.txt"),
        "min_words": 1,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


@pytest.fixture
def fake_audio(monkeypatch):
    """Each segment decodes to its length in samples; transcription hears WORDS."""
    monkeypatch.setattr(compare, "decode_segment", lambda _source, _start, length: [0.0] * round(length * compare.SAMPLE_RATE))
    monkeypatch.setattr(compare.np, "concatenate", lambda pieces: [x for piece in pieces for x in piece])
    calls = []
    monkeypatch.setattr(compare, "transcribe", lambda audio, *a, **k: calls.append(len(audio)) or list(WORDS))
    return calls


def test_the_run_writes_the_segments_and_the_words_it_heard(tmp_path, fake_audio):
    args = run_args(tmp_path)

    compare.run(args)

    report = Path(args.out).read_text(encoding="utf-8")
    if os.environ.get("UPDATE_CONTRACTS"):
        GOLDEN.write_text(report, encoding="utf-8", newline="\n")
    assert report == GOLDEN.read_text(encoding="utf-8")
    tags = [line.split("|", 1) for line in report.splitlines()]
    assert [tag for tag, _ in tags] == ["COMPARE_SEGMENT", "COMPARE_SEGMENT", "COMPARE_WORDS"]
    # in item order, each starting where the one before it ended in the joined audio
    assert [json.loads(payload) for _, payload in tags[0:2]] == [
        {"itemIndex": 1, "startOffset": 100.25, "concatStart": 0.0},
        {"itemIndex": 3, "startOffset": 0.5, "concatStart": round(8.123 * compare.SAMPLE_RATE) / compare.SAMPLE_RATE},
    ]
    assert fake_audio == [round(8.123 * 16000) + round(4.0 * 16000)]
    assert Path(args.progress).read_text(encoding="utf-8").startswith("DONE|100|")
    assert not Path(args.out + ".tmp").exists()


def test_the_run_matches_no_chapter_so_any_track_name_decodes(tmp_path, fake_audio):
    """The host chooses the chapter before it starts the run (comparerun.Choose); a name that matches no heading is no
    longer the sidecar's NEED_CHAPTER."""
    args = run_args(tmp_path, track_name="Appendix")

    compare.run(args)

    assert Path(args.out).read_text(encoding="utf-8").startswith("COMPARE_SEGMENT|")


def test_an_empty_manifest_is_refused(tmp_path):
    args = run_args(tmp_path)
    Path(args.manifest).write_text("", encoding="utf-8")

    with pytest.raises(ValueError, match="no segments"):
        compare.run(args)


def test_the_cli_needs_no_track_name_for_the_run_but_does_for_find_repeats(tmp_path):
    run_cli = [sys.executable, str(COMPARE_PATH), "--manifest", "m.txt", "--manuscript", "m.json", "--out", "o.txt"]

    repeats = subprocess.run([*run_cli, "--find-repeats"], capture_output=True, text=True, timeout=60, check=False)
    run = subprocess.run([*run_cli, "--progress", str(tmp_path / "p.txt")], capture_output=True, text=True, timeout=60, check=False)

    assert repeats.returncode == 2 and "--track-name required" in repeats.stderr
    assert run.returncode == 1 and "--track-name" not in run.stderr  # it gets as far as the missing manifest


def test_the_cli_no_longer_takes_a_diff_path_the_host_writes(tmp_path):
    completed = subprocess.run(
        [sys.executable, str(COMPARE_PATH), "--manifest", "m.txt", "--manuscript", "m.json", "--track-name", "t", "--out", "o.txt", "--diff-out", "d.diff"],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    assert completed.returncode == 2
    assert "unrecognized arguments: --diff-out" in completed.stderr
