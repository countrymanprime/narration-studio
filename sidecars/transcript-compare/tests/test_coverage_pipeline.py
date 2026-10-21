"""Tests for the recording check's pipelined model cascade and its item-level worker pool
(docs/design/recording-check-pipeline.md): the small model's workers feed a queue of items with doubtful
passages, the large model's workers drain it, and one alignment runs when both are done. Every
transcriber here is a fake; threads stand in for the Whisper workers."""

import importlib
import json
import threading
import time
from pathlib import Path

import pytest
import test_coverage_mode as base
from hypothesis import given
from hypothesis import strategies as st
from test_coverage_mode import (
    P1,
    P2,
    P3,
    SUBTITLE,
    TITLE,
    _args,
    _item,
    _lines,
    _project,
    _timed,
    _write_manifest,
    compare,
    mode,
)

pipeline = importlib.import_module("coverage_pipeline")  # on sys.path once test_coverage_mode is imported
progress = base.progress

WAIT = 5.0
"""How long a fake waits for the other model's fake before the test calls the run serial."""

MODEL_CAPS = {"tiny": 8, "base": 6, "small": 4, "medium": 2, "large-v3-turbo": 2, "large-v3": 1}


# ---------------------------------------------------------------------------
# fixtures


ITEM_SECONDS = 60.0
CORRUPT = {"tired": "tide"}  # the first pass mishears this word, with a low score


def _truth(text, start=0.0):
    return _timed(text, start)


def _corpus(tmp_path, count=3, seconds=ITEM_SECONDS):
    """A chapter of `count` items (`count` up to 3), one paragraph each, `seconds` of source apiece."""
    manuscript = _project(tmp_path)
    texts = [f"{TITLE} {SUBTITLE} {P1}", P2, P3][:count]
    items = [_item(n, f"{{G{n}}}", f"s{n}.wav", 0.0, seconds) for n in range(count)]
    manifest = _write_manifest(tmp_path / "m.json", items)
    return manuscript, manifest, {n: _truth(text) for n, text in enumerate(texts)}


def _first_pass(truth, *, started=None, hold=None, on_call=None):
    """The small model: the truth with one misheard word and a low score on it and the word before."""

    def transcribe(item, on_seconds):
        if on_call:
            on_call(item)
        if started is not None:
            started.append(item.index)
        if hold:
            hold(item)
        spoken = truth[item.index]
        words = [(CORRUPT.get(text, text), start, end) for text, start, end in spoken]
        scores = [0.1 if text in CORRUPT else 0.95 for text, _s, _e in spoken]
        for position in range(len(spoken) - 1):
            if spoken[position + 1][0] in CORRUPT:
                scores[position] = 0.2  # the word before it was shaky too: two unsure words make a passage
        on_seconds(item.length)
        return mode.ItemWords(tuple(words), item.start_offset, item.end, "tiny", "en", None, scores=tuple(scores))

    return transcribe


def _recheck(truth, *, calls=None, hold=None):
    """The large model: the truth inside the window it was given, every word sure."""

    def transcribe(item, on_seconds):
        if calls is not None:
            calls.append((item.index, item.start_offset, item.end))
        if hold:
            hold(item)
        inside = tuple(word for word in truth[item.index] if item.start_offset <= (word[1] + word[2]) / 2 <= item.end)
        on_seconds(item.length)
        return mode.ItemWords(inside, item.start_offset, item.end, "large-v3-turbo", "en", None, scores=tuple(0.99 for _ in inside))

    return transcribe


def _cascade_args(tmp_path, manuscript, manifest, **overrides):
    values = {"unsure_below": 0.5, "recheck_model": "large-v3-turbo", "model": "tiny", "parallel_workers": 0}
    values.update(overrides)
    return _args(tmp_path, manuscript, manifest, **values)


@pytest.fixture()
def cpus(monkeypatch):
    def set_cpus(count):
        monkeypatch.setattr(pipeline, "cpu_count", lambda: count)

    set_cpus(4)
    return set_cpus


def _words_files(tmp_path):
    out = {}
    for path in sorted((tmp_path / "words").glob("item-*.json")):
        out[path.name] = json.loads(path.read_text(encoding="utf-8"))
    return out


