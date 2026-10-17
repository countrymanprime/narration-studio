"""Tests for `core/coverage_chunks.py`: how a long item is cut into overlapping chunks, how the chunks'
words are joined at the crossover, and how many worker processes a run uses. The chunk transcriber is a
fake and the pool is a thread pool, so no Whisper model and no child process is needed."""

import itertools
import sys
from multiprocessing.pool import ThreadPool
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

CORE = Path(__file__).resolve().parents[1] / "core"
if str(CORE) not in sys.path:
    sys.path.insert(0, str(CORE))

import coverage_chunks as chunks
import coverage_mode as mode


def _item(length=100.0, start=10.0):
    return mode.ManifestItem(0, "g", "a.wav", start, length, "w.json", False)


class TestPlanChunks:
    def test_a_short_item_is_one_chunk(self):
        assert chunks.plan_chunks(120.0, 300.0, 6.0) == [chunks.Chunk(0.0, 120.0)]

    def test_chunking_off_is_one_chunk(self):
        assert chunks.plan_chunks(5000.0, 0.0, 6.0) == [chunks.Chunk(0.0, 5000.0)]

    def test_neighbours_overlap_by_the_crossover(self):
        planned = chunks.plan_chunks(1000.0, 300.0, 6.0)
        assert planned[0] == chunks.Chunk(0.0, 300.0)
        assert planned[1].start == pytest.approx(294.0)
        for left, right in itertools.pairwise(planned):
            assert left.end - right.start == pytest.approx(6.0)
        assert planned[-1].end == pytest.approx(1000.0)

    def test_a_tiny_tail_joins_the_last_chunk(self):
        planned = chunks.plan_chunks(305.0, 300.0, 6.0)
        assert planned == [chunks.Chunk(0.0, 305.0)]

    def test_every_second_is_inside_some_chunk(self):
        for length in (301.0, 599.5, 1234.5, 3600.0):
            planned = chunks.plan_chunks(length, 120.0, 10.0)
            assert planned[0].start == 0.0 and planned[-1].end == pytest.approx(length)
            assert all(right.start <= left.end for left, right in itertools.pairwise(planned))

    def test_a_crossover_too_big_for_the_chunk_is_shrunk(self):
        planned = chunks.plan_chunks(100.0, 20.0, 50.0)
        assert all(right.start > left.start for left, right in itertools.pairwise(planned))

    @pytest.mark.parametrize("length", [0.0, -1.0, float("nan")])
    def test_no_audio_is_no_chunks(self, length):
        assert chunks.plan_chunks(length, 300.0, 6.0) == []


def _words(*triples):
    return tuple(triples)


class TestMergeChunks:
    def test_the_cut_is_the_middle_of_the_crossover_and_no_word_repeats(self):
        left = chunks.ChunkWords(chunks.Chunk(0.0, 10.0), _words(("a", 1, 2), ("b", 8.0, 8.6), ("c", 9.0, 9.5)), (0.9, 0.8, 0.7))
        right = chunks.ChunkWords(chunks.Chunk(8.0, 20.0), _words(("b", 8.0, 8.6), ("c", 9.0, 9.5), ("d", 12, 13)), (0.95, 0.6, 0.9))
        words, scores = chunks.merge_chunks([left, right])
        assert [w[0] for w in words] == ["a", "b", "c", "d"]
        # cut = (8 + 10) / 2 = 9: b (mid 8.3) is the left chunk's, c (mid 9.25) the right chunk's.
        assert scores == (0.9, 0.8, 0.6, 0.9)

    def test_a_word_on_the_cut_belongs_to_one_chunk(self):
        left = chunks.ChunkWords(chunks.Chunk(0.0, 10.0), _words(("x", 8.5, 9.5)), (0.5,))
        right = chunks.ChunkWords(chunks.Chunk(8.0, 20.0), _words(("x", 8.5, 9.5)), (0.7,))
        words, scores = chunks.merge_chunks([left, right])
        assert len(words) == 1 and scores == (0.7,)

    def test_chunks_may_arrive_in_any_order(self):
        left = chunks.ChunkWords(chunks.Chunk(0.0, 10.0), _words(("a", 1, 2)), (None,))
        right = chunks.ChunkWords(chunks.Chunk(8.0, 20.0), _words(("d", 12, 13)), (None,))
        words, _ = chunks.merge_chunks([right, left])
        assert [w[0] for w in words] == ["a", "d"]

    def test_a_chunk_with_no_speech_leaves_the_others_whole(self):
        left = chunks.ChunkWords(chunks.Chunk(0.0, 10.0), _words(("a", 1, 2)), (0.9,))
        silent = chunks.ChunkWords(chunks.Chunk(8.0, 20.0), (), ())
        assert chunks.merge_chunks([left, silent]) == ((("a", 1, 2),), (0.9,))

    def test_nothing_in_nothing_out(self):
        assert chunks.merge_chunks([]) == ((), ())


