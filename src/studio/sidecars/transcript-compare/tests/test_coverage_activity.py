"""The recording check's activity file (`core/coverage_activity.py`): what the dialog's activity panel reads.

The counts are of work the sidecar really did or queued: units (items, or chunks of a chunked item), the transcriptions running at once
against the planned workers, and the larger model's passages queued and done. Fakes stand in for both models."""

import json
from pathlib import Path

import test_coverage_chunks as chunk_tests
import test_coverage_pipeline as piped
from test_coverage_mode import _args, compare, mode

progress = piped.progress  # the fixtures of the pipeline tests, by name
cpus = piped.cpus
activity = piped.importlib.import_module("coverage_activity")


def _read(args):
    return json.loads(open(activity.path_for(args.progress), encoding="utf-8").read())


def test_the_file_sits_beside_the_progress_file():
    assert activity.path_for("/run/progress.txt") == "/run/progress.txt.activity.json"
    assert activity.path_for(None) is None


def test_busy_is_what_is_running_and_never_more_than_the_workers(tmp_path):
    log = activity.ActivityLog(tmp_path / "a.json", model="small", workers=2, units=5, items=5)
    for key in range(4):
        log.working(key)
    assert log.snapshot()["firstPass"]["busy"] == 2
    log.working(0, 0)
    log.working(1, 0)
    assert log.snapshot()["firstPass"]["busy"] == 2
    log.working(2, 0)
    assert log.snapshot()["firstPass"]["busy"] == 1


def test_there_are_never_more_workers_than_units(tmp_path):
    log = activity.ActivityLog(tmp_path / "a.json", model="small", workers=1, units=1, items=1)
    log.set_workers(4)
    assert log.snapshot()["firstPass"]["workers"] == 1


def test_units_done_never_pass_a_total_that_is_final(tmp_path):
    log = activity.ActivityLog(tmp_path / "a.json", model="small", workers=1, units=2, items=2)
    log.unit_done(5)
    assert log.snapshot()["firstPass"]["done"] == 2


def test_the_recheck_total_grows_until_the_first_pass_ends_and_widespread_doubt_wins(tmp_path):
    log = activity.ActivityLog(tmp_path / "a.json", model="tiny", workers=2, units=3, items=3)
    log.expect_recheck("large-v3-turbo", 1)
    log.recheck_queued(2, activity.REASON_LOW_CONFIDENCE)
    assert log.snapshot()["recheck"]["final"] is False
    log.recheck_queued(1, activity.REASON_WIDESPREAD)
    log.recheck_queued(1, activity.REASON_LOW_CONFIDENCE)
    log.first_pass_ended()
    recheck = log.snapshot()["recheck"]
    assert (recheck["total"], recheck["final"], recheck["reason"], recheck["model"]) == (4, True, "widespread", "large-v3-turbo")


def test_a_write_that_fails_does_not_fail_the_run(tmp_path):
    log = activity.ActivityLog(tmp_path / "missing" / "a.json", model="small", workers=1, units=1)
    log.unit_done()
    log.flush()


def test_the_file_is_written_whole_with_the_schema_version(tmp_path):
    path = tmp_path / "a.json"
    log = activity.ActivityLog(path, model="small", workers=3, units=7, items=2)
    log.flush()
    body = json.loads(path.read_text(encoding="utf-8"))
    assert body["schemaVersion"] == activity.SCHEMA_VERSION
    assert body["firstPass"] == {"model": "small", "workers": 3, "busy": 0, "total": 7, "done": 0, "final": True}
    assert "recheck" not in body


# --- a run -----------------------------------------------------------------------------------------------------------------------------


def test_a_plain_run_counts_its_items_and_has_no_recheck(tmp_path, progress):
    manuscript, manifest, truth = piped._corpus(tmp_path)
    args = _args(tmp_path, manuscript, manifest, model="tiny")
    mode.run(args, compare, transcriber=piped._first_pass(truth))
    body = _read(args)
    assert body["firstPass"]["total"] == body["firstPass"]["done"] == 3
    assert body["firstPass"]["busy"] == 0 and body["items"] == {"total": 3, "done": 3}
    assert "recheck" not in body


