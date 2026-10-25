"""
Transcribe one or more audio segments (items on a REAPER track) and write the
words heard. The host matches the track to a chapter of the canonical manuscript
before it starts this run, diffs the words against that chapter's text and writes
the take markers and the diff (src/studio/desktop/internal/comparerun,
docs/utilities/transcript-compare.md).

Usage:
    python compare.py --manifest segments.txt --manuscript "manuscript.json" \
        --out words.txt [--model base]

Manifest input format (pipe-delimited, no header):
    item_index|source_file|start_offset_seconds|length_seconds

Output (--out, written atomically) is the words report, tagged lines with
compact JSON payloads:
    COMPARE_SEGMENT|{"itemIndex", "startOffset", "concatStart"}   (one per item, in item order)
    COMPARE_WORDS|{"words": [[text, start, end], ...]}           (seconds of the joined audio)

--manuscript is read only for the project's vocabulary hints. The host's results
file (SUMMARY, DIFF and MARKER lines) is described in internal/comparerun.

Two additive modes write their own tagged lines instead: --find-repeats
(each read of an item_index|source_file|start_offset|length|item_guid|take_guid
manifest transcribed on its own, a REPEAT_WORDS line per read that the host
groups into repeated spans) and --coverage (recording coverage: a JSON manifest
in, one words file per item and a words report of COVERAGE_WORDS,
COVERAGE_UNSURE and COVERAGE_RECHECKED lines with JSON payloads out, which the
host aligns; see core/coverage_mode.py for its manifest, words files, output
and exit codes).

--capabilities prints one JSON object instead of any of the above: every row
this process has actually registered in ENGINES (batch ASR), e.g.
{"type": "capabilities", "asr": {"whisper": {"label": "Whisper (faster-whisper)",
"platforms": [], "modes": ["batch"], "asset": "whisper", "loadable": null}}} -
registration only, never verified.
--manuscript is still required by argparse (as it is for --coverage and
--take-divergence too) but unused here; the packaged app's smoke test
(checkCompareCapabilities) reads this to catch a batch ASR row Go declares
for this platform that this process never registered.
"""

import argparse
import json
import multiprocessing
import os
import sys
import time
import traceback
from pathlib import Path

import numpy as np

_SHARED_PYTHON = Path(__file__).resolve().parents[5] / "src" / "studio" / "libs" / "python"
if str(_SHARED_PYTHON) not in sys.path:
    sys.path.insert(0, str(_SHARED_PYTHON))
# The sibling modules (coverage_mode, take_divergence_mode...) when compare.py is loaded by path, as the tests do.
_CORE = Path(__file__).resolve().parent
if str(_CORE) not in sys.path:
    sys.path.append(str(_CORE))

from narration_common import manuscript as canonical_manuscript
from narration_common.config import get_default
from narration_common.logging_utils import log, set_log_file
from narration_common.ports.asr import ENGINES
from narration_common.progress import write_progress

SAMPLE_RATE = 16000


def format_time(seconds):
    seconds = max(0, int(seconds))
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


class Cancelled(Exception):
    pass


def check_cancelled(progress_path):
    if not progress_path:
        return
    if os.path.exists(progress_path + ".cancel"):
        raise Cancelled()


def load_vocabulary_hints(manuscript_path):
    """The project's vocabulary_hints.txt as Whisper hotwords, or None."""
    vocab_hints_path = project_data_path(manuscript_path, "vocabulary_hints.txt")
    if not os.path.exists(vocab_hints_path):
        return None
    try:
        with open(vocab_hints_path, "r", encoding="utf-8") as f:
            return f.read().strip() or None
    except OSError:
        return None


def project_data_dir(manuscript_path):
    """This tool's per-project metadata folder, next to the manuscript
    itself - houses the diff output and the custom word-equivalence list,
    derived by convention from --manuscript rather than a separate argument, so
    the caller (the REAPER script) never has to plumb an extra path
    through."""
    return str(Path(manuscript_path).resolve().parents[2] / "TranscriptCompare")


def project_data_path(manuscript_path, filename):
    return os.path.join(project_data_dir(manuscript_path), filename)


