"""Seeded synthetic engine event streams over the transcript-compare coverage manuscript.

    gen_corpus.py OUT.jsonl [SEEDS_PER_CHAPTER]

Each (chapter, seed) becomes two sessions with the same ops: kind "flagging" and kind "tracker".
The narrator reads the chapter with ~5% substitutions / insertions / skips, a few restarts and skip-aheads,
one seek (reset_to), pauses > 1.5 s with ticks. The engine emits partials growing word by word (with the
odd wobble), confirms words ~2 behind the partial, and ends a segment every ~12 words.
"""

import json
import random
import sys

MANUSCRIPT = "/home/user/narration-studio/sidecars/transcript-compare/tests/fixtures/coverage/manuscript.json"
FILLERS = ["um", "uh", "erm", "hmm"]
JUNK = ["grr", "the", "a", "and", "chairs", "however", "Alice", "rabbit", "très", "naïve", "café", "‘well’", "two", "2"]
DIGITS = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "ten": "10", "twenty": "20", "hundred": "100"}


def chapters():
    doc = json.load(open(MANUSCRIPT, encoding="utf-8"))
    by = {}
    for p in sorted(doc["paragraphs"], key=lambda p: (p["chapterId"], p["index"])):
        by.setdefault(p["chapterId"], []).append(p["text"])
    return [(cid, "\n\n".join(paras)) for cid, paras in sorted(by.items())]


def engine_forms(rng, token):
    """How an engine might write one spoken script token (one or more words)."""
    bare = token.strip(".,;:!?\"()'“”‘’—-_")
    if not bare:
        return []  # punctuation-only tokens are not spoken
    low = bare.lower()
    if low in DIGITS and rng.random() < 0.4:
        return [DIGITS[low]]
    if "-" in bare and rng.random() < 0.5:
        return [w for w in bare.split("-") if w]
    r = rng.random()
    if r < 0.2:
        return [token]  # with punctuation, as written
    if r < 0.6:
        return [low]
    return [bare]


def mutate(rng, word):
    if len(word) > 3 and rng.random() < 0.5:
        i = rng.randrange(len(word))
        return word[:i] + rng.choice("aeioursnt") + word[i + 1 :]
    return rng.choice(JUNK)


def narrate(rng, tokens):
    """The words the narrator says, in order, plus where a seek happens (index into the said list)."""
    said, i, seek_at, seek_to = [], 0, None, None
    restarts = skips = 0
    while i < len(tokens):
        r = rng.random()
        if r < 0.05:
            said.append(mutate(rng, tokens[i]))  # substitution
            i += 1
            continue
        if r < 0.10:
            said.append(rng.choice(FILLERS + JUNK))  # insertion
            continue
        if r < 0.15:
            i += rng.randint(1, 2)  # skip
            continue
        if r < 0.16 and restarts < 3 and i > 10:
            i -= rng.randint(3, 15)  # restart
            restarts += 1
            continue
        if r < 0.168 and skips < 2:
            i += rng.randint(5, 20)  # skip ahead
            skips += 1
            continue
        said.extend(engine_forms(rng, tokens[i]))
        i += 1
    if len(said) > 20:
        seek_at = rng.randrange(10, len(said) - 5)
        seek_to = rng.randrange(0, len(tokens) + 3)  # sometimes past the end: clamped
    return said, seek_at, seek_to


def stream(rng, tokens):
    said, seek_at, seek_to = narrate(rng, tokens)
    ops, now, segment, k = [], 0.0, 0, 0
    audio = 0.0
    while k < len(said):
        size = rng.randint(8, 16)
        words = said[k : k + size]
        base_index = k
        k += len(words)
        times = []
        for w in words:
            dur = round(rng.uniform(0.15, 0.45), 3)
            times.append((round(audio, 3), round(audio + dur, 3)))
            audio += dur + rng.uniform(0.0, 0.1)
        confirmed = 0
        for n in range(1, len(words) + 1):
            now += rng.uniform(0.15, 0.4)
            shown = list(words[:n])
            if rng.random() < 0.1:
                shown[-1] = mutate(rng, shown[-1])  # wobbling hypothesis
            if rng.random() < 0.05 and n > 2:
                shown = shown[:-1]  # a partial that briefly loses a word
            pw = []
            for j, w in enumerate(shown):
                if rng.random() < 0.9:
                    pw.append({"word": w, "start": times[j][0], "end": times[j][1]})
                else:
                    pw.append({"word": w})
            ops.append({"op": "feed", "event": {"type": "partial", "segment": segment, "words": pw}, "now": round(now, 4)})
            while confirmed < n - 2:
                ops.append(word_op(rng, segment, words[confirmed], times[confirmed], now))
                confirmed += 1
            if seek_at is not None and base_index + n - 1 == seek_at:
                ops.append({"op": "reset", "word": seek_to, "now": round(now, 4)})
            if rng.random() < 0.05:
                now += rng.uniform(1.6, 4.0)  # a pause long enough for "waiting"
                ops.append({"op": "tick", "now": round(now, 4)})
            elif rng.random() < 0.3:
                ops.append({"op": "tick", "now": round(now, 4)})
        now += rng.uniform(0.2, 0.8)
        while confirmed < len(words):
            ops.append(word_op(rng, segment, words[confirmed], times[confirmed], now))
            confirmed += 1
        ops.append({"op": "feed", "event": {"type": "segment_end", "segment": segment}, "now": round(now, 4)})
        if rng.random() < 0.2:
            ops.append({"op": "feed", "event": {"type": "silence"}, "now": round(now, 4)})  # unknown type: ignored
        segment += 1
    now += 2.0
    ops.append({"op": "tick", "now": round(now, 4)})
    return ops


def word_op(rng, segment, word, times, now):
    ev = {"type": "word", "segment": segment, "word": word}
    r = rng.random()
    if r < 0.85:
        ev["start"], ev["end"] = times
    elif r < 0.9:
        ev["start"], ev["end"] = int(times[0]), int(times[1]) + 1  # ints
    elif r < 0.95:
        ev["start"], ev["end"] = times[1], times[0]  # echo-like overlap
    return {"op": "feed", "event": ev, "now": round(now, 4)}


def main(out, seeds):
    with open(out, "w", encoding="utf-8") as fh:
        for cid, text in chapters():
            tokens = text.split()
            for seed in range(seeds):
                ops = stream(random.Random(f"{cid}:{seed}"), tokens)
                for kind in ("flagging", "tracker"):
                    fh.write(json.dumps({"kind": kind, "tokens": tokens, "ops": ops, "chapter": cid, "seed": seed}, sort_keys=True) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 25)
