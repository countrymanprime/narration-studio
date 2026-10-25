"""compare.py's process side, run in this process so it is measured: chunked transcription and its reassembly, a
worker's progress file, the exit contract (0 done, 1 failed, 2 cancelled) and the command line's own checks. Decoding
and ASR are faked; the worker processes run in this one."""

import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import ClassVar

import numpy as np
import pytest

COMPARE_PATH = Path(__file__).resolve().parents[1] / "core" / "compare.py"
SPEC = importlib.util.spec_from_file_location("transcript_compare_process", COMPARE_PATH)
compare = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(compare)


class Exited(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


@pytest.fixture
def exits(monkeypatch):
    """os._exit raises instead of ending the test process."""

    def fake_exit(code):
        raise Exited(code)

    monkeypatch.setattr(compare.os, "_exit", fake_exit)


class InlineProcess:
    """multiprocessing.Process that runs its target here when started (the worker's os._exit is the fixture's raise)."""

    started: ClassVar[list] = []

    def __init__(self, target, args, daemon):
        self.target, self.args = target, args
        self.terminated = False

    def start(self):
        InlineProcess.started.append(self)
        try:
            self.target(*self.args)
        except Exited:
            pass

    def terminate(self):
        self.terminated = True


def heard(audio, *_args, return_info=False, **_kwargs):
    """Each second of audio is one word, "w<value>", where value is the first sample of that second; times are local."""
    words = [(f"w{int(audio[k * compare.SAMPLE_RATE])}", float(k), k + 0.5) for k in range(len(audio) // compare.SAMPLE_RATE)]
    return (words, SimpleNamespace(language="en")) if return_info else words


def seconds_audio(n):
    """n seconds of audio whose every second holds its own index, so the words heard name the second they were in."""
    return np.repeat(np.arange(n, dtype=np.float32), compare.SAMPLE_RATE)


def test_chunks_are_transcribed_offset_and_each_second_is_heard_once(tmp_path, monkeypatch, exits):
    InlineProcess.started = []
    monkeypatch.setattr(compare, "transcribe", heard)
    monkeypatch.setattr(compare.multiprocessing, "Process", InlineProcess)
    monkeypatch.setattr(compare.time, "sleep", lambda _s: None)
    monkeypatch.setattr(compare, "CHUNK_OVERLAP_SECONDS", 2.0)
    progress = tmp_path / "progress.txt"
    work = tmp_path / "chunks"

    words = compare.transcribe_chunked(seconds_audio(10), "small", None, "cpu", str(progress), None, 4, 0, str(work))

    # Chunks of 4 s start at 0, 4 and 8; each later one starts 2 s early and each one runs 2 s late, so neighbours
    # share 4 s and the cuts are at 4 and 8 s. Every second is heard by one chunk only.
    assert [w[0] for w in words] == [f"w{k}" for k in range(10)]
    assert [w[1] for w in words] == [float(k) for k in range(10)]
    assert len(InlineProcess.started) == 2  # chunk 0 here, chunks 1 and 2 as workers
    assert InlineProcess.started[0].args[2] == "en"  # the language chunk 0 detected
    assert not work.exists()
    assert progress.read_text(encoding="utf-8").startswith("TRANSCRIBE|90|")


def test_a_word_cut_at_a_chunks_edge_and_one_on_the_cut_are_each_heard_once(tmp_path, monkeypatch, exits):
    # Two chunks of an 8 s read: [0, 6) and [2, 8), cut at 4 s. The first hears "warm" cut off at its edge as "wa";
    # "because" straddles the cut, and "the" is said twice inside the shared span.
    first = [("the", 0.0, 0.3), ("cat", 0.4, 0.8), ("sat", 1.0, 1.4), ("on", 2.0, 2.2), ("the", 2.4, 2.6), ("mat", 3.0, 3.5),
             ("because", 3.8, 4.4), ("it", 4.6, 4.8), ("was", 5.0, 5.3), ("wa", 5.8, 6.0)]  # fmt: skip
    second = [("on", 0.0, 0.2), ("the", 0.4, 0.6), ("mat", 1.0, 1.5), ("because", 1.8, 2.4), ("it", 2.6, 2.8), ("was", 3.0, 3.3),
              ("warm", 3.8, 4.2), ("today", 4.5, 5.0)]  # fmt: skip
    calls = []

    def chunk_heard(audio, *_args, return_info=False, **_kwargs):
        calls.append(len(audio))
        words = first if len(calls) == 1 else second
        return (words, SimpleNamespace(language="en")) if return_info else words

    monkeypatch.setattr(compare, "transcribe", chunk_heard)
    monkeypatch.setattr(compare.multiprocessing, "Process", InlineProcess)
    monkeypatch.setattr(compare.time, "sleep", lambda _s: None)
    monkeypatch.setattr(compare, "CHUNK_OVERLAP_SECONDS", 2.0)

    words = compare.transcribe_chunked(seconds_audio(8), "small", "en", "cpu", None, None, 4, 0, str(tmp_path / "w"))

    assert calls == [6 * compare.SAMPLE_RATE, 6 * compare.SAMPLE_RATE]
    assert " ".join(w[0] for w in words) == "the cat sat on the mat because it was warm today"
    assert words[6] == ("because", 3.8, 4.4)  # from the second chunk, offset by its 2 s start
    assert words[-1] == ("today", 6.5, 7.0)


def test_cuda_and_the_model_cap_the_workers(tmp_path, monkeypatch, exits):
    monkeypatch.setattr(compare, "transcribe", heard)
    monkeypatch.setattr(compare.multiprocessing, "Process", InlineProcess)
    monkeypatch.setattr(compare.time, "sleep", lambda _s: None)
    logged = []
    monkeypatch.setattr(compare, "log", logged.append)

    compare.transcribe_chunked(seconds_audio(6), "large-v3", "en", "cpu", None, None, 2, 8, str(tmp_path / "a"))
    compare.transcribe_chunked(seconds_audio(6), "tiny", "en", "cuda", None, None, 2, 0, str(tmp_path / "b"))

    assert sum("Using up to 1 parallel worker" in line for line in logged) == 2


def test_a_cancel_stops_the_workers(tmp_path, monkeypatch):
    progress = tmp_path / "progress.txt"
    monkeypatch.setattr(compare, "transcribe", heard)
    started = []

    class Stuck(InlineProcess):
        def start(self):  # never writes its words, so it is still running when the cancel arrives
            started.append(self)
            Path(str(progress) + ".cancel").write_text("cancel", encoding="utf-8")

    monkeypatch.setattr(compare.multiprocessing, "Process", Stuck)
    monkeypatch.setattr(compare.time, "sleep", lambda _s: None)

    with pytest.raises(compare.Cancelled):
        compare.transcribe_chunked(seconds_audio(6), "small", "en", "cpu", str(progress), None, 2, 1, str(tmp_path / "w"))
    assert started and started[0].terminated


def test_a_worker_writes_its_words_or_nothing_and_always_exits(tmp_path, monkeypatch, exits):
    monkeypatch.setattr(compare, "transcribe", heard)
    audio = tmp_path / "chunk.npy"
    np.save(audio, seconds_audio(2))
    out = tmp_path / "chunk.json"

    with pytest.raises(Exited) as done:
        compare._chunk_worker_entry(str(audio), "small", "en", "cpu", None, None, str(out))
    with pytest.raises(Exited) as failed:
        compare._chunk_worker_entry(str(tmp_path / "missing.npy"), "small", "en", "cpu", None, None, str(tmp_path / "none.json"))

    assert done.value.code == failed.value.code == 0
    assert json.loads(out.read_text(encoding="utf-8")) == [["w0", 0.0, 0.5], ["w1", 1.0, 1.5]]
    assert not (tmp_path / "none.json").exists()


@pytest.mark.parametrize(
    ("text", "want"),
    [(None, None), ("", None), ("\n\n", None), ("TRANSCRIBE", None), ("TRANSCRIBE|x|m", None), ("LOAD|15|a\nTRANSCRIBE|42.5|b\n\n", 42.5)],
)
def test_a_workers_progress_is_its_last_lines_percent(tmp_path, text, want):
    path = tmp_path / "p.txt"
    if text is not None:
        path.write_text(text, encoding="utf-8")

    assert compare._read_last_progress_pct(str(path)) == want


def test_the_exit_code_is_0_done_1_failed_2_cancelled(tmp_path, exits):
    progress = tmp_path / "progress.txt"
    args = SimpleNamespace(progress=str(progress), out=str(tmp_path / "o.txt"))

    def cancelled(_args):
        Path(str(progress) + ".cancel").write_text("cancel", encoding="utf-8")
        raise compare.Cancelled()

    def failed(_args):
        raise ValueError("Manifest contained no segments.")

    codes = []
    for mode in (lambda _args: None, cancelled, failed):
        with pytest.raises(Exited) as exited:
            compare._run_and_exit(args, mode)
        codes.append(exited.value.code)
        if mode is cancelled:
            assert progress.read_text(encoding="utf-8").startswith("CANCELLED|")
            assert not Path(str(progress) + ".cancel").exists()

    assert codes == [0, 2, 1]
    assert progress.read_text(encoding="utf-8").startswith("ERROR|0|Manifest contained no segments.")


def run_main(monkeypatch, *argv):
    monkeypatch.setattr(sys, "argv", ["compare.py", *argv])
    compare.main()


def test_the_command_line_refuses_a_run_without_its_files_and_recheck_without_coverage(monkeypatch, capsys):
    for argv, message in [
        (["--manuscript", "m.json"], "--manifest, --out required"),
        (["--manuscript", "m.json", "--recheck", "w.json"], "--recheck can only be used with --coverage"),
        (["--manuscript", "m.json", "--coverage", "--find-repeats"], "--find-repeats cannot be used with --coverage"),
    ]:
        with pytest.raises(SystemExit) as exited:
            run_main(monkeypatch, *argv)
        assert exited.value.code == 2
        assert message in capsys.readouterr().err


def test_the_command_line_runs_the_mode_it_names_and_logs_to_the_log_file(tmp_path, monkeypatch, exits, capsys):
    ran = []
    monkeypatch.setattr(compare, "run", lambda args: ran.append("run"))
    monkeypatch.setattr(compare, "find_repeated_spans", lambda args: ran.append("find_repeats"))
    log = tmp_path / "log.txt"
    files = ["--manuscript", "m.json", "--manifest", "m.txt", "--out", "o.txt", "--log", str(log)]

    for extra in ([], ["--find-repeats"]):
        with pytest.raises(Exited) as exited:
            run_main(monkeypatch, *files, *extra)
        assert exited.value.code == 0
    with pytest.raises(Exited):
        run_main(monkeypatch, "--manuscript", "m.json", "--capabilities")

    assert ran == ["run", "find_repeats"]
    assert log.exists()
    assert json.loads(capsys.readouterr().out)["type"] == "capabilities"