def read_segments(manifest_path):
    segments = []
    with open(manifest_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            item_index, source_file, start_offset, length = line.split("|")
            segments.append(
                {
                    "item_index": int(item_index),
                    "source_file": source_file,
                    "start_offset": float(start_offset),
                    "length": float(length),
                }
            )
    segments.sort(key=lambda s: s["item_index"])
    return segments


def decode_segment(source_file, start_offset, length):
    """Decode [start_offset, start_offset+length) seconds of source_file to
    mono float32 @ 16kHz using PyAV, so multi-item tracks with no rendering
    or gluing still produce one continuous transcript.

    PyAV's seek() lands at or before the requested point (nearest keyframe),
    so we can't just trim samples from the front of the decode blindly - we
    derive the actual lead-in from the first decoded frame's own timestamp
    and drop exactly that much, then take exactly `length` seconds from
    there."""
    import av

    container = av.open(source_file)
    stream = container.streams.audio[0]
    resampler = av.AudioResampler(format="fltp", layout="mono", rate=SAMPLE_RATE)
    total_needed = round(length * SAMPLE_RATE)

    if start_offset > 0:
        seek_pts = int(start_offset / stream.time_base)
        container.seek(seek_pts, stream=stream)

    chunks = []
    first_frame_time = None
    collected_samples = 0

    for frame in container.decode(stream):
        if frame.pts is not None and first_frame_time is None:
            first_frame_time = float(frame.pts * stream.time_base)
        for rframe in resampler.resample(frame):
            arr = rframe.to_ndarray()[0].astype(np.float32)
            chunks.append(arr)
            collected_samples += len(arr)

        if first_frame_time is not None:
            lead_in = max(0, round((start_offset - first_frame_time) * SAMPLE_RATE))
            if collected_samples >= lead_in + total_needed:
                break

    container.close()

    if not chunks:
        return np.zeros(total_needed, dtype=np.float32)

    audio = np.concatenate(chunks)

    lead_in = 0
    if first_frame_time is not None:
        lead_in = min(len(audio), max(0, round((start_offset - first_frame_time) * SAMPLE_RATE)))
    audio = audio[lead_in:]

    if len(audio) > total_needed:
        audio = audio[:total_needed]
    elif len(audio) < total_needed:
        audio = np.pad(audio, (0, total_needed - len(audio)))

    return audio.astype(np.float32)


def build_concatenated_audio(segments, progress_path=None):
    """Returns (full_audio_array, segments_with_concat_start) where each
    segment dict gains a 'concat_start' key (seconds into the concatenated
    array where this segment begins)."""
    pieces = []
    concat_start = 0.0
    enriched = []
    n = len(segments)
    for i, seg in enumerate(segments):
        check_cancelled(progress_path)
        write_progress(progress_path, "DECODE", 2 + int(13 * i / max(1, n)), f"Decoding item {i + 1}/{n}")
        log(f"Decoding item {seg['item_index']}: {seg['source_file']} [{seg['start_offset']:.2f}s, {seg['length']:.2f}s]")
        audio = decode_segment(seg["source_file"], seg["start_offset"], seg["length"])
        pieces.append(audio)
        seg = dict(seg)
        seg["concat_start"] = concat_start
        enriched.append(seg)
        concat_start += len(audio) / SAMPLE_RATE

    full_audio = np.concatenate(pieces) if pieces else np.zeros(0, dtype=np.float32)
    return full_audio, enriched


def transcribe(audio_array, model_size, language, device="cpu", progress_path=None, hotwords=None, return_info=False, model_dir=None):
    """Transcribes ``audio_array`` with the ASR port's Whisper engine (``asr_batch.FasterWhisperEngine``).

    A thin wrapper: it only translates this call's arguments to and from ``BatchRequest``/``BatchResult`` and turns
    ``progress_path``'s file-based reporting and cancellation into the request's ``progress`` callback. The engine itself
    (model loading, the transcribe loop) lives in ``asr_batch.py``.
    """
    import asr_batch  # a sibling module: compare.py's own directory is on sys.path, frozen or not
    from narration_common.ports.asr import BatchRequest

    # model_dir is an asset-cache directory of the app whose contents were
    # already hash-verified before this process was started (see
    # src/studio/desktop/internal/whisper). Passing it with local_files_only=True stops
    # faster-whisper/huggingface_hub from ever reaching the network here -
    # without it, only a bare model_size falls back to that legacy download
    # path, kept for direct/manual CLI use outside the desktop host.
    if model_dir:
        write_progress(progress_path, "LOAD", 15, f"Loading Whisper model '{model_size}'...")
    else:
        write_progress(progress_path, "LOAD", 15, f"Loading Whisper model '{model_size}' (first use may download it)...")

    def on_progress(done_seconds, total_seconds):
        check_cancelled(progress_path)
        frac = min(1.0, done_seconds / total_seconds) if total_seconds > 0 else 1.0
        write_progress(progress_path, "TRANSCRIBE", 18 + int(72 * frac), f"Transcribing... {format_time(done_seconds)} / {format_time(total_seconds)}")

    request = BatchRequest(model=model_size, model_dir=model_dir, language=language, hotwords=hotwords, device=device, progress=on_progress)
    transcriber = asr_batch.ENGINE.batch(request)
    try:
        result = transcriber.transcribe(audio_array, request)
    finally:
        transcriber.close()

    words = list(result.words)  # list of (word_text, start_seconds, end_seconds)
    if return_info:
        return words, result
    return words


# Sensible-not-perfectly-tuned per-model default cap on how many chunk
# workers to run at once (each loads its own full copy of the model into
# memory - unlike threads, a spawned process shares nothing). Clamped
# further to 1 on CUDA, where concurrent worker processes would contend
# for the same GPU/VRAM instead of just CPU cores.
MAX_WORKERS_BY_MODEL = {
    "tiny": 8,
    "base": 6,
    "small": 4,
    "medium": 2,
    "large-v3-turbo": 2,
    "large-v3": 1,
}

# Each chunk after the first starts this many seconds early and each one
# before the last runs this many seconds late, so a word cut at a chunk's
# edge is heard whole by its neighbour; reassembly keeps each word from one
# chunk only.
CHUNK_OVERLAP_SECONDS = 1.5


def _read_last_progress_pct(path):
    """Best-effort read of a chunk's own progress file's last PCT field -
    used only to estimate how far along a still-running worker is, never
    to make a correctness decision, so any read/parse hiccup (the file
    mid-write, not yet created, etc.) just falls back to "no update yet"."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return None
    last_line = None
    for line in content.splitlines():
        if line.strip():
            last_line = line
    if not last_line:
        return None
    parts = last_line.split("|")
    if len(parts) < 2:
        return None
    try:
        return float(parts[1])
    except ValueError:
        return None


def _chunk_worker_entry(chunk_audio_path, model_size, language, device, hotwords, chunk_progress_path, chunk_out_path, model_dir=None):
    """Entry point for one chunk's transcription in its own OS process (see
    transcribe_chunked below). A spawned worker is a fresh interpreter -
    nothing is shared with the parent or sibling workers - so it loads its
    own WhisperModel, transcribes this chunk's audio (written to a private
    .npy file by the parent; chunk-local timestamps only, the parent adds
    the chunk's start-time offset during reassembly), and writes the
    resulting words to chunk_out_path as JSON.

    Runs as a separate process rather than a thread specifically so the
    parent can force-terminate it outright on cancellation, and so this
    function's own unconditional os._exit(0) can force real termination
    when done - mirroring the exact reasoning already used for the main
    process in main()'s Cancelled handler: faster-whisper/ctranslate2 can
    leave lingering non-daemon threads that keep a process alive past a
    normal return.
    """
    try:
        audio = np.load(chunk_audio_path)
        words = transcribe(audio, model_size, language, device, chunk_progress_path, hotwords, model_dir=model_dir)
        tmp_path = chunk_out_path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(words, f)
        os.replace(tmp_path, chunk_out_path)
    except Exception:  # noqa: BLE001, S110
        # Best-effort: leave chunk_out_path missing on failure. The parent
        # has no separate per-chunk error channel today - a chunk that
        # never produces its output file is indistinguishable here from
        # one that's just slow, so it surfaces only via the run's overall
        # TIMEOUT_SECONDS handling on the Lua side, same as any other
        # backend hang would.
        pass
    finally:
        os._exit(0)


def transcribe_chunked(full_audio, model_size, language, device, progress_path, hotwords, chunk_seconds, parallel_workers, work_dir, model_dir=None):
    """Chunked/optionally-parallel counterpart to transcribe(): splits
    full_audio into chunk_seconds-length, slightly overlapping windows,
    transcribes each independently (in parallel worker processes beyond
    the first, which runs synchronously in this process), then reassembles
    one chunk-offset-adjusted transcript_words list, each word from one chunk -
    the same shape transcribe() itself returns, so run() writes the same
    words report either way.
    """
    overlap_samples = int(CHUNK_OVERLAP_SECONDS * SAMPLE_RATE)
    chunk_samples = int(chunk_seconds * SAMPLE_RATE)
    n = len(full_audio)

    starts = list(range(0, n, chunk_samples)) if chunk_samples > 0 else [0]
    chunks = []
    for i, start in enumerate(starts):
        ov_start = max(0, start - overlap_samples) if i > 0 else start
        end = min(n, start + chunk_samples + overlap_samples)
        chunks.append(
            {
                "index": i,
                "start_sample": ov_start,
                "end_sample": end,
                "offset_seconds": ov_start / SAMPLE_RATE,
                "duration": (end - ov_start) / SAMPLE_RATE,
            }
        )
    n_chunks = len(chunks)
    log(f"Chunked transcription: {n_chunks} chunk(s) of ~{chunk_seconds}s (with {CHUNK_OVERLAP_SECONDS}s overlap between neighbors)")

    max_by_model = MAX_WORKERS_BY_MODEL.get(model_size, 2)
    if device == "cuda":
        max_by_model = 1
    n_workers = parallel_workers if parallel_workers > 0 else max_by_model
    n_workers = max(1, min(n_workers, n_chunks, max_by_model, os.cpu_count() or 1))
    log(f"Using up to {n_workers} parallel worker process(es) for model '{model_size}'")

    os.makedirs(work_dir, exist_ok=True)

    def chunk_paths(i):
        return (
            os.path.join(work_dir, f"chunk_{i:04d}.npy"),
            os.path.join(work_dir, f"chunk_{i:04d}.progress"),
            os.path.join(work_dir, f"chunk_{i:04d}.json"),
        )

    for c in chunks:
        audio_path, _, _ = chunk_paths(c["index"])
        np.save(audio_path, full_audio[c["start_sample"] : c["end_sample"]])

    # Chunk 0 runs synchronously in this (parent) process, before any
    # workers are spawned - this both caches the model download once
    # (avoiding N processes racing to fetch the same weights on a cold
    # cache) and, when the caller didn't force a --language, lets every
    # later chunk reuse chunk 0's own detected language explicitly instead
    # of each independently (and possibly inconsistently) auto-detecting
    # language on what might be a low-signal slice.
    write_progress(progress_path, "TRANSCRIBE", 18, f"Transcribing chunk 1/{n_chunks}...")
    _, _, first_out_path = chunk_paths(0)
    first_words, first_info = transcribe(
        full_audio[chunks[0]["start_sample"] : chunks[0]["end_sample"]], model_size, language, device, None, hotwords, return_info=True, model_dir=model_dir
    )
    with open(first_out_path, "w", encoding="utf-8") as f:
        json.dump(first_words, f)
    effective_language = language or first_info.language

    pending = chunks[1:]
    running = {}  # index -> multiprocessing.Process
    chunk_progress = {0: 100.0}
    for c in pending:
        chunk_progress[c["index"]] = 0.0

    def aggregate_percent():
        total_weighted = sum(c["duration"] for c in chunks) or 1.0
        weighted = sum(chunk_progress.get(c["index"], 0.0) * c["duration"] for c in chunks)
        return 18 + int(72 * min(1.0, weighted / (100.0 * total_weighted)))

    cancel_path = (progress_path + ".cancel") if progress_path else None
    while pending or running:
        if cancel_path and os.path.exists(cancel_path):
            for p in running.values():
                p.terminate()
            raise Cancelled()

        while pending and len(running) < n_workers:
            c = pending.pop(0)
            audio_path, chunk_prog_path, chunk_out_path = chunk_paths(c["index"])
            p = multiprocessing.Process(
                target=_chunk_worker_entry,
                args=(audio_path, model_size, effective_language, device, hotwords, chunk_prog_path, chunk_out_path, model_dir),
                daemon=True,
            )
            p.start()
            running[c["index"]] = p

        for idx in list(running.keys()):
            _, chunk_prog_path, chunk_out_path = chunk_paths(idx)
            if os.path.exists(chunk_out_path):
                running.pop(idx)
                chunk_progress[idx] = 100.0
            else:
                pct = _read_last_progress_pct(chunk_prog_path)
                if pct is not None:
                    chunk_progress[idx] = pct

        done_count = n_chunks - len(pending) - len(running)
        write_progress(progress_path, "TRANSCRIBE", aggregate_percent(), f"Transcribing... {done_count}/{n_chunks} chunk(s) done")
        time.sleep(0.5)

    # Reassembly: read every chunk's words back, add each chunk's own start-time offset (workers wrote chunk-local
    # timestamps only), and keep each word from the chunk its midpoint falls in, the cut between two neighbours being
    # the middle of the span they share - the recording check's own rule (coverage_chunks.merge_chunks).
    import coverage_chunks  # a sibling module: compare.py's own directory is on sys.path, frozen or not

    heard = []
    for c in chunks:
        _, _, chunk_out_path = chunk_paths(c["index"])
        with open(chunk_out_path, "r", encoding="utf-8") as f:
            raw_words = json.load(f)
        offset = c["offset_seconds"]
        words = tuple((w[0], w[1] + offset, w[2] + offset) for w in raw_words)
        span = coverage_chunks.Chunk(offset, c["end_sample"] / SAMPLE_RATE)
        heard.append(coverage_chunks.ChunkWords(span, words, (None,) * len(words)))
    all_words = list(coverage_chunks.merge_chunks(heard)[0])

    for c in chunks:
        for p in chunk_paths(c["index"]):
            try:
                os.remove(p)
            except OSError:
                pass
        try:
            os.remove(chunk_paths(c["index"])[2] + ".tmp")
        except OSError:
            pass
    try:
        os.rmdir(work_dir)
    except OSError:
        pass  # non-empty (e.g. a stray file) or already gone - not fatal, best-effort cleanup only

    write_progress(progress_path, "TRANSCRIBE", 90, "Transcription complete")
    return all_words


def load_manuscript_chapters(manuscript_path):
    """Return comparison chapters from canonical manuscript data only."""
    data = canonical_manuscript.load_file(manuscript_path)
    by_chapter = {
        chapter["id"]: {
            "id": chapter["id"],
            "title": chapter["title"],
            # Read aloud optionally, like the title (recording coverage, Q11); the markers ignore it.
            "subtitle": chapter.get("subtitle") if isinstance(chapter.get("subtitle"), str) else "",
            "paragraphs": [],
            "global_indices": [],
            "paragraph_ids": [],
        }
        for chapter in data["chapters"]
        if chapter.get("contentKind", "narration") == "narration"
    }
    for paragraph in data["paragraphs"]:
        chapter = by_chapter.get(paragraph["chapterId"])
        if chapter is None:
            continue
        chapter["paragraphs"].append(paragraph["text"])
        chapter["global_indices"].append(paragraph["index"])
        chapter["paragraph_ids"].append(paragraph["id"])
    chapters = [chapter for chapter in by_chapter.values() if chapter["paragraphs"]]
    if not chapters:
        raise ValueError("The canonical manuscript has no narratable chapters.")
    return chapters


def read_repeat_segments(manifest_path):
    """Manifest reader for --find-repeats: like read_segments(), but each
    line names a distinct *read* (an item, or one take of an item) to be
    transcribed and aligned on its own, plus the identity fields the
    exact-copy check and the Go adapter need. Pipe-delimited, no header:

        item_index|source_file|start_offset_seconds|length_seconds|item_guid|take_guid

    item_guid/take_guid are opaque strings supplied by the Go caller (a
    REAPER item/take GUID); this module never interprets them beyond
    equality and pass-through, since take identity is REAPER's, not this
    sidecar's (see compare.py module docstring). Segments keep manifest order (unlike read_segments, which is only
    ever used for one concatenated stream and sorts by item_index)."""
    segments = []
    with open(manifest_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            item_index, source_file, start_offset, length, item_guid, take_guid = line.split("|")
            segments.append(
                {
                    "item_index": int(item_index),
                    "source_file": source_file,
                    "start_offset": float(start_offset),
                    "length": float(length),
                    "item_guid": item_guid,
                    "take_guid": take_guid,
                }
            )
    return segments


def find_repeated_spans(args):
    """The pickup and duplicate scan's transcription: every read named in --manifest decoded and transcribed on its
    own, and its words written to --out as one REPEAT_WORDS line per read, in manifest order. The host chooses the
    chapter before it starts this, then aligns each read, groups the reads that cover the same span and flags exact
    copies (src/studio/desktop/internal/comparerun/repeats.go)."""
    progress_path = args.progress

    write_progress(progress_path, "START", 0, "Starting...")

    segments = read_repeat_segments(args.manifest)
    if not segments:
        raise ValueError("Manifest contained no segments.")

    lines = []
    n = len(segments)
    for i, seg in enumerate(segments):
        check_cancelled(progress_path)
        write_progress(progress_path, "TRANSCRIBE", 2 + int(90 * i / max(1, n)), f"Transcribing read {i + 1}/{n}")
        log(
            f"Transcribing read {i}: item {seg['item_index']} take {seg['take_guid']} ({seg['source_file']} [{seg['start_offset']:.2f}s, {seg['length']:.2f}s])"
        )
        audio = decode_segment(seg["source_file"], seg["start_offset"], seg["length"])
        transcript_words = transcribe(audio, args.model, args.language, args.device, model_dir=args.model_dir)
        words = [[text, float(start), float(end)] for text, start, end in transcript_words]
        lines.append("REPEAT_WORDS|" + json.dumps({"words": words}, ensure_ascii=False, separators=(",", ":")) + "\n")

    check_cancelled(progress_path)
    write_progress(progress_path, "WRITE", 99, "Writing results...")
    _write_atomically(args.out, "".join(lines))
    log(f"Wrote the words of {n} read(s) to {args.out}")
    write_progress(progress_path, "DONE", 100, "Finished")


def run(args):
    """The compare run: decode and join the manifest's items, transcribe them and write the words report. The host has
    already matched the chapter (src/studio/desktop/internal/comparerun) and builds the markers from the report."""
    progress_path = args.progress

    write_progress(progress_path, "START", 0, "Starting...")

    segments = read_segments(args.manifest)
    if not segments:
        raise ValueError("Manifest contained no segments.")

    check_cancelled(progress_path)
    full_audio, segments = build_concatenated_audio(segments, progress_path)

    hotwords = load_vocabulary_hints(args.manuscript)

    if args.chunk_seconds and args.chunk_seconds > 0:
        chunk_work_dir = os.path.splitext(args.out)[0] + "_chunks"
        transcript_words = transcribe_chunked(
            full_audio,
            args.model,
            args.language,
            args.device,
            progress_path,
            hotwords,
            args.chunk_seconds,
            args.parallel_workers,
            chunk_work_dir,
            model_dir=args.model_dir,
        )
    else:
        transcript_words = transcribe(full_audio, args.model, args.language, args.device, progress_path, hotwords, model_dir=args.model_dir)

    check_cancelled(progress_path)
    write_progress(progress_path, "WRITE", 99, "Writing the words...")
    _write_atomically(args.out, _words_report(segments, transcript_words))
    log(f"Wrote the words of {len(segments)} item(s) to {args.out}")
    write_progress(progress_path, "DONE", 100, "Finished")


def _words_report(segments, transcript_words):
    """The words report the host builds the markers from (src/studio/desktop/internal/comparerun): each segment's item,
    source offset and start in the joined audio, and the words heard."""

    def line(tag, payload):
        return tag + "|" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"

    lines = []
    for seg in segments:
        lines.append(line("COMPARE_SEGMENT", {"itemIndex": seg["item_index"], "startOffset": seg["start_offset"], "concatStart": seg["concat_start"]}))
    lines.append(line("COMPARE_WORDS", {"words": [[text, float(start), float(end)] for text, start, end in transcript_words]}))
    return "".join(lines)


def _write_atomically(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def _capability_row(descriptor) -> dict:
    """One row of a --capabilities report: a Descriptor's label, platforms and modes, plus its asset kind when it
    has one (AsrDescriptor only). "loadable" is always null: this reports registration only, never whether the row
    actually loads - the same shape live_asr.py's --capabilities uses."""
    row = {"label": descriptor.label, "platforms": list(descriptor.platforms), "modes": list(descriptor.modes), "loadable": None}
    asset_kind = getattr(descriptor, "asset_kind", "")
    if asset_kind:
        row["asset"] = asset_kind
    return row


