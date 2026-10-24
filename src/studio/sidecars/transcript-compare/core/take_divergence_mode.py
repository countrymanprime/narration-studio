"""The sidecar's per-take divergence mode: `compare.py --take-divergence`.

Take review (`docs/utilities/take-review.md`). For one fixed manuscript span and the takes the host lists in a JSON manifest,
this mode transcribes each take's range with Whisper word timestamps and writes the words; the host aligns them to the span and
writes where each take diverges (`src/studio/desktop/internal/takedivergence`, which also checks the chapter and the span before
this mode is started).

Manifest (JSON, written by the host, a trust boundary: `docs/architecture/threat-model.md` row 4f):

    {"schemaVersion": 1, "chapterId": "<canonical chapter id>",
     "span": {"firstUnit": 0, "lastUnit": 2},
     "takes": [{"itemGuid": "...", "takeGuid": "...", "sourceFile": "<path>",
                "startOffset": <source seconds>, "length": <seconds>}, ...]}

Words report (`--out`, written atomically, so the file exists only when the run finished), tagged lines:

    TAKE_TRANSCRIPTION|{"language", "model"}
    TAKE_WORDS|{"index", "takeGuid", "words": [[text, start, end], ...]}   (one per take, manifest order)

Word times are seconds from the start of the take's range. Progress is `stage|pct|message` (START, TRANSCRIBE, WRITE, DONE).
Exit codes: 0 done; 1 failed (an `ERROR|0|<message>` progress line, no report); 2 cancelled through `<progress>.cancel`,
honoured between takes (a `CANCELLED` progress line, no report). `argparse` also exits 2 on a usage error, with no progress line.

This module does not import `compare.py`: `run` is handed the loaded module as `engine`.
"""

from __future__ import annotations

import contextlib
import json
import math
import os
import traceback
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType

MANIFEST_SCHEMA_VERSION = 1
TRANSCRIBE_START_PCT = 2
TRANSCRIBE_END_PCT = 94
WRITE_PCT = 98

EXIT_DONE = 0
EXIT_FAILED = 1
EXIT_CANCELLED = 2

_MANIFEST_KEYS = frozenset({"schemaVersion", "chapterId", "span", "takes"})
_UNIT_SPAN_KEYS = frozenset({"firstUnit", "lastUnit"})
_PARAGRAPH_SPAN_KEYS = frozenset({"firstParagraph", "lastParagraph"})
_TAKE_KEYS = frozenset({"itemGuid", "takeGuid", "sourceFile", "startOffset", "length"})


class ManifestError(ValueError):
    """The manifest is not the shape this mode reads; nothing has been transcribed or written."""


@dataclass(frozen=True)
class Take:
    """One take's range of its source file, in source seconds."""

    item_guid: str
    take_guid: str
    source_file: str
    start_offset: float
    length: float


@dataclass(frozen=True)
class Manifest:
    """The span is a run of sentence units (a take-review group's own numbering) or, for a passage the workspace
    chose in the text, a run of the chapter's paragraphs; exactly one of the two pairs is set."""

    chapter_id: str
    first_unit: int | None
    last_unit: int | None
    takes: tuple[Take, ...]
    first_paragraph: int | None = None
    last_paragraph: int | None = None


Word = tuple[str, float, float]
"""A transcript word: text, start and end in seconds from the start of the take's range."""

Transcriber = Callable[[Take], Sequence[Word]]
"""Transcribes one take's range: words timed in seconds from the start of that range."""


# ---------------------------------------------------------------------------
# the manifest


def _keys(raw: object, expected: frozenset[str], where: str) -> dict:
    if not isinstance(raw, dict):
        raise ManifestError(f"{where} is not an object")
    missing = sorted(expected - raw.keys())
    unknown = sorted(raw.keys() - expected)
    if missing or unknown:
        raise ManifestError(f"{where}: missing {missing}, unknown {unknown}")
    return raw


