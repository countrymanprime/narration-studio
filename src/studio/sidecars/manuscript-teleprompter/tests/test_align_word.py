"""Punch and roll's offline stretch decode (align_word.py): the cut and decode of a stretch of recording, the
`--align-word` CLI the host drives, and the real decode on real narration (the LibriVox Alice readings). Timing the
word from what was heard is the host's (src/studio/desktop/internal/scripttrack, wordtime_test.go)."""

import importlib.util
import json
import os
import re
import sys
import wave
from pathlib import Path

import numpy as np
import pytest

CORE = Path(__file__).resolve().parents[1] / "core"
REPO = Path(__file__).resolve().parents[5]


def _load(name):
    spec = importlib.util.spec_from_file_location(name, CORE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


align_word = _load("align_word")
locate = _load("locate")
live_asr = _load("live_asr")

TEXT = (
    "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do. "
    "Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, "
    "and what is the use of a book, thought Alice, without pictures or conversations?"
)
TOKENS = TEXT.split()
WORD_SECONDS = 0.4


def _timed(start, end, tokens=TOKENS, origin=0.0):
    """What Whisper gives for a narrator reading tokens[start:end] at an even pace from `origin` seconds: each word
    lasts 0.3 s, then 0.1 s to the next."""
    return [(tokens[i], origin + (i - start) * WORD_SECONDS, origin + (i - start) * WORD_SECONDS + 0.3) for i in range(start, end)]


def _write_steps_wav(path, seconds, rate=16000):
    """A WAV whose level steps up by 0.1 every second, so a cut can be checked by its level."""
    levels = np.concatenate([np.full(rate, 0.1 * (second % 9), dtype=np.float32) for second in range(seconds)])
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes((levels * 32767).astype("<i2").tobytes())


def test_the_decode_reads_only_the_range(tmp_path):
    path = tmp_path / "take.wav"
    _write_steps_wav(path, 6)
    seen = []
    heard = _timed(10, 40, origin=0.25)

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


# --- the CLI the host drives (src/studio/desktop/internal/teleprompter/alignword.go builds these arguments) ---

HOST_ARGS = [
    "--align-word",
    "812",
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
    "700.5",
    "--tail-end",
    "820.5",
    "--language",
    "en",
]


def test_the_cli_accepts_exactly_the_flags_the_host_passes_for_an_alignment():
    ap = live_asr.build_parser()
    args = ap.parse_args(HOST_ARGS)

    align_word.check_args(ap, args)

    assert (args.align_word, args.locate, args.wav, args.tail_start, args.tail_end, args.model_dir) == (812, False, "take.wav", 700.5, 820.5, "d")


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"align_word": -1}, "0 or more"),
        ({"locate": True}, "separate runs"),
        ({"model_dir": None}, "--align-word needs --model-dir"),
        ({"wav": None}, "--align-word needs --wav"),
        ({"mic": "Mic"}, "microphone"),
        ({"engine": "moonshine"}, "whisper engine only"),
        ({"manuscript": None, "chapter": None}, "--manuscript"),
        ({"tail_end": None}, "--tail-start and --tail-end"),
        ({"tail_start": float("nan")}, "0 <= start < end"),
        ({"tail_start": 0.0, "tail_end": 121.0}, "at most 120 seconds"),
    ],
)
def test_the_cli_refuses_an_alignment_the_host_could_not_have_asked_for(change, message, capsys):
    ap = live_asr.build_parser()
    args = ap.parse_args(HOST_ARGS)
    for key, value in change.items():
        setattr(args, key, value)

    with pytest.raises(SystemExit) as refused:
        align_word.check_args(ap, args)

    assert refused.value.code == 2
    assert message in capsys.readouterr().err


@pytest.mark.parametrize("hostile", ["--stop-file", "--wav", "-x", "12.5", "twelve"])
def test_a_word_value_that_is_not_a_whole_number_is_refused(hostile, capsys):
    with pytest.raises(SystemExit) as refused:
        live_asr.build_parser().parse_args(["--align-word", hostile])

    assert refused.value.code == 2


def _manuscript(tmp_path):
    data = {
        "schemaVersion": 1,
        "documentId": "alice",
        "chapters": [{"id": "c1", "title": "Chapter One", "contentKind": "narration"}],
        "paragraphs": [{"id": "p1", "chapterId": "c1", "index": 0, "text": TEXT}],
    }
    path = tmp_path / "manuscript.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def _main(monkeypatch, argv, decoder):
    monkeypatch.setattr(sys, "argv", ["live_asr.py", *argv])
    monkeypatch.setattr(live_asr, "_load_whisper_decoder", decoder)
    live_asr.main()


def test_align_word_mode_prints_one_heard_line_for_a_manuscript_chapter(tmp_path, monkeypatch, capsys):
    wav = tmp_path / "take.wav"
    _write_steps_wav(wav, 4)
    chapter_tokens = ["Chapter", "One", *TOKENS]
    loaded = []

    def decoder(args, vad_filter=False):
        loaded.append(vad_filter)
        return lambda audio: _timed(12, 42, tokens=chapter_tokens)

    argv = ["--align-word", "27", "--model-dir", "d", "--manuscript", str(_manuscript(tmp_path)), "--chapter", "c1", "--wav", str(wav)]
    _main(monkeypatch, [*argv, "--tail-start", "1", "--tail-end", "3"], decoder)

    lines = capsys.readouterr().out.strip().splitlines()
    assert len(lines) == 1
    event = json.loads(lines[0])
    assert event["type"] == "heard"
    assert [word for word, _start, _end in event["words"]] == chapter_tokens[12:42]
    assert loaded == [True]