def capabilities_report(engines=ENGINES) -> dict:
    """--capabilities: every row this sidecar process has actually registered in ENGINES (batch ASR) by the time this
    runs. Unlike the Teleprompter and Story Bible sidecars, asr_batch's registration is lazy (only transcribe()
    imports it), so the --capabilities dispatch branch below imports it itself first. `engines` is overridable so a
    test can stand in a reduced registry for "an adapter failed to register" without needing a real broken import."""
    return {"type": "capabilities", "asr": {engine.descriptor.name: _capability_row(engine.descriptor) for engine in engines}}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", required=False, help="Path to the pipe-delimited segment manifest")
    ap.add_argument("--manuscript", required=True, help="Path to canonical manuscript.json")
    ap.add_argument("--out", required=False, help="Path to write the tagged results file")
    ap.add_argument(
        "--model", default=get_default("TranscriptCompare", "model_size", "small"), help="Whisper model size (tiny/base/small/medium/large-v3-turbo/large-v3)"
    )
    ap.add_argument(
        "--model-dir",
        default=None,
        help="Local, already-verified faster-whisper model directory (passed by the desktop host's asset manager); "
        "when omitted, falls back to letting faster-whisper resolve --model itself for direct/manual CLI use",
    )
    ap.add_argument("--language", default=None, help="Force language code, e.g. 'en' (default: auto-detect)")
    ap.add_argument("--device", default="cpu", choices=["cpu", "cuda"], help="Inference device (default: cpu)")
    ap.add_argument("--progress", default=None, help="Path to write live progress updates to (optional)")
    ap.add_argument("--log", default=None, help="Path to also mirror log output to (optional)")
    ap.add_argument(
        "--chunk-seconds",
        type=int,
        default=0,
        help="Transcribe in fixed-length chunks of this many seconds instead of the whole file at once (0 = whole file, default)",
    )
    ap.add_argument("--parallel-workers", type=int, default=0, help="Max chunk workers to run at once when chunked (0 = auto, based on model size)")
    ap.add_argument(
        "--chunk-overlap-seconds",
        type=float,
        default=None,
        help="With --coverage and chunking: how many seconds neighbouring chunks overlap, the crossover where their words are joined (default 6)",
    )
    ap.add_argument(
        "--unsure-below",
        type=float,
        default=None,
        help="With --coverage: report passages whose words Whisper gave a probability under this (0 to 1) as COVERAGE_UNSURE lines (default: none)",
    )
    ap.add_argument(
        "--recheck-model",
        default=None,
        help="With --coverage and --unsure-below: pipeline the model cascade in this one process: as the first pass (--model) finishes each item, "
        "this larger model re-checks its doubtful passages and splices them into the item's words file; one alignment runs when both are done",
    )
    ap.add_argument(
        "--recheck-model-dir", default=None, help="With --recheck-model: the local, already-verified directory of that model (the host's asset manager)"
    )
    ap.add_argument(
        "--checked-by",
        default=None,
        help="With --coverage: the model cascade's larger model, when this stage is not the pipeline: a words file it made whole serves this "
        "run as it is, and a passage it already re-checked is not reported unsure again, so a check of unchanged audio never redoes its work",
    )
    ap.add_argument(
        "--cpus",
        type=int,
        default=0,
        help="With --coverage: the most processors this run plans its workers for (0 = all of them); a background check leaves the rest to "
        "the Booth's live tracking",
    )
    ap.add_argument(
        "--capabilities",
        action="store_true",
        help="Print every row this process has registered in ENGINES (batch ASR), by name (one JSON object: "
        "{type: capabilities, asr}; registration only, not verified), then exit 0",
    )
    ap.add_argument(
        "--take-divergence",
        action="store_true",
        help="Additive mode: transcribe every take in --manifest (a JSON manifest) of one fixed manuscript span and write "
        "its words to --out, which the host aligns to the span (see core/take_divergence_mode.py)",
    )
    ap.add_argument(
        "--find-repeats",
        action="store_true",
        help="Additive mode: instead of one concatenated compare, transcribe every read in --manifest "
        "(item_index|source_file|start_offset|length|item_guid|take_guid) on its own and write a REPEAT_WORDS line of "
        "its words per read, which the host groups into repeated spans",
    )
    ap.add_argument(
        "--coverage",
        action="store_true",
        help="Additive mode (recording coverage): transcribe the items in --manifest (a JSON manifest) of --chapter-id, "
        "reusing or writing one words file per item in --words-dir, and write the words report the host aligns from to --out",
    )
    ap.add_argument("--chapter-id", default=None, help="With --coverage: the canonical manuscript chapter id the items read (no name matching)")
    ap.add_argument("--words-dir", default=None, help="With --coverage: the directory holding the per-item words files the manifest names")
    ap.add_argument(
        "--recheck",
        default=None,
        help="With --coverage, instead of a full check (the cascade's second pass): transcribe only the windows named in this JSON "
        "file with --model, one model load for the run, and splice the new words into each affected words file in --words-dir; "
        "writes no --out report",
    )
    args = ap.parse_args()

    if args.log:
        try:
            set_log_file(open(args.log, "w", encoding="utf-8"))  # noqa: SIM115
        except OSError:
            pass

    if args.capabilities:
        import asr_batch  # noqa: F401 - a sibling module: registers "whisper" (batch) into ENGINES before this reads it

        # flush=True: os._exit() below skips the normal interpreter shutdown that would otherwise flush stdout, and
        # a non-tty stdout (piped, as the host's Supervisor always runs this) is fully buffered, not line-buffered -
        # without it, this print is silently lost on a real build (caught live: PYTHONUNBUFFERED=1 in dev masks it).
        print(json.dumps(capabilities_report()), flush=True)
        os._exit(0)

    if args.take_divergence:
        import take_divergence_mode  # a sibling module: compare.py's own directory is on sys.path, frozen or not

        os._exit(take_divergence_mode.main(ap, args, sys.modules[__name__]))

    if args.coverage:
        _main_coverage(ap, args)
        return
    if args.recheck:
        ap.error("--recheck can only be used with --coverage")

    required = [("--manifest", args.manifest), ("--out", args.out)]
    missing = [name for name, val in required if not val]
    if missing:
        ap.error(", ".join(missing) + " required")

    _run_and_exit(args, find_repeated_spans if args.find_repeats else run)


