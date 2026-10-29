#!/usr/bin/env python3
"""How wrong are the word times the follow-along stands on? Whisper word times against two things that are not Whisper `small`.

The follow-along lights the word whose time the recording check stored, so every error in those times is an error on the page (docs/design/word-project-times.md).
This transcribes a LibriVox chapter the way the recording check does (faster-whisper, word timestamps, VAD filter), matches its words to the script, and reports:

1. Against the committed `large-v3-turbo` word times (tests/fixtures/audio/librivox-alice/alignment): how far each word's start and end move, by minute of the chapter,
   so a drift over a long chapter shows.
2. Against the pauses the committed sentence cuts sit in (the quietest frame between two sentences, measured on the signal): how many sentence boundaries a word
   crosses (the last word of a sentence ending after the pause, or the first word of the next starting before it), and how many words land in another sentence.

  word-time-error.py --audio kara_01.mp3 --source kara_01 [--model small] [--words reuse.json] [--json out.json]

Needs faster-whisper and the model (it downloads `--model` from the Hugging Face hub on first use), numpy, and the chapter's MP3 (build.py fetch writes it).
Not part of `pnpm check`: it needs a model and the recording.
"""

from __future__ import annotations

import argparse
import difflib
import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "tests" / "fixtures" / "audio" / "librivox-alice"
sys.path.insert(0, str(CORPUS))

import alice_text
import paragraph_spans


def transcribe(audio: Path, model_size: str) -> list[list]:
    """Words as the recording check stores them: [text, start, end]. The options are core/coverage_mode.py's."""
    import audio as corpus_audio  # the corpus's decoder; faster-whisper's own file reader needs a PyAV that matches it
    import numpy as np
    from faster_whisper import WhisperModel

    samples, rate = corpus_audio.decode(audio)
    pcm = np.interp(np.arange(0, len(samples) / rate, 1 / 16000) * rate, np.arange(len(samples)), samples).astype(np.float32)
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(pcm, language="en", word_timestamps=True, vad_filter=True)
    return [[w.word.strip(), round(w.start, 3), round(w.end, 3)] for segment in segments for w in segment.words or ()]


def token_times(chapter, words: list) -> tuple[list, list[int]]:
    heard = paragraph_spans._heard_tokens(words)
    script, first = [], []
    for paragraph in chapter.paragraphs:
        first.append(len(script))
        script.extend(alice_text.tokens(paragraph.text))
    times: list = [None] * len(script)
    for block in difflib.SequenceMatcher(None, script, [t for t, _, _ in heard], autojunk=False).get_matching_blocks():
        for k in range(block.size):
            _, start, end = heard[block.b + k]
            times[block.a + k] = (start, end)
    return times, first


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(q * len(ordered)))]


def summarize(label: str, values: list[float]) -> dict:
    ms = [v * 1000 for v in values]
    return {
        "what": label,
        "n": len(ms),
        "median_ms": round(statistics.median(ms)) if ms else 0,
        "p90_ms": round(percentile(ms, 0.90)),
        "p99_ms": round(percentile(ms, 0.99)),
        "max_ms": round(max(ms)) if ms else 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--source", default="kara_01")
    parser.add_argument("--model", default="small")
    parser.add_argument("--words", type=Path, help="reuse the words a previous run wrote with --json instead of transcribing")
    parser.add_argument("--json", type=Path, help="write the words and the numbers here")
    args = parser.parse_args()

    sources = json.loads((CORPUS / "sources.json").read_text(encoding="utf-8"))
    source = next(s for s in (sources["sources"] if isinstance(sources, dict) else sources) if s["id"] == args.source)
    chapter = alice_text.load_chapters()[source.get("chapter", "c-0001")]

    if args.words:
        words = json.loads(args.words.read_text(encoding="utf-8"))["words"]
    else:
        words = transcribe(args.audio, args.model)
    if args.json:
        args.json.write_text(json.dumps({"words": words}), encoding="utf-8")  # kept first: the transcription is the slow part
    mine, first = token_times(chapter, words)
    reference, _ = paragraph_spans.match_words(source, chapter)
    markers = json.loads((CORPUS / "alignment" / f"{args.source}.markers.json").read_text(encoding="utf-8"))

    both = [i for i in range(len(mine)) if mine[i] and reference[i]]
    starts = [abs(mine[i][0] - reference[i][0]) for i in both]
    ends = [abs(mine[i][1] - reference[i][1]) for i in both]
    out = {
        "model": args.model,
        "script_words": len(mine),
        "matched_here": sum(1 for t in mine if t),
        "matched_reference": sum(1 for t in reference if t),
        "start_vs_turbo": summarize("word start vs large-v3-turbo", starts),
        "end_vs_turbo": summarize("word end vs large-v3-turbo", ends),
    }
    minutes = {}
    for i in both:
        minutes.setdefault(int(reference[i][0] // 60), []).append(abs(mine[i][0] - reference[i][0]))
    out["start_vs_turbo_by_minute"] = {m: round(statistics.median(v) * 1000) for m, v in sorted(minutes.items())}

    boundaries = leaks = misplaced = tokens_in_sentences = 0
    worst = 0.0
    for number, paragraph in enumerate(chapter.paragraphs, start=1):
        cuts = markers["paragraphs"][number - 1]["sentence_cuts_s"]
        parts = [s for s in paragraph_spans._SENTENCE_END.split(paragraph.text) if s.strip()]
        lo = first[number - 1]
        edges = [lo]
        for part in parts:
            edges.append(edges[-1] + len(alice_text.tokens(part)))
        for k in range(len(parts) - 1):
            cut = cuts[k + 1]
            before = next((mine[i] for i in range(edges[k + 1] - 1, edges[k] - 1, -1) if mine[i]), None)
            after = next((mine[i] for i in range(edges[k + 1], edges[k + 2]) if mine[i]), None)
            if before is None or after is None:
                continue
            boundaries += 1
            leak = max(0.0, before[1] - cut, cut - after[0])
            worst = max(worst, leak)
            leaks += int(leak > 0.1)
        # A word whose middle is on the far side of a sentence cut is in another sentence than the script's.
        for k, part in enumerate(parts):
            lo_cut, hi_cut = cuts[k], cuts[k + 1]
            for i in range(edges[k], edges[k + 1]):
                if mine[i]:
                    tokens_in_sentences += 1
                    mid = (mine[i][0] + mine[i][1]) / 2
                    misplaced += int(not (lo_cut - 0.05 <= mid <= hi_cut + 0.05))
    out["sentence_boundaries_checked"] = boundaries
    out["boundaries_a_word_crosses_by_over_100ms"] = leaks
    out["worst_crossing_ms"] = round(worst * 1000)
    out["words_in_another_sentence"] = misplaced
    out["words_checked_against_cuts"] = tokens_in_sentences
    print(json.dumps(out, indent=2, default=float))
    if args.json:
        args.json.write_text(json.dumps({**out, "words": words}, default=float), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