def test_align_word_mode_refuses_an_unknown_chapter_before_loading_the_model(tmp_path, monkeypatch, capsys):
    argv = ["--align-word", "3", "--model-dir", "d", "--manuscript", str(_manuscript(tmp_path)), "--chapter", "nope", "--wav", "take.wav"]

    with pytest.raises(SystemExit) as refused:
        _main(monkeypatch, [*argv, "--tail-start", "1", "--tail-end", "3"], lambda args, vad_filter=False: pytest.fail("loaded the model"))

    assert refused.value.code == 2
    assert "Chapter One" in capsys.readouterr().err


# --- real narration: the LibriVox Alice readings (tests/fixtures/audio/librivox-alice) ---

LIBRIVOX = REPO / "tests" / "fixtures" / "audio" / "librivox-alice"
# A window as long as the host ever asks for (teleprompter.MaxTailSeconds), well inside Chapter I's reading.
WINDOW = (200.0, 320.0)


def _librivox():
    sys.path.insert(0, str(LIBRIVOX))
    import alice_text
    import sources

    return alice_text, sources


def _reference_words(source_id, window=WINDOW):
    """large-v3-turbo's committed word timings (alignment/<id>.words.json) inside `window`, relative to its start."""
    words = json.loads((LIBRIVOX / "alignment" / f"{source_id}.words.json").read_text(encoding="utf-8"))["words"]
    return [(text, start - window[0], end - window[0]) for text, start, end in words if window[0] <= start and end <= window[1]]


def _plain(word):
    return re.sub(r"[^\w']", "", word.lower())


def _whisper_model_dir():
    return os.environ.get("NARRATION_WHISPER_MODEL_DIR", "")


def _recording_fetched():
    _, sources = _librivox()
    source = sources.load_sources()["kara_01"]
    return sources.present(source, sources.sources_dir())


@pytest.mark.skipif(
    not (_whisper_model_dir() and _recording_fetched()),
    reason="needs the LibriVox recordings (build.py fetch) and NARRATION_WHISPER_MODEL_DIR (a faster-whisper model directory)",
)
def test_the_real_decode_times_words_where_the_reference_heard_them(tmp_path, monkeypatch, capsys):
    """The whole mode on real audio: `--align-word 0` with the shipped decoder (the tiny model in
    NARRATION_WHISPER_MODEL_DIR) over 200-320 s of Kara Shallenberg's Chapter I prints one `heard` line whose words
    lie in the window and are mostly the words large-v3-turbo's committed timings heard there. When NARRATION_REAL_DECODE_HEARD
    names a file, the line is written there for the host's timing of it against those timings
    (TestTheRealDecodeTimesWordsWhereTheReferenceHeardThem, src/studio/desktop/internal/scripttrack/wordtime_test.go)."""
    alice_text, sources = _librivox()
    recording = sources.sources_dir() / sources.load_sources()["kara_01"]["file"]
    manuscript = tmp_path / "manuscript.json"
    manuscript.write_text(json.dumps(alice_text.manuscript_json(list(alice_text.load_chapters().values()), "alice")), encoding="utf-8")
    argv = ["--align-word", "0", "--model", "tiny", "--model-dir", _whisper_model_dir(), "--language", "en"]
    argv += ["--manuscript", str(manuscript), "--chapter", "c-0001", "--wav", str(recording)]
    monkeypatch.setattr(sys, "argv", ["live_asr.py", *argv, "--tail-start", f"{WINDOW[0]:g}", "--tail-end", f"{WINDOW[1]:g}"])

    live_asr.main()

    (line,) = capsys.readouterr().out.strip().splitlines()
    event = json.loads(line)
    words = event["words"]
    reference = {_plain(text) for text, _start, _end in _reference_words("kara_01")}
    assert event["type"] == "heard"
    assert words, "the decode heard words in the window"
    assert all(0.0 <= start <= end <= WINDOW[1] - WINDOW[0] for _text, start, end in words)
    assert sum(_plain(text) in reference for text, _start, _end in words) >= 0.8 * len(words)
    if out := os.environ.get("NARRATION_REAL_DECODE_HEARD"):
        Path(out).write_text(line + "\n", encoding="utf-8")


def test_align_word_mode_prints_the_stretchs_decoded_words_in_its_own_seconds(tmp_path, monkeypatch, capsys):
    wav = tmp_path / "take.wav"
    _write_steps_wav(wav, 4)
    decoder = lambda args, vad_filter=False: lambda audio: [("alice", 0.5, 0.9)]
    argv = ["--align-word", "3", "--model-dir", "d", "--manuscript", str(_manuscript(tmp_path)), "--chapter", "c1", "--wav", str(wav)]
    _main(monkeypatch, [*argv, "--tail-start", "1", "--tail-end", "3"], decoder)

    assert json.loads(capsys.readouterr().out) == {"type": "heard", "words": [["alice", 0.5, 0.9]]}
