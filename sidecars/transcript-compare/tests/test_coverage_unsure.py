"""Tests for the word scores a words file keeps and what the coverage mode does with them: the
passages Whisper was not sure of (`COVERAGE_UNSURE`), the splice of a re-check's scores, and the
choice between the plain and the chunked transcriber. No Whisper model is needed."""

import json
import sys
from argparse import Namespace
from pathlib import Path

import pytest

CORE = Path(__file__).resolve().parents[1] / "core"
if str(CORE) not in sys.path:
    sys.path.insert(0, str(CORE))

import compare
import coverage_chunks
import coverage_mode as mode
from test_coverage_mode import P1, SUBTITLE, TITLE, _args, _item, _lines, _project, _words_file, _write_manifest


def _words(texts, scores, start=0.0):
    words = tuple((text, start + n * 0.5, start + n * 0.5 + 0.4) for n, text in enumerate(texts))
    return mode.ItemWords(words, start, start + len(texts) * 0.5, "tiny", "en", None, scores=scores)


class TestWordsFileScores:
    def test_scores_survive_a_write_and_a_read(self, tmp_path):
        path = tmp_path / "w.json"
        original = _words(["a", "b", "c"], (0.9, None, 0.2))
        mode.write_words_file(path, original)
        assert mode.read_words_file(path) == original

    def test_a_file_with_no_scores_is_written_as_before(self, tmp_path):
        path = tmp_path / "w.json"
        mode.write_words_file(path, _words(["a"], ()))
        assert json.loads(path.read_text())["words"] == [["a", 0.0, 0.4]]

    def test_a_file_from_before_scores_still_reads(self, tmp_path):
        path = tmp_path / "w.json"
        mode.write_words_file(path, _words(["a", "b"], ()))
        assert mode.read_words_file(path).scores == ()

    @pytest.mark.parametrize("bad", ["x", [], True, {}])
    def test_a_score_that_is_not_a_number_is_a_cache_miss(self, tmp_path, bad):
        path = tmp_path / "w.json"
        mode.write_words_file(path, _words(["a"], (0.5,)))
        data = json.loads(path.read_text())
        data["words"][0][3] = bad
        path.write_text(json.dumps(data))
        assert mode.read_words_file(path) is None

    def test_scores_that_do_not_match_the_words_are_refused(self):
        with pytest.raises(ValueError, match="scores"):
            _words(["a", "b"], (0.5,))


class TestSplice:
    WINDOW = mode.Window(0, "g", "a.wav", "w.json", 1.0, 3.0)

    def test_the_rechecks_scores_replace_the_windows(self):
        existing = _words(["a", "b", "c", "d", "e", "f", "g"], (0.9, 0.2, 0.2, 0.2, 0.2, 0.9, 0.9))
        fresh = mode.ItemWords((("x", 1.2, 1.6), ("y", 1.7, 2.3), ("z", 2.4, 2.8)), 1.0, 3.0, "large", "en", None, scores=(0.99, 0.98, 0.97))
        spliced = mode.splice_window(existing, self.WINDOW, fresh, "large")
        assert [w[0] for w in spliced.words] == ["a", "b", "x", "y", "z", "g"]
        by_word = dict(zip((w[0] for w in spliced.words), spliced.scores, strict=True))
        assert by_word["x"] == 0.99 and by_word["a"] == 0.9

    def test_plain_words_splice_with_unknown_scores(self):
        existing = _words(["a", "b", "c", "d"], (0.9, 0.2, 0.2, 0.9))
        spliced = mode.splice_window(existing, self.WINDOW, [("x", 1.2, 1.6)], "large")
        by_word = dict(zip((w[0] for w in spliced.words), spliced.scores, strict=True))
        assert by_word["x"] is None and by_word["a"] == 0.9

    def test_a_file_without_scores_stays_without(self):
        existing = _words(["a", "b", "c", "d"], ())
        assert mode.splice_window(existing, self.WINDOW, [("x", 1.2, 1.6)], "large").scores == ()


def _result(texts, scores, start=0.0, length=None):
    words = _words(texts, scores, start)
    item = mode.ManifestItem(2, "{G}", "a.wav", start, length or words.source_end - start, "w.json", False)
    return mode._ItemResult(item, "transcribed", words, tuple(mode.played_words(words, item)))