# ---------------------------------------------------------------------------
# the worker budget


@given(
    cpu=st.integers(1, 64),
    requested=st.integers(0, 16),
    first=st.sampled_from(sorted(MODEL_CAPS)),
    recheck=st.sampled_from(sorted(MODEL_CAPS)),
    items=st.integers(1, 40),
    device=st.sampled_from(["cpu", "cuda"]),
)
def test_the_two_models_never_use_more_threads_than_the_computer_has(cpu, requested, first, recheck, items, device):
    budget = pipeline.plan_budget(cpu, requested, first, recheck, items, device, MODEL_CAPS)

    assert budget.first.workers >= 1 and budget.first.threads >= 1
    assert budget.recheck.workers >= 1 and budget.recheck.threads >= 1
    if budget.serial:
        assert cpu == 1
        return
    used = budget.first.workers * budget.first.threads + budget.recheck.workers * budget.recheck.threads
    assert used <= cpu


@given(cpu=st.integers(1, 64), requested=st.integers(0, 16), model=st.sampled_from(sorted(MODEL_CAPS)), items=st.integers(1, 40))
def test_a_single_model_pool_never_uses_more_threads_than_the_computer_has(cpu, requested, model, items):
    budget = pipeline.plan_item_workers(cpu, requested, model, items, "cpu", MODEL_CAPS)

    assert 1 <= budget.workers <= max(1, items)
    assert budget.workers * budget.threads <= cpu


def test_a_named_number_of_workers_is_an_upper_bound_for_each_model():
    budget = pipeline.plan_budget(16, 3, "tiny", "large-v3-turbo", 40, "cpu", MODEL_CAPS)

    assert budget.first.workers <= 3 and budget.recheck.workers <= 3


def test_the_large_model_is_capped_by_memory_whatever_is_asked():
    turbo = pipeline.plan_budget(32, 12, "tiny", "large-v3-turbo", 40, "cpu", MODEL_CAPS)
    biggest = pipeline.plan_budget(32, 12, "tiny", "large-v3", 40, "cpu", MODEL_CAPS)

    assert turbo.recheck.workers <= 2
    assert biggest.recheck.workers == 1


def test_the_cpus_are_split_by_what_each_model_costs():
    cheap_first = pipeline.plan_budget(16, 0, "tiny", "large-v3", 40, "cpu", MODEL_CAPS)
    dear_first = pipeline.plan_budget(16, 0, "medium", "large-v3", 40, "cpu", MODEL_CAPS)

    def first_share(budget):
        return budget.first.workers * budget.first.threads

    assert first_share(dear_first) > first_share(cheap_first)


def test_a_gpu_runs_one_worker_per_model_and_shares_each_instance():
    budget = pipeline.plan_budget(16, 8, "tiny", "large-v3-turbo", 40, "cuda", MODEL_CAPS)

    assert (budget.first.workers, budget.recheck.workers) == (1, 1)
    assert budget.shared_instance is True


def test_one_cpu_runs_the_two_models_one_after_the_other():
    budget = pipeline.plan_budget(1, 0, "tiny", "large-v3-turbo", 40, "cpu", MODEL_CAPS)

    assert budget.serial is True


def test_auto_leaves_each_item_worker_two_threads_on_four_cpus():
    """The measured lesson (docs/research/recording-coverage-batched-whisper.md): four workers on four CPUs was slower than two."""
    budget = pipeline.plan_item_workers(4, 0, "small", 20, "cpu", MODEL_CAPS)

    assert (budget.workers, budget.threads) == (2, 2)


# ---------------------------------------------------------------------------
# the pipeline


def test_the_second_items_first_pass_overlaps_the_first_items_recheck(tmp_path, progress, cpus):
    manuscript, manifest, truth = _corpus(tmp_path)
    second_started = threading.Event()
    overlapped = []

    def hold_recheck(item):
        if item.index == 0:
            overlapped.append(second_started.wait(WAIT))

    first = _first_pass(truth, on_call=lambda item: second_started.set() if item.index == 1 else None)
    recheck = _recheck(truth, hold=hold_recheck)

    mode.run(_cascade_args(tmp_path, manuscript, manifest, parallel_workers=1), compare, transcriber=first, recheck_transcriber=recheck)

    assert overlapped == [True]  # a sequential cascade would have waited here for nothing