def _whole(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _seconds(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _take(raw: object, position: int) -> Take:
    where = f"manifest take {position}"
    raw = _keys(raw, _TAKE_KEYS, where)
    for key in ("itemGuid", "takeGuid", "sourceFile"):
        if not isinstance(raw[key], str) or not raw[key]:
            raise ManifestError(f"{where}: {key} must be a non-empty string")
    if not _seconds(raw["startOffset"]) or raw["startOffset"] < 0:
        raise ManifestError(f"{where}: startOffset must be a finite number of seconds, 0 or more")
    if not _seconds(raw["length"]) or raw["length"] <= 0:
        raise ManifestError(f"{where}: length must be a finite number of seconds above 0")
    return Take(raw["itemGuid"], raw["takeGuid"], raw["sourceFile"], float(raw["startOffset"]), float(raw["length"]))


def read_manifest(path: str | os.PathLike) -> Manifest:
    """The manifest, checked field by field; takes keep manifest order."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError, RecursionError) as exc:
        raise ManifestError(f"The take-divergence manifest could not be read: {exc}") from exc
    data = _keys(data, _MANIFEST_KEYS, "The take-divergence manifest")
    if data["schemaVersion"] != MANIFEST_SCHEMA_VERSION:
        raise ManifestError(f"The take-divergence manifest is not schema version {MANIFEST_SCHEMA_VERSION}")
    if not isinstance(data["chapterId"], str) or not data["chapterId"]:
        raise ManifestError("The manifest's chapterId must be a non-empty string")
    span = data["span"]
    if isinstance(span, dict) and span.keys() & _UNIT_SPAN_KEYS and span.keys() & _PARAGRAPH_SPAN_KEYS:
        raise ManifestError("The manifest's span names sentences or paragraphs, not both")
    by_paragraph = isinstance(span, dict) and bool(span.keys() & _PARAGRAPH_SPAN_KEYS)
    span = _keys(span, _PARAGRAPH_SPAN_KEYS if by_paragraph else _UNIT_SPAN_KEYS, "The manifest's span")
    first, last = (span["firstParagraph"], span["lastParagraph"]) if by_paragraph else (span["firstUnit"], span["lastUnit"])
    if not (_whole(first) and _whole(last)):
        raise ManifestError(f"The manifest's span must be two whole {'paragraph' if by_paragraph else 'sentence'} numbers")
    if first > last:
        raise ManifestError(f"The manifest's span must have {'firstParagraph <= lastParagraph' if by_paragraph else 'firstUnit <= lastUnit'}")
    if not isinstance(data["takes"], list) or not data["takes"]:
        raise ManifestError("The manifest's takes must be a non-empty list")
    takes = tuple(_take(raw, position) for position, raw in enumerate(data["takes"]))
    if by_paragraph:
        return Manifest(data["chapterId"], None, None, takes, first, last)
    return Manifest(data["chapterId"], first, last, takes)


# ---------------------------------------------------------------------------
# running


def _project_hints(engine: ModuleType, manuscript: str) -> str | None:
    """The project's vocabulary hints (Whisper hotwords), read as the compare run reads them."""
    path = engine.project_data_path(manuscript, "vocabulary_hints.txt")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip() or None
    except OSError:
        return None


def whisper_transcriber(engine: ModuleType, args, hotwords: str | None) -> Transcriber:
    """Decode a take's range and transcribe it with word timestamps (docs/utilities/transcript-compare.md#alignment-and-confidence's words)."""

    def transcribe(take: Take) -> Sequence[Word]:
        audio = engine.decode_segment(take.source_file, take.start_offset, take.length)
        return engine.transcribe(audio, args.model, args.language, args.device, hotwords=hotwords, model_dir=args.model_dir)

    return transcribe


def _transcription_line(args) -> str:
    return (
        "TAKE_TRANSCRIPTION|" + json.dumps({"language": args.language, "model": args.model}, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    )


def _words_line(index: int, take: Take, words: Sequence[Word]) -> str:
    payload = {"index": index, "takeGuid": take.take_guid, "words": [[text, float(start), float(end)] for text, start, end in words]}
    return "TAKE_WORDS|" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"


def _write_atomically(path: str, text: str) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def run(args, engine: ModuleType, transcriber: Transcriber | None = None) -> None:
    """Transcribe every take in the manifest and write the words report."""
    progress = args.progress
    engine.write_progress(progress, "START", 0, "Starting...")
    manifest = read_manifest(args.manifest)
    transcriber = transcriber or whisper_transcriber(engine, args, _project_hints(engine, args.manuscript))

    lines = [_transcription_line(args)]
    count = len(manifest.takes)
    for index, take in enumerate(manifest.takes):
        engine.check_cancelled(progress)
        pct = TRANSCRIBE_START_PCT + (TRANSCRIBE_END_PCT - TRANSCRIBE_START_PCT) * index // count
        engine.write_progress(progress, "TRANSCRIBE", pct, f"Transcribing take {index + 1}/{count}")
        engine.log(f"Take {index}: {take.take_guid} ({take.source_file} [{take.start_offset:.2f}s, {take.length:.2f}s])")
        words = transcriber(take)
        engine.check_cancelled(progress)
        lines.append(_words_line(index, take, words))

    engine.write_progress(progress, "WRITE", WRITE_PCT, "Writing the words...")
    _write_atomically(args.out, "".join(lines))
    engine.log(f"Wrote the words of {count} take(s) to {args.out}")
    engine.write_progress(progress, "DONE", 100, "Finished")


def main(ap, args, engine: ModuleType, transcriber: Transcriber | None = None) -> int:
    """`--take-divergence`: check its own arguments, run, and return the exit code."""
    missing = [name for name, value in [("--manifest", args.manifest), ("--out", args.out)] if not value]
    if missing:
        ap.error(", ".join(missing) + " required with --take-divergence")
    for flag, given in [("--find-repeats", args.find_repeats), ("--chunk-seconds", args.chunk_seconds), ("--extract-hints", args.extract_hints)]:
        if given:
            ap.error(f"{flag} cannot be used with --take-divergence")
    try:
        run(args, engine, transcriber)
    except engine.Cancelled:
        engine.log("Cancelled by user.")
        engine.write_progress(args.progress, "CANCELLED", 0, "Cancelled by user")
        with contextlib.suppress(OSError):  # only a progress file can ask for a cancel
            os.remove(args.progress + ".cancel")
        return EXIT_CANCELLED
    except Exception as exc:  # noqa: BLE001 - every failure is reported the same way: an ERROR progress line
        engine.log(traceback.format_exc())
        engine.write_progress(args.progress, "ERROR", 0, str(exc))
        return EXIT_FAILED
    return EXIT_DONE
