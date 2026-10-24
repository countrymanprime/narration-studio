"""Python's own answers for the text rules the host's port (`src/studio/desktop/internal/compare`) must reproduce.

A seeded set of inputs (Unicode spaces, the information separators Python counts as space, curly quotes, numbers said as words,
homophones, abbreviations, letters newer than Python's Unicode tables) and what compare.py, narration_common.spoken_forms, difflib,
`str.lower`, `round`, `sum` and `repr` make of each. `compare_test.go` reads the same file and must agree. Regenerate with
`UPDATE_CONTRACTS=1` only when a Python rule changes on purpose, and say why in the PR."""

import difflib
import importlib.util
import json
import os
import random
import sys
from pathlib import Path

CORE = Path(__file__).resolve().parents[1] / "core"
SPEC = importlib.util.spec_from_file_location("transcript_compare_go_parity", CORE / "compare.py")
compare = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = compare
SPEC.loader.exec_module(compare)

GOLDEN_PATH = Path(__file__).resolve().parents[5] / "tests" / "fixtures" / "compare-parity" / "cases.json"

WORDS = [
    "the",
    "and",
    "a",
    "of",
    "Alice",
    "rabbit",
    "their",
    "there",
    "they're",
    "your",
    "you're",
    "it's",
    "its",
    "sentinel's",
    "sentinels",
    "notebook",
    "note-book",
    "super-powered",
    "twenty",
    "three",
    "hundred",
    "and",
    "one",
    "thousand",
    "billion",
    "forty-two",
    "1999",
    "7th",
    "Mr.",
    "Dr.",
    "St.",
    "Mrs.",
    "Wonderland!",
    "Really?",
    "Yes.",
    "‘quoted’",
    "“double”",
    "don't",
    "can't",
    "café",
    "naïve",
    "ΣΟΦΙΑΣ",
    "İstanbul",
    "x-ray",
    "uh",
    "um",
    "...",
]
SPACES = (" ", " ", " ", "  ", "\t", "\n", " ", " ", "　", "\x1c", "\x1f", " ", "\u0085")
LOWER = ("Alice", "ΣΟΦΙΑΣ", "ΣΑΣ Σ", "İstanbul", "ÀÉÎ", "ꟋꟌ", "\U00010d50x", "ὈΔΥΣΣΕΎΣ", "AΣ.", "aΣb", "ǅ")


def _text(rng, n):
    out = ""
    for _ in range(n):
        out += rng.choice(WORDS) + rng.choice(SPACES)
    return out.strip(rng.choice(("", " ", " ")))


EQUIVALENCES = "Alice, Alyce # a name\r\nΣΟΦΙΑΣ, sofia\n\n x \nİ, i\x1c,  j\n"


def _cases(equivalences: Path):
    equivalences.write_bytes(EQUIVALENCES.encode("utf-8"))
    rng = random.Random(2251)
    texts = [_text(rng, rng.randint(0, 30)) for _ in range(60)] + ["", "   ", "Mr. Smith went. Dr. No! St. Ives?", "one hundred and five"]
    tokens = [compare.tokenize(text) for text in texts]
    merged = []
    for toks in tokens:
        out, index = compare.merge_number_words(toks, list(range(len(toks))))
        merged.append([out, index])
    pairs = []
    for _ in range(40):
        a = [rng.choice("abcdefg") for _ in range(rng.randint(0, 40))]
        b = [rng.choice("abcdefg") for _ in range(rng.randint(0, 260))]
        autojunk = rng.random() < 0.5
        matcher = difflib.SequenceMatcher(None, a, b, autojunk=autojunk)
        pairs.append({"a": "".join(a), "b": "".join(b), "autojunk": autojunk, "opcodes": [list(op) for op in matcher.get_opcodes()], "ratio": matcher.ratio()})
    floats = [0.0, -0.0, 1.0, 0.1, 1e-5, 1.5e-4, 12345.678, 1e16, 1.2345e16, 123456789012345.6, 2.675, 0.3 * 3, 1e300, -2.5e-7]
    sums = [[0.1] * 10, [1e16, 1.0, -1e16], [83.2], [0.3, 0.6, 0.1], []]
    chapter = {"title": "Chapter Twenty-Three: Mr. Smith", "paragraphs": texts[:6]}
    units, chapter_tokens, unit_idx, raw_words = compare.build_chapter_units(chapter)
    return {
        "texts": texts,
        "tokenize": tokens,
        "tokenizeWithRaw": [list(compare.tokenize_with_raw(text)) for text in texts],
        "splitSentences": [compare.split_sentences(text) for text in texts],
        "mergeNumberWords": merged,
        "split": [text.split() for text in texts],
        "strip": [text.strip() for text in texts],
        "chapter": {
            "title": chapter["title"],
            "paragraphs": chapter["paragraphs"],
            "units": [list(unit) for unit in units],
            "tokens": chapter_tokens,
            "unitIdx": unit_idx,
            "rawWords": raw_words,
        },
        "equivalences": {"text": EQUIVALENCES, "groups": [list(group) for group in compare.load_equivalence_groups(str(equivalences))]},
        "lower": [[text, text.lower()] for text in LOWER],
        "difflib": pairs,
        "floatRepr": [[value, repr(value)] for value in floats],
        "round3": [[value, repr(round(value, 3))] for value in floats + [2.0005, 2.0015, 0.0005, -0.0004]],
        "sum": [[values, repr(sum(values))] for values in sums],
    }


def test_the_go_port_reads_python_s_own_answers(tmp_path):
    cases = _cases(tmp_path / "equivalences.csv")
    rendered = "{\n" + ",\n".join(f"{json.dumps(key)}: {json.dumps(value, ensure_ascii=False)}" for key, value in cases.items()) + "\n}\n"
    if os.environ.get("UPDATE_CONTRACTS"):
        GOLDEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        GOLDEN_PATH.write_text(rendered, encoding="utf-8", newline="\n")
    assert GOLDEN_PATH.is_file(), f"no {GOLDEN_PATH}: run this test with UPDATE_CONTRACTS=1 and commit it"
    assert rendered == GOLDEN_PATH.read_text(encoding="utf-8")