def test_item_twos_first_pass_overlaps_item_ones_recheck_for_a_chapter_of_many_short_items(tmp_path, progress, cpus):
    manuscript, manifest, truth = _corpus(tmp_path)
    in_recheck = threading.Event()
    seen = []

    def during_recheck(item):
        if item.index == 2:
            seen.append(in_recheck.is_set())

    def hold(item):
        if item.index == 1:
            in_recheck.set()
            time.sleep(0.3)
            in_recheck.clear()

    first = _first_pass(truth, hold=during_recheck)
    recheck = _recheck(truth, hold=hold)

    mode.run(_cascade_args(tmp_path, manuscript, manifest, parallel_workers=1), compare, transcriber=first, recheck_transcriber=recheck)

    assert seen  # item 2 was transcribed
    assert in_recheck.is_set() is False


def test_the_pipelined_result_equals_the_sequential_one(tmp_path, progress, cpus):
    """The oracle: the sidecar's own two-stage path (first pass with the score line, `--recheck` over the padded doubtful
    windows, `--align-only`) that the host still runs when pipelining is off."""
    manuscript, manifest, truth = _corpus(tmp_path)
    first = _first_pass(truth)

    sequential = tmp_path / "sequential"
    sequential.mkdir()
    seq_args = _args(sequential, manuscript, manifest, unsure_below=0.5, model="tiny")
    mode.run(seq_args, compare, transcriber=first)
    doubted = _lines(seq_args.out)["COVERAGE_UNSURE"]
    windows = []
    for passage in doubted:
        item = mode.read_manifest(manifest)[passage["itemIndex"]]
        windows.append(pipeline.pad_window(passage["start"], passage["end"], item.start_offset, item.end))
    assert windows, "the corpus must have doubted passages or this proves nothing"
    windows_path = sequential / "windows.json"
    windows_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "windows": [
                    {
                        "itemIndex": p["itemIndex"],
                        "itemGuid": p["itemGuid"],
                        "sourceFile": f"s{p['itemIndex']}.wav",
                        "wordsFile": f"item-{p['itemIndex']}.json",
                        "start": w[0],
                        "end": w[1],
                    }
                    for p, w in zip(doubted, windows, strict=True)
                ],
            }
        ),
        encoding="utf-8",
    )
    recheck_args = _args(sequential, manuscript, manifest, model="large-v3-turbo", recheck=str(windows_path))
    mode.run_recheck(recheck_args, compare, transcriber=_recheck(truth))
    align_args = _args(sequential, manuscript, manifest, model="tiny", align_only=True)
    mode.run(align_args, compare)

    piped = tmp_path / "piped"
    piped.mkdir()
    piped_args = _cascade_args(piped, manuscript, manifest)
    mode.run(piped_args, compare, transcriber=first, recheck_transcriber=_recheck(truth))

    def stable(out):
        lines = _lines(out)
        return {tag: payloads for tag, payloads in lines.items() if tag in ("COVERAGE_PARAGRAPH", "COVERAGE_REGION", "COVERAGE_TOKEN", "COVERAGE_EXTRA")}

    assert stable(piped_args.out) == stable(align_args.out)
    assert _words_files(piped) == _words_files(sequential)


def test_the_pipelined_check_finds_the_word_the_first_model_misheard(tmp_path, progress, cpus):
    manuscript, manifest, truth = _corpus(tmp_path)
    plain = tmp_path / "plain"
    plain.mkdir()
    plain_args = _args(plain, manuscript, manifest, model="tiny")
    mode.run(plain_args, compare, transcriber=_first_pass(truth))
    piped_args = _cascade_args(tmp_path, manuscript, manifest)

    mode.run(piped_args, compare, transcriber=_first_pass(truth), recheck_transcriber=_recheck(truth))

    def heard(folder):
        return [word[0] for word in _words_files(folder)["item-0.json"]["words"]]

    assert "tide" in heard(plain) and "tired" not in heard(plain)  # the first model alone keeps its mistake
    assert "tired" in heard(tmp_path) and "tide" not in heard(tmp_path)  # the large model corrected it, while the run was still going
    assert [line["windows"] for line in _lines(piped_args.out)["COVERAGE_RECHECKED"]] == [1]


