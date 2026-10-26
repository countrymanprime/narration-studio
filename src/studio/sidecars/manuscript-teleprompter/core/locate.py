"""
Tail-audio decode for the Manuscript Teleprompter's "Resume from here": the last seconds of a chapter's recorded audio,
as the words heard in them.

The host (src/studio/desktop/internal/teleprompter, `Service.Locate`) finds where the chapter's recorded audio ends
(`tracks.RecordedEnd`) and runs this sidecar once, through `live_asr.py --locate`:

    python live_asr.py --locate --wav take.wav --tail-start 812.4 --tail-end 842.4 \\
        --manuscript manuscript.json --chapter c1 --model tiny --model-dir DIR

The chapter is checked before the model loads, so a wrong chapter fails fast. The range is cut out of the source file
and transcribed with faster-whisper (the same decoder the live engine uses, `live_asr.make_decoder`, with Silero VAD on
because a recording's tail usually ends in room tone), and one `heard` line is printed:

    {"type": "heard", "words": [["Alice", 0.42, 0.71], ...]}

each word with its start and end in seconds into the range. The host places them in the chapter
(src/studio/desktop/internal/scripttrack, `LocateEvent`). There is no model download: `--model-dir` is required, the
host passes the verified directory from the Whisper asset catalog.
"""

import sys
from pathlib import Path

import numpy as np

_CORE_DIR = Path(__file__).resolve().parent
if str(_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(_CORE_DIR))

_SHARED_PYTHON = Path(__file__).resolve().parents[5] / "src" / "studio" / "libs" / "python"
if str(_SHARED_PYTHON) not in sys.path:
    sys.path.insert(0, str(_SHARED_PYTHON))

SAMPLE_RATE = 16000

# The host asks for DEFAULT_TAIL_SECONDS (src/studio/desktop/internal/teleprompter/locate.go); anything longer than
# MAX_TAIL_SECONDS is refused, which bounds the decode time and the memory one run can take.
MAX_TAIL_SECONDS = 120.0


def read_audio_range(path: str, start: float, end: float) -> np.ndarray:
    """Seconds `start` to `end` of an audio file as 16 kHz mono float32 (PyAV, the same resample `live_asr` uses).
    It seeks to the nearest point at or before `start` and trims, so only the tail is decoded, not the whole take."""
    import av

    with av.open(path) as container:
        stream = container.streams.audio[0]
        if start > 0 and stream.time_base:
            container.seek(int(start / stream.time_base), stream=stream, backward=True, any_frame=False)
        resampler = av.AudioResampler(format="fltp", layout="mono", rate=SAMPLE_RATE)
        pieces: list[np.ndarray] = []
        origin = None
        for frame in container.decode(stream):
            if origin is None:
                origin = float(frame.time or 0.0)
            if frame.time is not None and frame.time >= end:
                break
            pieces.extend(resampled.to_ndarray()[0].astype(np.float32) for resampled in resampler.resample(frame))
        pieces.extend(resampled.to_ndarray()[0].astype(np.float32) for resampled in resampler.resample(None))
    audio = np.concatenate(pieces) if pieces else np.zeros(0, dtype=np.float32)
    origin = origin or 0.0
    first = max(0, round((start - origin) * SAMPLE_RATE))
    last = max(first, round((end - origin) * SAMPLE_RATE))
    return audio[first:last]


def check_args(ap, args, mode: str = "--locate") -> None:
    """Refuse a locate run the host could never have asked for (argparse exits with status 2). `mode` names the flag in
    the messages: the punch word-time alignment (align_word.py, `--align-word`) reads a recording the same way."""
    if args.mic:
        ap.error(f"{mode} reads a recording (--wav), not a microphone")
    if not args.wav:
        ap.error(f"{mode} needs --wav")
    if args.engine != "whisper":
        ap.error(f"{mode} runs the whisper engine only")
    if not args.model_dir:
        ap.error(f"{mode} needs --model-dir: it never downloads a model")
    if not (args.manuscript or args.script):
        ap.error(f"{mode} needs --manuscript and --chapter, or --script")
    if args.tail_start is None or args.tail_end is None:
        ap.error(f"{mode} needs --tail-start and --tail-end")
    if not (np.isfinite(args.tail_start) and np.isfinite(args.tail_end)) or args.tail_start < 0 or args.tail_end <= args.tail_start:
        ap.error("--tail-start and --tail-end must be seconds with 0 <= start < end")
    if args.tail_end - args.tail_start > MAX_TAIL_SECONDS:
        ap.error(f"{mode} reads at most {MAX_TAIL_SECONDS:g} seconds of audio")


def check_script(args) -> None:
    """Read --manuscript/--chapter (chapter_script, which raises ChapterError for an unknown chapter) or --script, as for
    a live session, so a run the host could not place fails before the model loads."""
    if args.manuscript:
        from chapter_script import load_chapter_script

        load_chapter_script(args.manuscript, args.chapter)
    else:
        Path(args.script).read_text(encoding="utf-8")


def decode_range(wav: str, start: float, end: float, decode) -> list:
    """Cut seconds `start` to `end` out of `wav` and decode them with `decode` (audio -> [(word, start, end)]); nothing is
    decoded for an empty cut."""
    audio = read_audio_range(wav, start, end)
    return list(decode(audio)) if len(audio) else []
