"""Generates the seeded inputs both drivers read:
  fuzz_pairs.json  2000 token-list pairs for the difflib check (+ py_fuzz.out, Python's opcodes/ratio)
  stress.json      600 random takes with edits and semantic traps (unicode spaces, curly quotes,
                   number runs incl. a 'hundred' x12 int64 overflow, hyphen splits, fillers, odd offsets)
  bench_long.json  one ~10,000-word span (coverage manuscript repeated) vs a ~5%-edited transcript
usage: gen.py OUTDIR
"""
import difflib
import json
import random
import sys
from pathlib import Path

TC = Path("/home/user/narration-studio/sidecars/transcript-compare")
out = Path(sys.argv[1])

def dump(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))

# ---------------------------------------------------------------- difflib fuzz
rng = random.Random(20261023)
pairs = []
for n in range(2000):
    vocab = [f"w{k}" for k in range(rng.choice([2, 3, 5, 10, 30, 200]))]
    la = rng.choice([0, 1, 2, 5, 20, 50, 150, 199, 200, 201, 250, 400, 700])
    a = [rng.choice(vocab) for _ in range(la)]
    if rng.random() < 0.6:  # b as an edit of a
        b = []
        for t in a:
            r = rng.random()
            if r < 0.05:
                continue
            if r < 0.10:
                b.append(rng.choice(vocab))
            elif r < 0.13:
                b.extend([t, t])
            else:
                b.append(t)
            if rng.random() < 0.03:
                b.append(rng.choice(vocab))
        if rng.random() < 0.3:  # make one token very popular
            b = [t if rng.random() < 0.7 else "pop" for t in b]
    else:
        b = [rng.choice(vocab) for _ in range(rng.choice([0, 3, 30, 199, 200, 201, 300, 600]))]
    autojunk = n % 2 == 0
    pairs.append([a, b, autojunk])
(out / "fuzz_pairs.json").write_text(json.dumps(pairs), encoding="utf-8")
lines = []
for a, b, aj in pairs:
    sm = difflib.SequenceMatcher(None, a, b, autojunk=aj)
    lines.append(dump([[list(o) for o in sm.get_opcodes()], sm.ratio()]))
(out / "py_fuzz.out").write_text("".join(l + "\n" for l in lines), encoding="utf-8")
print("autojunk pairs with popular elements:",
      sum(1 for a, b, aj in pairs if aj and difflib.SequenceMatcher(None, a, b, autojunk=True).bpopular))

# ---------------------------------------------------------------- stress takes
cases = json.loads((TC / "tests/fixtures/divergence/cases.json").read_text(encoding="utf-8"))
ms = json.loads((TC / "tests/fixtures/coverage/manuscript.json").read_text(encoding="utf-8"))
traps = [
    "Mr. Smith met Dr. Jones at St. Paul’s. It’s late! Is it? Yes. No. Then\x1cthere\x1fwas　more.",
    "She counted one hundred hundred hundred hundred hundred hundred hundred hundred hundred hundred hundred hundred sheep. Then twenty-three, forty two and one thousand and five.",
    "The super-powered “sentinel’s” tale—a whole hour—was told aloud at night. Their knight knew no peace.",
    "Uh, so, um, the ``quoted´´ word and the ‛odd‟ ones „here” are folded. Line two. Para two.",
]
paragraphs = list(cases["paragraphs"]) + [p["text"] for p in ms["paragraphs"]] + traps

import importlib.util
sys.path.insert(0, str(TC / "core"))
spec = importlib.util.spec_from_file_location("cmp", TC / "core/compare.py")
engine = importlib.util.module_from_spec(spec); spec.loader.exec_module(engine)
units = engine.build_sentence_units(paragraphs)
nunits = len(units)
EXTRA_WORDS = ["uh", "um", "the", "and", "sitter", "23", "twenty", "three", "so", "well", "Alice", "hmm", "no", "know", "super", "powered"]
SPACES = [" ", " ", " ", " ", " ", "\x1c"]
OFFSETS = [0.0, 1234.567, 0.0005, 2.675, 1e16, 123456789.0005, 1e-7, 7.0, 0.1, 3600.0004999]