def test_a_cancel_in_the_middle_keeps_every_item_that_was_finished(tmp_path, progress, cpus):
    manuscript, manifest, truth = _corpus(tmp_path)
    args = _cascade_args(tmp_path, manuscript, manifest, parallel_workers=1)
    first_pass = _first_pass(truth)

    def first(item, on_seconds):
        if item.index == 2:
            Path(args.progress + ".cancel").write_text("", encoding="utf-8")
            on_seconds(1.0)
        return first_pass(item, on_seconds)

    with pytest.raises(compare.Cancelled):
        mode.run(args, compare, transcriber=first, recheck_transcriber=_recheck(truth))

    files = _words_files(tmp_path)
    assert "item-0.json" in files and "item-1.json" in files
    assert "item-2.json" not in files
    assert not Path(args.out).exists()
    assert not list((tmp_path / "words").glob("*.tmp"))


def test_the_splice_never_touches_a_words_file_before_its_first_pass_write_is_final(tmp_path, progress, cpus, monkeypatch):
    manuscript, manifest, truth = _corpus(tmp_path)
    events = []
    real_write = mode.write_words_file

    def recording_write(path, words):
        events.append(("write-spliced" if words.spans else "write-first", Path(path).name))
        real_write(path, words)

    monkeypatch.setattr(mode, "write_words_file", recording_write)

    def at_recheck(item):
        on_disk = mode.read_words_file(Path(tmp_path / "words" / f"item-{item.index}.json"))
        events.append(("recheck-sees", item.index, None if on_disk is None else on_disk.model))

    mode.run(_cascade_args(tmp_path, manuscript, manifest), compare, transcriber=_first_pass(truth), recheck_transcriber=_recheck(truth, hold=at_recheck))

    def order_of(index):
        return [event for event in events if event[1] in (f"item-{index}.json", index)]

    doubted = order_of(0)  # the one item with a doubtful passage: written final, then seen by the re-check, then spliced
    assert [event[0] for event in doubted] == ["write-first", "recheck-sees", "write-spliced"]
    assert doubted[1][2] == "tiny"  # the file the re-check saw was already the finished first pass
    assert [event[0] for event in order_of(1)] == ["write-first"] and [event[0] for event in order_of(2)] == ["write-first"]


def test_a_failing_recheck_fails_the_run_and_keeps_the_first_pass_words(tmp_path, progress, cpus):
    manuscript, manifest, truth = _corpus(tmp_path)

    def broken(item, on_seconds):
        raise RuntimeError("the large model is gone")

    with pytest.raises(RuntimeError, match="the large model is gone"):
        mode.run(_cascade_args(tmp_path, manuscript, manifest), compare, transcriber=_first_pass(truth), recheck_transcriber=broken)

    assert set(_words_files(tmp_path)) <= {"item-0.json", "item-1.json", "item-2.json"}
    assert all(f["words"] != [] for f in _words_files(tmp_path).values())


def test_one_cpu_never_runs_two_transcriptions_at_once(tmp_path, progress, cpus):
    cpus(1)
    manuscript, manifest, truth = _corpus(tmp_path)
    running, peak, lock = [0], [0], threading.Lock()

    def guarded(inner):
        def call(item, on_seconds):
            with lock:
                running[0] += 1
                peak[0] = max(peak[0], running[0])
            try:
                time.sleep(0.02)
                return inner(item, on_seconds)
            finally:
                with lock:
                    running[0] -= 1

        return call

    mode.run(_cascade_args(tmp_path, manuscript, manifest), compare, transcriber=guarded(_first_pass(truth)), recheck_transcriber=guarded(_recheck(truth)))

    assert peak[0] == 1