def test_a_cascade_run_counts_the_passages_it_handed_to_the_larger_model(tmp_path, progress, cpus):
    manuscript, manifest, truth = piped._corpus(tmp_path)
    args = piped._cascade_args(tmp_path, manuscript, manifest)
    mode.run(args, compare, transcriber=piped._first_pass(truth), recheck_transcriber=piped._recheck(truth))
    recheck = _read(args)["recheck"]
    assert recheck["model"] == "large-v3-turbo" and recheck["final"] is True
    assert recheck["total"] == recheck["done"] == 1 and recheck["reason"] == "low_confidence" and recheck["busy"] == 0


def test_a_cascade_run_with_nothing_in_doubt_re_checks_nothing(tmp_path, progress, cpus):
    manuscript, manifest, truth = piped._corpus(tmp_path)
    args = piped._cascade_args(tmp_path, manuscript, manifest)

    def sure(item, on_seconds):
        on_seconds(item.length)
        spoken = truth[item.index]
        return mode.ItemWords(tuple(spoken), item.start_offset, item.end, "tiny", "en", None, scores=tuple(0.99 for _ in spoken))

    mode.run(args, compare, transcriber=sure, recheck_transcriber=piped._recheck(truth))
    recheck = _read(args)["recheck"]
    assert (recheck["total"], recheck["done"], recheck["final"], recheck["reason"]) == (0, 0, True, None)


def test_items_with_words_already_cached_are_not_counted(tmp_path, progress):
    manuscript, manifest, truth = piped._corpus(tmp_path)
    args = _args(tmp_path, manuscript, manifest, model="tiny")
    mode.run(args, compare, transcriber=piped._first_pass(truth))
    mode.run(args, compare, transcriber=piped._first_pass(truth))
    assert _read(args)["firstPass"]["total"] == 0


def test_workers_busy_reach_the_workers_planned_when_items_run_side_by_side(tmp_path, progress, monkeypatch):
    manuscript, manifest, truth = piped._corpus(tmp_path)
    args = _args(tmp_path, manuscript, manifest, model="tiny", parallel_workers=2)
    busiest = []
    real = activity.ActivityLog.working

    def spy(self, key, slots=1, *, recheck=False):
        real(self, key, slots, recheck=recheck)
        busiest.append(self.snapshot()["firstPass"]["busy"])

    monkeypatch.setattr(activity.ActivityLog, "working", spy)
    mode.run(args, compare, transcriber=piped._first_pass(truth))
    assert max(busiest) <= 2
    assert _read(args)["firstPass"]["workers"] == 2


# --- chunks ----------------------------------------------------------------------------------------------------------------------------


def test_each_chunk_of_a_long_item_counts_once_and_the_first_runs_alone(tmp_path):
    planned = len(chunk_tests.chunks.plan_chunks(100.0, 30.0, 4.0))
    log = activity.ActivityLog(tmp_path / "a.json", model="small", workers=2, units=planned, items=1)
    slots = []
    real = log.working

    def spy(key, count=1, *, recheck=False):
        real(key, count, recheck=recheck)
        slots.append(count)

    log.working = spy
    chunk_tests._transcriber(activity=log, workers=2)(chunk_tests._item(length=100.0), lambda seconds: None)
    assert planned > 2 and log.snapshot()["firstPass"]["done"] == planned
    assert max(slots) == 2 and slots[-1] == 0


def test_a_short_item_in_a_chunked_run_is_one_unit(tmp_path):
    args = _args(tmp_path, None, None, chunk_seconds=300)
    assert mode.units_of(_item_of(60.0), args) == 1
    assert mode.units_of(_item_of(1000.0), args) > 1


def _item_of(length):
    return mode.ManifestItem(0, "{G}", "a.wav", 0.0, length, "item-0.json", False)


def test_the_file_is_the_one_the_host_reads(tmp_path):
    """tests/fixtures/coverage_activity.json is also read by the host's test (internal/coverage/activity_test.go), so the two cannot drift."""
    log = activity.ActivityLog(tmp_path / "a.json", model="small", workers=4, units=112, items=6)
    log.expect_recheck("large-v3-turbo", 1)
    log.recheck_queued(7, activity.REASON_LOW_CONFIDENCE)
    for key in range(3):
        log.working(key)
    log.working("r", recheck=True)
    log.unit_done(40)
    log.unit_done(3, recheck=True)
    log.item_done()
    log.item_done()
    expected = json.loads((Path(__file__).parent / "fixtures" / "coverage_activity.json").read_text(encoding="utf-8"))
    assert log.snapshot() == expected
