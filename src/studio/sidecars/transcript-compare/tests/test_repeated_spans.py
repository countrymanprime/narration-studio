"""Tests for the --find-repeats mode: it reads the manifest and writes each read's words. The host chooses the
chapter, aligns the reads, groups them and flags exact copies (src/studio/desktop/internal/comparerun/repeats.go,
pinned by tests/fixtures/repeats/spans.golden.json, which this mode wrote before that moved)."""

import argparse
import importlib.util
from pathlib import Path

import pytest

COMPARE_PATH = Path(__file__).resolve().parents[1] / "core" / "compare.py"
SPEC = importlib.util.spec_from_file_location("transcript_compare_repeats", COMPARE_PATH)
compare = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(compare)


# ---------------------------------------------------------------------------
# read_repeat_segments


def test_read_repeat_segments_parses_identity_fields(tmp_path):
    manifest = tmp_path / "manifest.txt"
    manifest.write_text(
        "0|C:/audio/a.wav|0.0|4.5|{ITEM-GUID-1}|{TAKE-GUID-1}\n1|C:/audio/b.wav|10.0|3.25|{ITEM-GUID-2}|{TAKE-GUID-2}\n",
        encoding="utf-8",
    )

    segments = compare.read_repeat_segments(manifest)

    assert segments == [
        {"item_index": 0, "source_file": "C:/audio/a.wav", "start_offset": 0.0, "length": 4.5, "item_guid": "{ITEM-GUID-1}", "take_guid": "{TAKE-GUID-1}"},
        {"item_index": 1, "source_file": "C:/audio/b.wav", "start_offset": 10.0, "length": 3.25, "item_guid": "{ITEM-GUID-2}", "take_guid": "{TAKE-GUID-2}"},
    ]


# ---------------------------------------------------------------------------
# find_repeated_spans (decoding and ASR faked)


def test_find_repeated_spans_writes_each_reads_words_in_manifest_order(tmp_path, monkeypatch):
    heard = {7.0: [("Ada", 0.0, 0.4), ("walked", 0.5, 0.9)], 2.0: [], 3.0: [("Café", 1, 2)]}
    decoded = []
    monkeypatch.setattr(compare, "decode_segment", lambda source, start, length: decoded.append((source, start, length)) or length)
    monkeypatch.setattr(compare, "transcribe", lambda audio, *a, **k: heard[audio])
    manifest = tmp_path / "manifest.txt"
    manifest.write_text("3|C:/audio/b.wav|1.5|7.0|{ITEM-1}|{TAKE-1}\n0|a.wav|0.0|2.0|{ITEM-2}|{TAKE-2}\n1|a.wav|0.0|3.0|{ITEM-2}|{TAKE-3}\n", encoding="utf-8")
    out = tmp_path / "words.txt"
    progress = tmp_path / "progress.txt"
    args = argparse.Namespace(manifest=str(manifest), out=str(out), model="tiny", model_dir=None, language="en", device="cpu", progress=str(progress))

    compare.find_repeated_spans(args)

    assert decoded == [("C:/audio/b.wav", 1.5, 7.0), ("a.wav", 0.0, 2.0), ("a.wav", 0.0, 3.0)]
    assert out.read_text(encoding="utf-8") == (
        'REPEAT_WORDS|{"words":[["Ada",0.0,0.4],["walked",0.5,0.9]]}\nREPEAT_WORDS|{"words":[]}\nREPEAT_WORDS|{"words":[["Café",1.0,2.0]]}\n'
    )
    assert progress.read_text(encoding="utf-8").startswith("DONE|100|")
    assert not Path(str(out) + ".tmp").exists()


def test_find_repeated_spans_refuses_an_empty_manifest(tmp_path):
    manifest = tmp_path / "manifest.txt"
    manifest.write_text("\n", encoding="utf-8")
    args = argparse.Namespace(manifest=str(manifest), out=str(tmp_path / "o.txt"), progress=None)

    with pytest.raises(ValueError, match="no segments"):
        compare.find_repeated_spans(args)


def test_find_repeated_spans_stops_between_reads_when_cancelled(tmp_path, monkeypatch):
    progress = tmp_path / "progress.txt"
    monkeypatch.setattr(compare, "decode_segment", lambda *_a: Path(str(progress) + ".cancel").write_text("cancel", encoding="utf-8"))
    monkeypatch.setattr(compare, "transcribe", lambda *_a, **_k: [])
    manifest = tmp_path / "manifest.txt"
    manifest.write_text("0|a.wav|0.0|2.0|{I}|{T-1}\n1|a.wav|2.0|2.0|{I}|{T-2}\n", encoding="utf-8")
    args = argparse.Namespace(
        manifest=str(manifest), out=str(tmp_path / "o.txt"), model="tiny", model_dir=None, language="en", device="cpu", progress=str(progress)
    )

    with pytest.raises(compare.Cancelled):
        compare.find_repeated_spans(args)
    assert not (tmp_path / "o.txt").exists()