def test_workers_in_flight_never_pass_what_the_budget_gave_each_model(tmp_path, progress, cpus):
    cpus(8)
    manuscript, manifest, truth = _corpus(tmp_path)
    budget = pipeline.plan_budget(8, 0, "tiny", "large-v3-turbo", 3, "cpu", MODEL_CAPS)
    running = {"first": 0, "recheck": 0}
    peak = {"first": 0, "recheck": 0}
    lock = threading.Lock()

    def guarded(kind, inner):
        def call(item, on_seconds):
            with lock:
                running[kind] += 1
                peak[kind] = max(peak[kind], running[kind])
            try:
                time.sleep(0.05)
                return inner(item, on_seconds)
            finally:
                with lock:
                    running[kind] -= 1

        return call

    mode.run(
        _cascade_args(tmp_path, manuscript, manifest),
        compare,
        transcriber=guarded("first", _first_pass(truth)),
        recheck_transcriber=guarded("recheck", _recheck(truth)),
    )

    assert peak["first"] <= budget.first.workers and peak["recheck"] <= budget.recheck.workers


def test_progress_has_one_denominator_and_never_goes_backwards(tmp_path, progress, cpus):
    manuscript, manifest, truth = _corpus(tmp_path)

    mode.run(_cascade_args(tmp_path, manuscript, manifest), compare, transcriber=_first_pass(truth), recheck_transcriber=_recheck(truth))

    percents = [pct for _stage, pct, _message in progress.lines]
    assert percents == sorted(percents)
    transcribing = [pct for stage, pct, _m in progress.lines if stage == "TRANSCRIBE"]
    assert transcribing[-1] == mode.TRANSCRIBE_END_PCT
    assert progress.lines[-1][0] == "DONE"
    assert any("re-check" in message.lower() for _s, _p, message in progress.lines)


def test_a_chapter_the_larger_model_would_mostly_redo_is_rechecked_whole(tmp_path, progress, cpus):
    manuscript, manifest, truth = _corpus(tmp_path, seconds=30.0)  # a 25 s minimum window is most of a 30 s item
    calls = []

    def doubtful(item, on_seconds):
        words = tuple((text, start, end) for text, start, end in truth[item.index])
        on_seconds(item.length)
        return mode.ItemWords(words, item.start_offset, item.end, "tiny", "en", None, scores=tuple(0.1 for _ in words))

    mode.run(_cascade_args(tmp_path, manuscript, manifest), compare, transcriber=doubtful, recheck_transcriber=_recheck(truth, calls=calls))

    assert {index for index, start, end in calls if (start, end) == (0.0, 30.0)} == {0, 1, 2}  # every item, whole, once the windows passed 60%


def test_nothing_doubtful_means_the_large_model_is_never_asked(tmp_path, progress, cpus):
    manuscript, manifest, truth = _corpus(tmp_path)

    def sure(item, on_seconds):
        words = truth[item.index]
        on_seconds(item.length)
        return mode.ItemWords(words, item.start_offset, item.end, "tiny", "en", None, scores=tuple(0.99 for _ in words))

    def never(item, on_seconds):
        raise AssertionError("no passage was doubtful")

    args = _cascade_args(tmp_path, manuscript, manifest)
    mode.run(args, compare, transcriber=sure, recheck_transcriber=never)

    assert "COVERAGE_RECHECKED" not in _lines(args.out)


# ---------------------------------------------------------------------------
# the item-level pool


def test_items_are_transcribed_in_parallel_up_to_the_workers_asked_for(tmp_path, progress, cpus):
    cpus(8)
    manuscript, manifest, truth = _corpus(tmp_path)
    gate = threading.Barrier(2, timeout=WAIT)
    running, peak, lock = [0], [0], threading.Lock()

    def transcriber(item, on_seconds):
        with lock:
            running[0] += 1
            peak[0] = max(peak[0], running[0])
        try:
            if item.index < 2:
                gate.wait()  # two items must be in flight together, or this raises BrokenBarrierError
            on_seconds(item.length)
            return mode.ItemWords(truth[item.index], item.start_offset, item.end, "small", "en", None)
        finally:
            with lock:
                running[0] -= 1

    args = _args(tmp_path, manuscript, manifest, parallel_workers=2)
    mode.run(args, compare, transcriber=transcriber)

    assert 2 <= peak[0] <= 2
    assert [item["index"] for item in _lines(args.out)["COVERAGE_ITEM"]] == [0, 1, 2]