class TestWorkerCount:
    def test_auto_follows_the_models_memory_cap(self):
        assert chunks.worker_count(0, 10, 8, {"small": 4}, "small", "cpu") == 4
        assert chunks.worker_count(0, 10, 8, {"large-v3": 1}, "large-v3", "cpu") == 1

    def test_a_named_number_is_kept_up_to_the_cpus_and_chunks(self):
        assert chunks.worker_count(3, 10, 8, {"small": 1}, "small", "cpu") == 3
        assert chunks.worker_count(16, 10, 4, {}, "small", "cpu") == 4
        assert chunks.worker_count(16, 2, 8, {}, "small", "cpu") == 2

    def test_a_gpu_runs_one(self):
        assert chunks.worker_count(4, 10, 8, {}, "small", "cuda") == 1

    def test_never_below_one(self):
        assert chunks.worker_count(0, 0, 0, {}, "small", "cpu") == 1


class _Engine(SimpleNamespace):
    def check_cancelled(self, _path):
        if self.cancel:
            raise RuntimeError("cancelled")


def _fake_chunk_words(job):
    """A chunk's words: one word per whole second of the chunk, at the chunk's own absolute seconds."""
    first = int(np.ceil(job.chunk.start))
    last = int(job.chunk.end)
    words = tuple((f"w{second}", float(second), second + 0.5) for second in range(first, last))
    scores = tuple(0.9 if second % 2 else 0.2 for second in range(first, last))
    return chunks.ChunkWords(job.chunk, words, scores, "en")


def _transcriber(**overrides):
    options = {
        "engine": _Engine(cancel=False, MAX_WORKERS_BY_MODEL={"small": 4}),
        "model_size": "small",
        "model_dir": None,
        "device": "cpu",
        "language": None,
        "hotwords": None,
        "chunk_seconds": 30.0,
        "overlap_seconds": 4.0,
        "workers": 2,
        "decode": lambda item: np.zeros(int(item.length * chunks.SAMPLE_RATE), dtype=np.float32),
        "chunk_fn": _fake_chunk_words,
        "pool_factory": lambda n: ThreadPool(n),
        "progress_path": None,
    }
    options.update(overrides)
    return chunks.ChunkedTranscriber(**options)


class TestChunkedTranscriber:
    def test_words_come_back_in_the_sources_seconds_with_no_repeats(self):
        item = _item(length=100.0, start=10.0)
        result = _transcriber()(item, lambda seconds: None)
        starts = [w[1] for w in result.words]
        assert starts == sorted(starts) and len(set(starts)) == len(starts)
        # one word per second of the item, shifted by the item's offset in its source
        assert starts[0] == pytest.approx(10.0) and starts[-1] == pytest.approx(109.0)
        assert len(result.words) == 100
        assert result.source_start == 10.0 and result.source_end == 110.0 and result.model == "small"
        assert len(result.scores) == len(result.words)

    def test_the_language_is_the_first_chunks_when_none_was_forced(self):
        seen = []

        def fake(job):
            seen.append((job.chunk.start, job.language))
            return _fake_chunk_words(job)

        result = _transcriber(chunk_fn=fake)(_item(), lambda seconds: None)
        assert result.language == "en"
        assert seen[0][1] is None
        assert all(language == "en" for start, language in seen if start > 0)

    def test_a_forced_language_goes_to_every_chunk(self):
        seen = []

        def fake(job):
            seen.append(job.language)
            return _fake_chunk_words(job)

        _transcriber(chunk_fn=fake, language="fr")(_item(), lambda seconds: None)
        assert set(seen) == {"fr"}

    def test_progress_grows_to_the_items_length(self):
        done = []
        _transcriber()(_item(length=100.0), done.append)
        assert done == sorted(done) and done[-1] == pytest.approx(100.0)

    def test_cancel_stops_the_run_and_ends_the_pool(self):
        engine = _Engine(cancel=False, MAX_WORKERS_BY_MODEL={})
        ended = []

        class Pool(ThreadPool):
            def terminate(self):
                ended.append(True)
                super().terminate()

        def cancel_after_first(seconds):
            engine.cancel = True

        with pytest.raises(RuntimeError, match="cancelled"):
            _transcriber(engine=engine, pool_factory=lambda n: Pool(n))(_item(), cancel_after_first)
        assert ended

    def test_a_chunk_that_fails_fails_the_item(self):
        def broken(job):
            if job.chunk.start > 0:
                raise ValueError("the model fell over")
            return _fake_chunk_words(job)

        with pytest.raises(ValueError, match="fell over"):
            _transcriber(chunk_fn=broken)(_item(), lambda seconds: None)

    def test_one_worker_never_makes_a_pool(self):
        def no_pool(n):
            raise AssertionError("a pool was made")

        result = _transcriber(workers=1, pool_factory=no_pool)(_item(length=100.0), lambda seconds: None)
        assert len(result.words) == 100


