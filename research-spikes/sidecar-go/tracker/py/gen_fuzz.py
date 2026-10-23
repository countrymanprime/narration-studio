"""Seeded fuzz cases for normalize_word, words_match, SequenceMatcher.ratio, script_words, spoken_key,
locate and align.  gen_fuzz.py OUT.jsonl"""

import json
import random
import sys

rng = random.Random(20261023)

POOLS = [
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "0123456789_'-.,;:!?\"()",
    "‘’‛ʼ`´“”„‟",  # curly quotes and friends
    "éèêëÉÈÀÄäöüÖÜßẞçÇñÑøØåÅæœ",
    "̧́̈‍­",  # combining marks, ZWJ, soft hyphen (case-ignorable)
    "ΣσςΟΔΑΒΓαβγ",  # final sigma contexts
    "İıIiǅǄǆ",  # dotted capital I, titlecase digraphs
    "漢字日本語中文一二三四",  # CJK (incl. numeric ideographs)
    "한국어",
    "٠١٢٣४५६０１２²³½Ⅻⅷ①",  # other digits, superscripts, fractions, roman numerals, circled
    "ᏚᎢᎵᎬᎢᎬᏒꭰꭱ",  # Cherokee
    "ᲐᲑᲒაბგ",  # Georgian Mtavruli / Mkhedruli
    "\U00010d50\U00010d51\U00010d70\U00010d71\U00016d40\U0001e5d0",  # Unicode 16/17 additions (Garay, Kirat Rai, Ol Onal)
    "😀👍🏽\U0001F9D1",
    "  　\x1c\x1f​᠎\t\n",  # whitespace edge cases
]
WORDS = "the old lighthouse keeper climbed spiral stairs evening rabbit Alice sister conversations pictures daisy-chain o'clock seven twenty three hundred thousand one won their there they're your you're its it's".split()


def rand_word(max_len=12):
    n = rng.randint(0, max_len)
    pools = rng.sample(POOLS, rng.randint(1, 3))
    return "".join(rng.choice(rng.choice(pools)) for _ in range(n))


def mutate(w):
    w = list(w)
    for _ in range(rng.randint(0, 3)):
        op = rng.random()
        i = rng.randrange(len(w) + 1)
        if op < 0.4 and w:
            w[min(i, len(w) - 1)] = rng.choice("abcdeéσ'")
        elif op < 0.7:
            w.insert(i, rng.choice("abcdeéσ'"))
        elif w:
            del w[min(i, len(w) - 1)]
    return "".join(w)


def main(out):
    cases = []
    for _ in range(4000):
        cases.append({"k": "norm", "w": rand_word(16)})
    for w in ["ΟΔΟΣ", "ΟΔΟΣ.", "ΣΑ", "Σ", "AΣ́", "AΣ́B", "Α'Σ'", "İstanbul", "ǅemal", "ẞ", "\U00010d50\U00010d51"]:
        cases.append({"k": "norm", "w": w})
    for _ in range(600):
        cases.append({"k": "split", "w": " ".join(rand_word(6) for _ in range(rng.randint(0, 6)))})
    for _ in range(4000):
        a = rng.choice([rand_word(10), rng.choice(WORDS)])
        b = mutate(a) if rng.random() < 0.7 else rand_word(10)
        cases.append({"k": "match", "a": a, "b": b})
    for _ in range(40):  # autojunk path: b >= 200 code points
        a = "".join(rng.choice("abcde ") for _ in range(rng.randint(150, 300)))
        cases.append({"k": "match", "a": a, "b": mutate(a) + "".join(rng.choice("abcde") for _ in range(rng.randint(0, 60)))})
        cases.append({"k": "ratio", "a": a, "b": a[::-1] + "x" * 100})
    for _ in range(1500):
        a = rand_word(14)
        cases.append({"k": "ratio", "a": a, "b": mutate(a)})
    for _ in range(2000):
        n = rng.randint(0, 6)
        phrase = " ".join(rng.choice(WORDS + ["and", "hundred", "billion", "million", "‘tis", "sentinel’s", rand_word(6)]) for _ in range(n))
        cases.append({"k": "key", "w": phrase})
    cases.append({"k": "key", "w": " ".join(["hundred"] * 30)})  # Python int > 2**64
    cases.append({"k": "key", "w": "nine hundred ninety nine billion billion billion and one"})
    vocab = WORDS[:14] + ["sea", "night", "lamp"]
    for _ in range(1500):
        script = [rng.choice(vocab) for _ in range(rng.randint(0, 120))]
        anchor = rng.randint(0, len(script) + 5)
        off = rng.randint(0, max(0, len(script)))
        heard = [w if rng.random() < 0.8 else rng.choice(vocab + ["um"]) for w in script[off : off + rng.randint(0, 14)]]
        cases.append({"k": "locate", "heard": heard, "script": script, "anchor": anchor})
        cases.append({"k": "align", "heard": heard, "script": script, "anchor": anchor})
    with open(out, "w", encoding="utf-8") as fh:
        for c in cases:
            fh.write(json.dumps(c, sort_keys=True) + "\n")
    print(len(cases), "cases", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1])