def edit_words(words, rate, rng):
    said = []
    for w in words:
        r = rng.random()
        if r < rate * 0.3:
            continue  # skip
        if r < rate * 0.6:
            said.append(rng.choice(EXTRA_WORDS))  # substitute
            continue
        if r < rate * 0.8:
            said.extend([w, w])  # stutter
            continue
        said.append(w)
        if rng.random() < rate * 0.2:
            said.append(rng.choice(EXTRA_WORDS))
    return said

def timed(said, rng, decimals):
    clock = rng.uniform(0, 2)
    words = []
    for w in said:
        start = clock + rng.uniform(-0.05, 0.05)
        end = start + rng.uniform(0.05, 0.6)
        if decimals is not None:
            start, end = round(start, decimals), round(end, decimals)
        text = rng.choice(SPACES) + w + rng.choice(SPACES) if rng.random() < 0.2 else w
        words.append([text, start, end])
        clock += rng.uniform(0.2, 0.7)
    return words

srng = random.Random(7)
jobs = []
for n in range(150):
    first = srng.randrange(nunits)
    last = min(nunits - 1, first + srng.choice([0, 0, 1, 2, 4]))
    try:
        span_words = [w.text for w in __import__("take_divergence").build_span(engine, paragraphs, first, last).words]
    except ValueError:
        continue
    takes = []
    for t in range(4):
        rate = srng.choice([0.0, 0.05, 0.15, 0.4])
        said = edit_words(span_words, rate, srng)
        if srng.random() < 0.2:
            said = said[srng.randrange(len(said) + 1):]  # starts late
        if srng.random() < 0.2:
            said = said[: srng.randrange(len(said) + 1)]  # stops early
        if srng.random() < 0.2:
            said = ["um", "so", "take", "two"] + said
        takes.append({"offset": srng.choice(OFFSETS), "words": timed(said, srng, srng.choice([None, 3, 2]))})
    jobs.append({"id": f"stress-{n}", "first": first, "last": last, "takes": takes})
(out / "stress.json").write_text(json.dumps({"paragraphs": paragraphs, "jobs": jobs}, ensure_ascii=False), encoding="utf-8")
print("stress jobs:", len(jobs), "takes:", sum(len(j["takes"]) for j in jobs))

# ---------------------------------------------------------------- long bench take
brng = random.Random(11)
base = [p["text"] for p in ms["paragraphs"]]
long_pars = []
while sum(len(p.split()) for p in long_pars) < 10000:
    long_pars.extend(base)
lunits = engine.build_sentence_units(long_pars)
import take_divergence as td
span = td.build_span(engine, long_pars, 0, len(lunits) - 1)
said = edit_words([w.text for w in span.words], 0.05, brng)
words = timed(said, brng, 3)
(out / "bench_long.json").write_text(json.dumps({"paragraphs": long_pars, "jobs": [{"id": "long", "first": 0, "last": len(lunits) - 1, "takes": [{"offset": 1234.567, "words": words}]}]}, ensure_ascii=False), encoding="utf-8")
print("long span words:", len(span.words), "transcript words:", len(words), "units:", len(lunits))

# ---------------------------------------------------------------- long bench take, non-repeating text
raw = Path("/home/user/narration-studio/tests/fixtures/alice_raw.txt").read_text(encoding="utf-8")
blocks = [" ".join(b.split()) for b in raw.split("\n\n") if b.strip()]
start = next(i for i, b in enumerate(blocks) if b.startswith("Alice was beginning"))
pars = []
for b in blocks[start:]:
    pars.append(b)
    if sum(len(p.split()) for p in pars) >= 10000:
        break
aunits = engine.build_sentence_units(pars)
span = td.build_span(engine, pars, 0, len(aunits) - 1)
said = edit_words([w.text for w in span.words], 0.05, random.Random(13))
words = timed(said, random.Random(17), 3)
(out / "bench_alice.json").write_text(json.dumps({"paragraphs": pars, "jobs": [{"id": "alice", "first": 0, "last": len(aunits) - 1, "takes": [{"offset": 1234.567, "words": words}]}]}, ensure_ascii=False), encoding="utf-8")
print("alice span words:", len(span.words), "transcript words:", len(words), "units:", len(aunits))