class _Word(SimpleNamespace):
    pass


class _FakeModel:
    def __init__(self):
        self.calls = []

    def transcribe(self, audio, **options):
        self.calls.append((len(audio), options))
        segment = SimpleNamespace(words=[_Word(word=" hi", start=0.5, end=0.9, probability=0.8123), _Word(word=" there", start=1.0, end=1.4)])
        return iter([segment]), SimpleNamespace(language="en")


def test_a_chunks_words_are_in_the_items_seconds_with_their_probabilities():
    model = _FakeModel()
    job = chunks.ChunkJob(chunks.Chunk(100.0, 130.0), np.zeros(10, dtype=np.float32), "tinyx", None, "cpu", "en", "Alyce", 2)
    chunks._MODELS[("tinyx", None, "cpu", 2)] = model
    try:
        result = chunks.whisper_chunk(job)
    finally:
        chunks._MODELS.pop(("tinyx", None, "cpu", 2))
    assert result.words == (("hi", 100.5, 100.9), ("there", 101.0, 101.4))
    assert result.scores == (0.812, None)
    assert result.language == "en"
    assert model.calls[0][1] == {"language": "en", "word_timestamps": True, "vad_filter": True, "hotwords": "Alyce"}


def test_real_worker_processes_return_the_same_words_as_one_process():
    item = _item(length=100.0, start=10.0)
    in_process = _transcriber(workers=1)(item, lambda seconds: None)
    spawned = _transcriber(workers=2, pool_factory=chunks.spawn_pool)(item, lambda seconds: None)
    assert spawned.words == in_process.words and spawned.scores == in_process.scores


def test_an_item_that_decodes_to_nothing_has_no_words_and_starts_no_chunk():
    item = _item()
    result = _transcriber(decode=lambda _item: np.zeros(0, dtype=np.float32), chunk_fn=lambda job: pytest.fail("a chunk was transcribed"))(item, lambda s: None)
    assert result.words == () and (result.source_start, result.source_end) == (item.start_offset, item.end)


def test_an_item_of_one_chunk_goes_to_the_plain_transcriber_which_streams_progress():
    asked = []

    def plain(item, on_seconds):
        asked.append(item.index)
        return "plain words"

    item = _item(length=100.0)  # chunk_seconds is 30 in _transcriber, so this is several chunks
    assert _transcriber(plain=plain, chunk_seconds=500.0)(item, lambda s: None) == "plain words"
    assert asked == [0]
    chunked = _transcriber(plain=plain)(item, lambda s: None)
    assert asked == [0] and len(chunked.words) == 100


def test_a_chunk_stopped_by_the_cancel_file_ends_the_run_with_the_engines_own_cancel():
    engine = _Engine(cancel=True, MAX_WORKERS_BY_MODEL={})

    def stopped(job):
        raise chunks.ChunkCancelled

    with pytest.raises(RuntimeError, match="cancelled"):
        _transcriber(engine=engine, chunk_fn=stopped)(_item(), lambda s: None)


def test_a_chunk_that_saw_a_cancel_file_that_is_gone_is_not_swallowed():
    def stopped(job):
        raise chunks.ChunkCancelled

    with pytest.raises(chunks.ChunkCancelled):
        _transcriber(chunk_fn=stopped)(_item(), lambda s: None)


def test_a_worker_stops_between_segments_when_the_cancel_file_exists(tmp_path):
    cancel = tmp_path / "progress.txt.cancel"
    cancel.write_text("cancel")
    job = chunks.ChunkJob(chunks.Chunk(0.0, 30.0), np.zeros(10, dtype=np.float32), "tinyy", None, "cpu", "en", None, 0, str(cancel))
    chunks._MODELS[("tinyy", None, "cpu", 0)] = _FakeModel()
    try:
        with pytest.raises(chunks.ChunkCancelled):
            chunks.whisper_chunk(job)
    finally:
        chunks._MODELS.pop(("tinyy", None, "cpu", 0))


def test_the_chunked_transcriber_hands_each_chunk_the_cancel_file_of_its_run(tmp_path):
    seen = []

    def fake(job):
        seen.append(job.cancel_path)
        return _fake_chunk_words(job)

    _transcriber(chunk_fn=fake, progress_path=str(tmp_path / "progress.txt"))(_item(), lambda s: None)
    assert set(seen) == {str(tmp_path / "progress.txt") + ".cancel"}