def test_the_pool_gives_the_same_chapter_as_one_item_at_a_time(tmp_path, progress, cpus):
    cpus(8)
    manuscript, manifest, truth = _corpus(tmp_path)

    def transcriber(item, on_seconds):
        on_seconds(item.length)
        return mode.ItemWords(truth[item.index], item.start_offset, item.end, "small", "en", None)

    outputs = []
    for workers, sub in ((1, "one"), (3, "three")):
        folder = tmp_path / sub
        folder.mkdir()
        args = _args(folder, manuscript, manifest, parallel_workers=workers)
        mode.run(args, compare, transcriber=transcriber)
        outputs.append({tag: payloads for tag, payloads in _lines(args.out).items() if tag != "COVERAGE_ITEM"})

    assert outputs[0] == outputs[1]


def test_a_cancel_while_the_pool_is_busy_keeps_finished_items_and_stops_the_rest(tmp_path, progress, cpus):
    cpus(8)
    manuscript, manifest, truth = _corpus(tmp_path)
    args = _args(tmp_path, manuscript, manifest, parallel_workers=2)
    started = []

    def transcriber(item, on_seconds):
        started.append(item.index)
        if item.index == 1:
            Path(args.progress + ".cancel").write_text("", encoding="utf-8")
            on_seconds(1.0)
        on_seconds(item.length)
        return mode.ItemWords(truth[item.index], item.start_offset, item.end, "small", "en", None)

    with pytest.raises(compare.Cancelled):
        mode.run(args, compare, transcriber=transcriber)

    assert not Path(args.out).exists()
    assert not list((tmp_path / "words").glob("*.tmp"))
    for name in _words_files(tmp_path):
        assert mode.read_words_file(tmp_path / "words" / name) is not None  # a finished item is whole or absent, never half


def test_one_worker_is_the_old_loop(tmp_path, progress, cpus):
    manuscript, manifest, truth = _corpus(tmp_path)
    order = []

    def transcriber(item, on_seconds):
        order.append(item.index)
        on_seconds(item.length)
        return mode.ItemWords(truth[item.index], item.start_offset, item.end, "small", "en", None)

    mode.run(_args(tmp_path, manuscript, manifest, parallel_workers=1), compare, transcriber=transcriber)

    assert order == [0, 1, 2]


def test_re_check_windows_of_different_items_run_together_and_each_file_is_written_once(tmp_path, progress, cpus, monkeypatch):
    cpus(8)
    manuscript, manifest, truth = _corpus(tmp_path)
    for index in range(3):
        mode.write_words_file(tmp_path / "words" / f"item-{index}.json", mode.ItemWords(truth[index], 0.0, ITEM_SECONDS, "tiny", "en", None))
    windows = [{"itemIndex": n, "itemGuid": f"{{G{n}}}", "sourceFile": f"s{n}.wav", "wordsFile": f"item-{n}.json", "start": 0.0, "end": 25.0} for n in range(3)]
    path = tmp_path / "windows.json"
    path.write_text(json.dumps({"schemaVersion": 1, "windows": windows}), encoding="utf-8")
    writes = []
    real_write = mode.write_words_file
    monkeypatch.setattr(mode, "write_words_file", lambda p, w: (writes.append(Path(p).name), real_write(p, w))[1])
    gate = threading.Barrier(2, timeout=WAIT)

    def transcriber(item, on_seconds):
        if item.index < 2:
            gate.wait()
        on_seconds(item.length)
        return mode.ItemWords(truth[item.index], item.start_offset, item.end, "large-v3-turbo", "en", None)

    args = _args(tmp_path, manuscript, manifest, model="large-v3-turbo", recheck=str(path), parallel_workers=2)
    mode.run_recheck(args, compare, transcriber=transcriber)

    assert sorted(writes) == ["item-0.json", "item-1.json", "item-2.json"]


# ---------------------------------------------------------------------------
# the windows the pipeline builds


def test_a_doubtful_passage_is_padded_and_never_leaves_its_item():
    assert pipeline.pad_window(30.0, 31.0, 0.0, 100.0) == (18.0, 43.0)  # 3 s each side, then up to 25 s
    assert pipeline.pad_window(0.5, 1.0, 0.0, 100.0)[0] == 0.0
    assert pipeline.pad_window(98.0, 99.0, 0.0, 100.0)[1] == 100.0
    assert pipeline.pad_window(1.0, 2.0, 0.0, 10.0) == (0.0, 10.0)  # an item shorter than a window is wholly windowed


