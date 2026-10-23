"""Fuzz the Go helpers against Python: float repr, str.isspace, and the tokenizer/sentence splitter.
Usage: selfcheck.py GO_BINARY"""
import json, random, struct, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: F401,E402
import compare as engine  # noqa: E402
from narration_common.spoken_forms import merge_number_words  # noqa: E402

go = sys.argv[1]
rng = random.Random(7)


def run(kind, text=""):
    return subprocess.run([go, "-selfcheck", kind], input=text, capture_output=True, text=True, check=True).stdout


floats = [0.0, 1.0, 0.5, 1 / 3, 2 / 3, 1e16, 1e15, 9999999999999998.0, 1e-4, 1e-5, 0.0001234, 123456789.125, 5e-324, 1.7976931348623157e308, -2.5]
floats += [rng.random() for _ in range(20000)] + [rng.randint(0, 500) / rng.randint(1, 500) for _ in range(20000)]
floats += [struct.unpack("<d", struct.pack("<Q", rng.getrandbits(64)))[0] for _ in range(20000)]
floats = [f for f in floats if f == f and abs(f) != float("inf")]
got = run("floats", "".join(repr(f) + "\n" for f in floats)).splitlines()
bad = [(f, g) for f, g in zip(floats, got) if repr(f) != g]
print(f"floats: {len(floats)} checked, {len(bad)} differ {bad[:3]}")

py_spaces = [c for c in range(0x110000) if chr(c).isspace()]
go_spaces = [int(x) for x in run("spaces").split()]
print(f"isspace: python {len(py_spaces)} code points, go {len(go_spaces)}, identical={py_spaces == go_spaces}")

alphabet = list("abcdefghij ABC 0123456789 ''`´‘’“”\"-—.,!?;:\t\n\x0b\x0c\x1c\x1f\x85\xa0 　éßİK")
words = ["Mr.", "Dr.", "st.", "one", "twenty", "three", "hundred", "and", "thousand", "billion", "you're", "Alice's", "it's", "there", "o'clock", "rabbit-hole", "uh", "...", "?!", "won't", "'s", "s'"]
texts = []
for _ in range(5000):
    parts = []
    for _ in range(rng.randint(0, 30)):
        parts.append(rng.choice(words) if rng.random() < 0.6 else "".join(rng.choice(alphabet) for _ in range(rng.randint(1, 6))))
        parts.append(rng.choice([" ", " ", "  ", "\n", " ", "\x1c", ". ", "! ", "? ", ".\x1c"]))
    texts.append("".join(parts))
got = run("text", "".join(json.dumps(t) + "\n" for t in texts)).split("\n")  # not splitlines(): it also splits on \x1c, \x85, \u2028
diff = 0
for t, g in zip(texts, got):
    toks, raws = engine.tokenize_with_raw(t)
    merged, mi = merge_number_words(toks, list(range(len(toks))))
    want = json.dumps({"tokens": toks, "raws": raws, "sentences": engine.split_sentences(t), "merged": merged, "merged_idx": mi}, sort_keys=True, ensure_ascii=False)
    if want != g:
        diff += 1
        if diff <= 2:
            print("DIFF", repr(t), "\n py", want, "\n go", g)
print(f"text: {len(texts)} fuzzed strings, {diff} differ")

import difflib  # noqa: E402

cases = []
for _ in range(3000):
    vocab = [f"w{k}" for k in range(rng.choice([2, 3, 5, 20, 200]))]
    na, nb = rng.choice([0, 1, 5, 50, 300]), rng.choice([0, 1, 5, 50, 300])
    a = [rng.choice(vocab) for _ in range(na)]
    b = [x for x in a if rng.random() > 0.1] if rng.random() < 0.5 else [rng.choice(vocab) for _ in range(nb)]
    cases.append({"A": a, "B": b, "Autojunk": rng.random() < 0.5})
got = run("opcodes", "".join(json.dumps(c) + "\n" for c in cases)).split("\n")
diff = sum(json.dumps([list(o) for o in difflib.SequenceMatcher(None, c["A"], c["B"], autojunk=c["Autojunk"]).get_opcodes()]) != g for c, g in zip(cases, got))
print(f"opcodes: {len(cases)} random sequence pairs (half autojunk=True, up to 300 tokens), {diff} differ")
