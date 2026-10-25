"""The host's Python-compatible text rules (src/studio/desktop/internal/compare) are held to this Python's.

- The Unicode tables in `pyunicode_gen.go` must be what `scripts/dev/gen-pyunicode.py` writes from this Python.
- `tests/fixtures/booth-parity/text-rules.json` holds Python's answers: a digest of `str.lower`, `str.casefold`, `\\w`,
  `str.isspace` and `str.isprintable` over every code point (lowercase alone, between "A" and a capital sigma, before
  "Σa" and after "AΣ", so both sides of the final-sigma rule are exercised for each), and `spoken_key` and `repr` over
  seeded text. `compare/pyunicode_test.go` reproduces it.
  Regenerate with `UPDATE_CONTRACTS=1` only when a rule changes on purpose, and say why in the PR.
"""

import hashlib
import json
import os
import random
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

from narration_common import spoken_forms

ROOT = Path(__file__).resolve().parents[5]
GOLDEN = ROOT / "tests" / "fixtures" / "booth-parity" / "text-rules.json"
WORD = re.compile(r"\w")


def code_points():
    for c in range(0x110000):
        if not 0xD800 <= c <= 0xDFFF:
            yield chr(c)


def digest(parts):
    h = hashlib.sha256()
    for part in parts:
        h.update(part.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


WORDS = ["twenty", "three", "one", "hundred", "and", "five", "daisy", "chain", "o", "clock", "there", "their", "they're", "Ada's",
         "sentinel's", "o'clock", "daisy-chain", "23", "Mr.", "ΣΟΦΙΑΣ", "İstanbul", "naïve", "‘quoted’", "billion", "x\x1cy", "—", "a"]  # fmt: skip


REPR_PIECES = ["a", "'", '"', "\\", "\t", "\n", "\r", "\x00", "\x1f", "\x7f", "\x85", "\xa0", "\xad", "é", "\u2028", "\u200b",
               "\ufeff", "\U0001f600", "\U000e0001", "\U0010ffff", "Σ", " ", "\u0378", "\ue000"]  # fmt: skip


def reprs(rng):
    """Text for repr: every piece alone, then seeded mixes, so each quote choice and escape form appears."""
    return REPR_PIECES + ["".join(rng.choice(REPR_PIECES) for _ in range(rng.randint(0, 6))) for _ in range(200)]


def rules():
    rng = random.Random(2251)
    texts = [" ".join(rng.choice(WORDS) for _ in range(rng.randint(0, 8))) for _ in range(300)] + ["", "billion " * 12]
    return {
        "unicode": unicodedata.unidata_version,
        "lower": digest(p for ch in code_points() for p in (ch.lower(), ("A" + ch + "Σ").lower(), (ch + "Σa").lower(), ("AΣ" + ch).lower())),
        "word": digest("1" if WORD.match(ch) else "0" for ch in code_points()),
        "space": digest("1" if ch.isspace() else "0" for ch in code_points()),
        "casefold": digest(ch.casefold() for ch in code_points()),
        "printable": digest("1" if ch.isprintable() else "0" for ch in code_points()),
        "spokenKey": [[text, spoken_forms.spoken_key(text)] for text in texts],
        "repr": [[text, repr(text)] for text in reprs(rng)],
    }


def test_the_generated_tables_are_this_pythons():
    completed = subprocess.run([sys.executable, str(ROOT / "scripts" / "dev" / "gen-pyunicode.py"), "--check"], capture_output=True, text=True, check=False)
    assert completed.returncode == 0, completed.stderr


def test_the_text_rules_fixture_is_this_pythons():
    rendered = json.dumps(rules(), ensure_ascii=False, indent=1) + "\n"
    if os.environ.get("UPDATE_CONTRACTS"):
        GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        GOLDEN.write_text(rendered, encoding="utf-8", newline="\n")
    assert GOLDEN.is_file(), f"no {GOLDEN}: run with UPDATE_CONTRACTS=1 and commit it"
    assert rendered == GOLDEN.read_text(encoding="utf-8")