class TestUnsureRuns:
    def test_confident_speech_has_none(self):
        assert mode.unsure_runs(_result(["a", "b", "c"], (0.9, 0.95, 0.99)), 0.6) == []

    def test_off_is_none(self):
        assert mode.unsure_runs(_result(["a", "b"], (0.1, 0.1)), 0.0) == []

    def test_no_scores_is_none(self):
        assert mode.unsure_runs(_result(["a", "b"], ()), 0.6) == []

    def test_two_neighbouring_low_words_are_one_passage_in_source_seconds(self):
        runs = mode.unsure_runs(_result(["a", "b", "c", "d", "e"], (0.9, 0.5, 0.4, 0.9, 0.9)), 0.6)
        assert runs == [{"itemIndex": 2, "itemGuid": "{G}", "start": 0.5, "end": 1.4, "words": 2, "minScore": 0.4}]

    def test_a_confident_word_or_two_does_not_split_a_passage(self):
        runs = mode.unsure_runs(_result(list("abcdefg"), (0.5, 0.9, 0.9, 0.5, 0.9, 0.9, 0.9)), 0.6)
        assert len(runs) == 1 and runs[0]["words"] == 2

    def test_three_confident_words_do_split_it(self):
        runs = mode.unsure_runs(_result(list("abcdefgh"), (0.5, 0.5, 0.9, 0.9, 0.9, 0.5, 0.5, 0.9)), 0.6)
        assert len(runs) == 2

    def test_one_slightly_low_word_is_a_name_not_a_passage(self):
        assert mode.unsure_runs(_result(["a", "b", "c"], (0.9, 0.55, 0.9)), 0.6) == []

    def test_one_very_low_word_is_a_passage(self):
        assert len(mode.unsure_runs(_result(["a", "b", "c"], (0.9, 0.1, 0.9)), 0.6)) == 1

    def test_an_unscored_word_is_never_unsure(self):
        assert mode.unsure_runs(_result(["a", "b", "c"], (None, None, 0.9)), 0.6) == []

    def test_words_outside_the_played_range_do_not_count(self):
        result = _result(["a", "b", "c", "d"], (0.1, 0.1, 0.9, 0.9), length=1.0)
        assert mode.unsure_runs(result, 0.6) == [{"itemIndex": 2, "itemGuid": "{G}", "start": 0.0, "end": 0.9, "words": 2, "minScore": 0.1}]


def test_the_report_lists_the_unsure_passages_when_asked(tmp_path, monkeypatch):
    manuscript = _project(tmp_path)
    words_dir = tmp_path / "words"
    words_dir.mkdir()
    text = f"{TITLE} {SUBTITLE} {P1}"
    plain = _words_file(words_dir / "item-0.json", text, 10.0, 20.0)
    scores = tuple(0.2 if n in (3, 4) else 0.95 for n in range(len(plain.words)))
    mode.write_words_file(words_dir / "item-0.json", mode.ItemWords(plain.words, 10.0, 20.0, "small", "en", None, scores=scores))
    manifest = _write_manifest(tmp_path / "manifest.json", [_item(0, "{A}", "a.wav", 10.0, 10.0)])
    monkeypatch.setattr(compare, "write_progress", lambda *a, **k: None)

    mode.run(_args(tmp_path, manuscript, manifest, unsure_below=0.6), compare)
    unsure = _lines(tmp_path / "out" / "coverage.txt")["COVERAGE_UNSURE"]

    assert len(unsure) == 1 and unsure[0]["itemIndex"] == 0 and unsure[0]["words"] == 2 and unsure[0]["minScore"] == 0.2

    mode.run(_args(tmp_path, manuscript, manifest), compare)
    assert "COVERAGE_UNSURE" not in _lines(tmp_path / "out" / "coverage.txt")


class TestTranscriberChoice:
    def _args(self, **overrides):
        values = {"model": "small", "model_dir": None, "language": None, "device": "cpu", "progress": None, "manuscript": "m.json"}
        values.update(overrides)
        return Namespace(**values)

    @pytest.fixture()
    def engine(self, monkeypatch):
        monkeypatch.setattr(compare, "load_vocabulary_hints", lambda _path: "Alyce")
        return compare

    def test_no_chunking_and_one_worker_is_the_plain_transcriber(self, engine):
        assert isinstance(mode._default_transcriber(engine, self._args()), mode.WhisperTranscriber)
        assert isinstance(mode._default_transcriber(engine, self._args(chunk_seconds=0, parallel_workers=1)), mode.WhisperTranscriber)

    def test_a_chunk_length_makes_the_chunked_transcriber(self, engine):
        transcriber = mode._default_transcriber(engine, self._args(chunk_seconds=300, parallel_workers=2, chunk_overlap_seconds=4))
        assert isinstance(transcriber, coverage_chunks.ChunkedTranscriber)

    def test_more_than_one_worker_alone_makes_the_chunked_transcriber(self, engine):
        assert isinstance(mode._default_transcriber(engine, self._args(parallel_workers=3)), coverage_chunks.ChunkedTranscriber)

    def test_workers_without_a_chunk_length_get_the_default_chunks_to_share(self, engine):
        transcriber = mode._default_transcriber(engine, self._args(parallel_workers=3))
        assert transcriber._chunk_seconds == coverage_chunks.DEFAULT_CHUNK_SECONDS
