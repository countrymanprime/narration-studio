"""The tail-audio decode (locate.py): the audio cut, the decode of only the tail, and the `--locate` CLI the host drives.
Placing the heard words in the chapter is the host's (src/studio/desktop/internal/scripttrack, locate_test.go)."""

import importlib.util
import json
import sys
import wave
from pathlib import Path

import numpy as np
import pytest

CORE = Path(__file__).resolve().parents[1] / "core"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, CORE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


locate = _load("locate")
live_asr = _load("live_asr")

OPENING = "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do."
MIDDLE = (
    "Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, "
    "and what is the use of a book, thought Alice, without pictures or conversations?"
)
CLOSING = (
    "So she was considering in her own mind, as well as she could, for the hot day made her feel very sleepy and stupid, "
    "whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies."
)
TOKENS = f"{OPENING} {MIDDLE} {CLOSING}".split()


def _write_steps_wav(path: Path, seconds: int, rate: int = 8000) -> None:
    """A mono 16-bit WAV whose second n holds a constant level of n/10, so a cut can be checked by its level."""
    levels = np.concatenate([np.full(rate, n / 10.0) for n in range(seconds)])
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes((levels * 32767).astype("<i2").tobytes())


def test_read_audio_range_cuts_exactly_the_requested_seconds(tmp_path):
    path = tmp_path / "take.wav"
    _write_steps_wav(path, 8)

    audio = locate.read_audio_range(str(path), 3.0, 6.0)

    assert len(audio) == pytest.approx(3 * locate.SAMPLE_RATE, abs=locate.SAMPLE_RATE // 50)
    assert np.median(audio[: locate.SAMPLE_RATE // 2]) == pytest.approx(0.3, abs=0.01)
    assert np.median(audio[-locate.SAMPLE_RATE // 2 :]) == pytest.approx(0.5, abs=0.01)


def test_read_audio_range_past_the_end_of_the_file_returns_what_there_is(tmp_path):
    path = tmp_path / "take.wav"
    _write_steps_wav(path, 4)

    audio = locate.read_audio_range(str(path), 3.0, 10.0)

    assert len(audio) == pytest.approx(locate.SAMPLE_RATE, abs=locate.SAMPLE_RATE // 50)


def test_the_decode_reads_only_the_tail_and_returns_the_words_it_heard(tmp_path):
    path = tmp_path / "take.wav"
    _write_steps_wav(path, 6)
    seen = []
    heard = [(word, 0.0, 0.1) for word in TOKENS[20:50]]

    def decode(audio):
        seen.append(len(audio))
        return heard

    words = locate.decode_range(str(path), 2.0, 5.0, decode)

    assert seen == [pytest.approx(3 * locate.SAMPLE_RATE, abs=locate.SAMPLE_RATE // 50)]
    assert words == heard


def test_an_empty_range_hears_nothing_without_decoding(tmp_path):
    path = tmp_path / "take.wav"
    _write_steps_wav(path, 2)

    words = locate.decode_range(str(path), 5.0, 6.0, lambda audio: pytest.fail("decoded an empty range"))

    assert words == []


# --- the CLI the host drives (src/studio/desktop/internal/teleprompter/locate.go builds these arguments) ---

HOST_ARGS = [
    "--locate",
    "--engine",
    "whisper",
    "--model",
    "tiny",
    "--model-dir",
    "d",
    "--manuscript",
    "m.json",
    "--chapter",
    "c1",
    "--wav",
    "take.wav",
    "--tail-start",
    "812.5",
    "--tail-end",
    "842.5",
    "--language",
    "en",
]


def test_the_cli_accepts_exactly_the_flags_the_host_passes_for_a_locate():
    ap = live_asr.build_parser()
    args = ap.parse_args(HOST_ARGS)

    locate.check_args(ap, args)

    assert (args.locate, args.wav, args.tail_start, args.tail_end, args.model_dir, args.chapter) == (True, "take.wav", 812.5, 842.5, "d", "c1")


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"model_dir": None}, "--model-dir"),
        ({"wav": None}, "--wav"),
        ({"mic": "Mic"}, "microphone"),
        ({"engine": "moonshine"}, "whisper engine only"),
        ({"manuscript": None, "chapter": None}, "--manuscript"),
        ({"tail_start": None}, "--tail-start and --tail-end"),
        ({"tail_start": -1.0}, "0 <= start < end"),
        ({"tail_end": 812.5}, "0 <= start < end"),
        ({"tail_end": float("inf")}, "0 <= start < end"),
        ({"tail_start": float("nan")}, "0 <= start < end"),
        ({"tail_start": 0.0, "tail_end": 121.0}, "at most 120 seconds"),
    ],
)
def test_the_cli_refuses_a_locate_the_host_could_not_have_asked_for(change, message, capsys):
    ap = live_asr.build_parser()
    args = ap.parse_args(HOST_ARGS)
    for key, value in change.items():
        setattr(args, key, value)

    with pytest.raises(SystemExit) as refused:
        locate.check_args(ap, args)

    assert refused.value.code == 2
    assert message in capsys.readouterr().err


@pytest.mark.parametrize("option", ["--tail-start", "--tail-end"])
@pytest.mark.parametrize("hostile", ["--stop-file", "--wav", "--nonsense", "-x"])
def test_a_tail_value_that_looks_like_an_option_is_refused(option, hostile, capsys):
    with pytest.raises(SystemExit) as refused:
        live_asr.build_parser().parse_args([option, hostile, "value"])

    assert refused.value.code == 2


def _manuscript(tmp_path):
    data = {
        "schemaVersion": 1,
        "documentId": "alice",
        "chapters": [{"id": "c1", "title": "Chapter One", "contentKind": "narration"}],
        "paragraphs": [
            {"id": "p1", "chapterId": "c1", "index": 0, "text": f"{OPENING} {MIDDLE}"},
            {"id": "p2", "chapterId": "c1", "index": 1, "text": CLOSING},
        ],
    }
    path = tmp_path / "manuscript.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def _main(monkeypatch, argv, decoder):
    monkeypatch.setattr(sys, "argv", ["live_asr.py", *argv])
    monkeypatch.setattr(live_asr, "_load_whisper_decoder", decoder)
    live_asr.main()


def test_locate_mode_prints_one_heard_line_for_a_manuscript_chapter(tmp_path, monkeypatch, capsys):
    wav = tmp_path / "take.wav"
    _write_steps_wav(wav, 4)
    chapter_tokens = ["Chapter", "One", *TOKENS]
    loaded = []

    def decoder(args, vad_filter=False):
        loaded.append(vad_filter)
        return lambda audio: [(word, 0.0, 0.1) for word in chapter_tokens[22:52]]

    argv = ["--locate", "--model-dir", "d", "--manuscript", str(_manuscript(tmp_path)), "--chapter", "c1", "--wav", str(wav)]
    _main(monkeypatch, [*argv, "--tail-start", "1", "--tail-end", "3"], decoder)

    lines = capsys.readouterr().out.strip().splitlines()
    assert len(lines) == 1
    event = json.loads(lines[0])
    assert event["type"] == "heard"
    assert [word for word, _start, _end in event["words"]] == chapter_tokens[22:52]
    assert loaded == [True]


def test_locate_mode_refuses_an_unknown_chapter_before_loading_the_model(tmp_path, monkeypatch, capsys):
    argv = ["--locate", "--model-dir", "d", "--manuscript", str(_manuscript(tmp_path)), "--chapter", "nope", "--wav", "take.wav"]

    with pytest.raises(SystemExit) as refused:
        _main(monkeypatch, [*argv, "--tail-start", "1", "--tail-end", "3"], lambda args, vad_filter=False: pytest.fail("loaded the model"))

    assert refused.value.code == 2
    assert "Chapter One" in capsys.readouterr().err


def test_locate_mode_reads_a_plain_script_too(tmp_path, monkeypatch, capsys):
    wav = tmp_path / "take.wav"
    _write_steps_wav(wav, 4)
    script = tmp_path / "script.txt"
    script.write_text(" ".join(TOKENS), encoding="utf-8")

    decoder = lambda args, vad_filter=False: lambda audio: [(word, 0.0, 0.1) for word in TOKENS[20:50]]
    _main(monkeypatch, ["--locate", "--model-dir", "d", "--script", str(script), "--wav", str(wav), "--tail-start", "0", "--tail-end", "2"], decoder)

    event = json.loads(capsys.readouterr().out)
    assert event["type"] == "heard"
    assert [word for word, _start, _end in event["words"]] == TOKENS[20:50]


def test_locate_mode_prints_the_decoded_words_for_the_host_to_place(tmp_path, monkeypatch, capsys):
    wav = tmp_path / "take.wav"
    _write_steps_wav(wav, 4)
    decoder = lambda args, vad_filter=False: lambda audio: [("the", 0.0, 0.25), ("rabbit", 0.31, 0.6)]
    argv = ["--locate", "--model-dir", "d", "--manuscript", str(_manuscript(tmp_path)), "--chapter", "c1", "--wav", str(wav)]
    _main(monkeypatch, [*argv, "--tail-start", "1", "--tail-end", "3"], decoder)

    assert json.loads(capsys.readouterr().out) == {"type": "heard", "words": [["the", 0.0, 0.25], ["rabbit", 0.31, 0.6]]}