def test_windows_closer_than_twenty_seconds_merge_and_farther_ones_do_not():
    merged = pipeline.merge_windows([(0.0, 25.0), (40.0, 65.0), (100.0, 125.0)])

    assert merged == [(0.0, 65.0), (100.0, 125.0)]


def test_the_window_rules_agree_with_the_hosts_planner():
    """The same table `plan_test.go` reads: the sidecar's copy of MC3's padding and merging cannot drift from the host's."""
    table = json.loads((Path(__file__).parent / "fixtures" / "recheck_windows.json").read_text(encoding="utf-8"))
    for case in table["pad"]:
        assert list(pipeline.pad_window(*case["in"])) == case["out"], case
    for case in table["merge"]:
        assert [list(w) for w in pipeline.merge_windows([tuple(w) for w in case["in"]])] == case["out"], case


# ---------------------------------------------------------------------------
# one model for every worker


def test_a_gpu_model_is_shared_and_taken_one_call_at_a_time(monkeypatch):
    inside, peak, lock = [0], [0], threading.Lock()

    class Model:
        def transcribe(self, audio, **kwargs):
            with lock:
                inside[0] += 1
                peak[0] = max(peak[0], inside[0])
            time.sleep(0.02)
            with lock:
                inside[0] -= 1
            return iter(()), type("Info", (), {"language": "en"})()

    loads = []
    engine = type("Engine", (), {"decode_segment": staticmethod(lambda *a: b"")})()
    transcriber = mode.WhisperTranscriber(
        engine,
        model_size="tiny",
        language=None,
        hotwords=None,
        model_factory=lambda: loads.append(1) or Model(),
        serialize=True,
    )
    item = mode.ManifestItem(0, "{A}", "a.wav", 0.0, 1.0, "w.json", False)
    threads = [threading.Thread(target=transcriber, args=(item, lambda s: None)) for _ in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(loads) == 1 and peak[0] == 1


def test_a_cpu_model_is_loaded_once_and_given_every_worker(monkeypatch):
    loaded = []
    monkeypatch.setattr(
        mode, "_load_whisper_model", lambda size, directory, device, cpu_threads=0, num_workers=1: loaded.append((size, cpu_threads, num_workers)) or object()
    )
    monkeypatch.setattr(pipeline, "cpu_count", lambda: 8)
    engine = type("Engine", (), {"write_progress": staticmethod(lambda *a: None), "load_vocabulary_hints": staticmethod(lambda manuscript: None)})()
    args = type(
        "Args",
        (),
        {
            "model": "small",
            "model_dir": None,
            "device": "cpu",
            "language": None,
            "manuscript": "m.json",
            "progress": None,
            "chunk_seconds": 0,
            "parallel_workers": 0,
        },
    )()
    budget = pipeline.ModelBudget(workers=2, threads=4)

    transcriber = mode.shared_transcriber(engine, args, args.model, budget, shared_instance=False)
    transcriber._factory()
    transcriber._factory()

    assert loaded == [("small", 4, 2), ("small", 4, 2)]  # one load per factory call; the transcriber calls it once and keeps it


# ---------------------------------------------------------------------------
# the command line


@pytest.mark.parametrize(
    "extra",
    [
        ["--recheck-model", "large-v3-turbo"],  # no score line: nothing for the pipeline to feed the larger model
        ["--recheck-model", "large-v3-turbo", "--unsure-below", "0.5", "--align-only"],
        ["--recheck-model", "large-v3-turbo", "--unsure-below", "0.5", "--recheck", "windows.json", "--words-dir", "w"],
    ],
)
def test_the_pipeline_flags_are_checked_before_anything_runs(monkeypatch, capsys, extra):
    monkeypatch.setattr("sys.argv", ["compare.py", "--coverage", "--manuscript", "m.json", *extra])

    with pytest.raises(SystemExit) as exit_info:
        compare.main()

    assert exit_info.value.code == 2
    assert "recheck-model" in capsys.readouterr().err