def _main_coverage(ap, args):
    """--coverage: check its own arguments, then run core/coverage_mode.py. --recheck (the cascade's
    second pass) is a separate, windows-only mode: it takes only --words-dir and --model,
    never a manifest, chapter or --out."""
    if args.find_repeats:
        ap.error("--find-repeats cannot be used with --coverage")
    if args.unsure_below is not None and not 0 <= args.unsure_below <= 1:
        ap.error("--unsure-below must be from 0 to 1")
    if args.chunk_overlap_seconds is not None and args.chunk_overlap_seconds < 0:
        ap.error("--chunk-overlap-seconds cannot be negative")
    if args.chunk_seconds < 0 or args.parallel_workers < 0 or args.cpus < 0:
        ap.error("--chunk-seconds, --parallel-workers and --cpus cannot be negative")
    if args.checked_by and (args.recheck or args.recheck_model):
        ap.error("--checked-by is for a pass under the first model, not with --recheck or --recheck-model")

    if args.recheck_model and not args.unsure_below:
        ap.error("--recheck-model needs --unsure-below above 0: the pipeline re-checks the passages the first pass doubts")
    if args.recheck_model and args.recheck:
        ap.error("--recheck-model cannot be used with --recheck")
    if args.recheck:
        if not args.words_dir:
            ap.error("--words-dir required with --coverage --recheck")

        def recheck(run_args):
            import coverage_mode  # a sibling module: compare.py's own directory is on sys.path, frozen or not

            coverage_mode.run_recheck(run_args, sys.modules[__name__])

        _run_and_exit(args, recheck)
        return

    required = [("--manifest", args.manifest), ("--chapter-id", args.chapter_id), ("--words-dir", args.words_dir), ("--out", args.out)]
    missing = [name for name, val in required if not val]
    if missing:
        ap.error(", ".join(missing) + " required with --coverage")

    def coverage(run_args):
        import coverage_mode  # a sibling module: compare.py's own directory is on sys.path, frozen or not

        coverage_mode.run(run_args, sys.modules[__name__])

    _run_and_exit(args, coverage)


def _run_and_exit(args, mode):
    """Run one mode and exit with the sidecar's contract: 0 done, 1 failed, 2 cancelled."""
    try:
        mode(args)
    except Cancelled:
        log("Cancelled by user.")
        write_progress(args.progress, "CANCELLED", 0, "Cancelled by user")
        try:
            if args.progress:
                os.remove(args.progress + ".cancel")
        except OSError:
            pass
        # os._exit, not sys.exit: faster-whisper/ctranslate2 can leave
        # lingering non-daemon worker threads that keep the interpreter
        # alive through a normal shutdown, so the process never actually
        # exits (confirmed live: a "finished" run stuck around indefinitely
        # at ~0% CPU). This forces real termination.
        os._exit(2)
    except Exception as e:  # noqa: BLE001
        log(traceback.format_exc())
        write_progress(args.progress, "ERROR", 0, str(e))
        os._exit(1)

    os._exit(0)


if __name__ == "__main__":
    multiprocessing.freeze_support()  # a frozen build's worker processes start here, and must not run main()
    main()
