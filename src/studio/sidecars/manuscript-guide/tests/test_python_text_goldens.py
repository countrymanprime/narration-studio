"""What Python makes of text and JSON, pinned for the Go host, which reads and writes the files this sidecar's ``build`` writes.

The host runs every Story Bible edit itself (src/studio/desktop/internal/guide), so it has to treat a name and a value exactly as
Python does. Two files pin that:

* ``python-unicode.json``, next to the Go that embeds it: the Unicode data Python's ``re`` uses for ``\\b`` + name + ``\\b`` under
  ``re.IGNORECASE`` (``\\w``, ``str.isspace``, the simple lower-casing ``re`` uses, which characters ``re`` counts as cased, and its
  extra case pairs). The host searches the manuscript with this table, not Go's ``unicode`` package, so a Go upgrade cannot change
  which text matches. Python's Unicode version is in the file.
* ``merge-fingerprint-golden.json``: what ``json.dumps(value, sort_keys=True, ensure_ascii=False)`` makes of values with awkward
  numbers, text and key order, with its SHA-256 (the fingerprint a merge's undo record holds; a file written before the host ran merges
  holds the sidecar's), and what ``normalize_name``, ``entity_id`` and ``str.lower`` make of awkward names (a build's ids and absorbed
  names). ``TestPythonJSONMatchesTheGolden`` requires the host's encoder and name keys to produce the same.

Run with ``UPDATE_CONTRACTS=1`` to rewrite the files after a deliberate change.
"""

import _sre
import hashlib
import importlib.util
import json
import re
import unicodedata
import unittest
from pathlib import Path
from re import _casefix

from narration_common import contract_files

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)

GUIDE_DIR = Path(__file__).parents[5] / "src" / "studio" / "desktop" / "internal" / "guide"
TESTDATA = GUIDE_DIR / "testdata"

LAST_CODE_POINT = 0x10FFFF


def ranges(codes: list[int]) -> list[list[int]]:
    """Sorted code points as inclusive [first, last] runs."""
    runs: list[list[int]] = []
    for code in codes:
        if runs and runs[-1][1] == code - 1:
            runs[-1][1] = code
        else:
            runs.append([code, code])
    return runs


def unicode_tables() -> dict:
    everything = range(LAST_CODE_POINT + 1)
    return {
        "unidata_version": unicodedata.unidata_version,
        "word": ranges([code for code in everything if re.match(r"\w", chr(code))]),
        "space": ranges([code for code in everything if chr(code).isspace()]),
        "cased": ranges([code for code in everything if _sre.unicode_iscased(code)]),
        "lower": [[code, _sre.unicode_tolower(code)] for code in everything if _sre.unicode_tolower(code) != code],
        "extra_cases": sorted([code, list(others)] for code, others in _casefix._EXTRA_CASES.items()),
    }


VALUE_TEXTS = [
    "null",
    "true",
    "false",
    "0",
    "-0",
    "7",
    "-12",
    "12345678901234567890123",
    "1.0",
    "-0.0",
    "1.50",
    "0.1",
    "2.5e-3",
    "1e5",
    "1E+2",
    "0.0001",
    "0.00001",
    "1e-7",
    "123456789012345.6",
    "1234567890123456.0",
    "12345678901234567.0",
    "1e16",
    "1.5e16",
    "1e22",
    "5e-324",
    "1.7976931348623157e308",
    "1e999",
    "0.30000000000000004",
    '""',
    '"plain"',
    '"quote \\" backslash \\\\ slash / tab \\t newline \\n return \\r backspace \\b formfeed \\f"',
    '"\\u0000\\u0001\\u001f\\u007f"',
    '"é ß ﬁ 日本語 😀 \\u2028\\u2029 \\u00a0 \\ufeff"',
    '"\\ud83d\\ude00"',
    "[]",
    "{}",
    '[1, 1.0, true, null, "x", [], {}]',
    '{"b": 1, "a": 2, "é": 3, "z": 4, "\\uffff": 5, "\\ud83d\\ude00": 6, "": 7, "A": 8, "a ": 9}',
    '{"id": "e1", "relationships": [{"label": "friend", "id": "e2", "name": "Wren"}], "n": 1.5, "s": "Ωmega"}',
]

NAMES = [
    "Nicholas",
    "Nico-Rose O'Neil",
    "ΟΔΥΣΣΕΥΣ",
    "Οδυσσευς",
    "οδυσσευσ",
    "ΑΣ",
    "Σ",
    "ΑΣ.",
    "Σ'Α",
    "İstanbul",
    "i̇stanbul",
    "Kelvin K",
    "ǅ",
    "ß",
    "ẞ",
    "ﬁne",
    "Zoë 😀",
    "Zé",
    "Ἀθήνα",
    "",
    "  ",
    "Ⅳ",
    "ＡＢＣ１２３",
]


def fingerprint_golden() -> dict:
    values = []
    for text in VALUE_TEXTS:
        dumped = json.dumps(json.loads(text), sort_keys=True, ensure_ascii=False)
        values.append({"json": text, "python_json": dumped, "fingerprint": hashlib.sha256(dumped.encode("utf-8")).hexdigest()})
    names = [{"text": name, "lower": name.lower(), "normalized": guide.normalize_name(name), "entity_id": guide.entity_id(name)} for name in NAMES]
    return {"values": values, "names": names}


class PythonTextGoldenTests(unittest.TestCase):
    def test_the_unicode_tables_match_the_committed_file(self):
        contract_files.check("python-unicode", unicode_tables(), GUIDE_DIR)

    def test_the_fingerprint_golden_matches_what_python_makes(self):
        contract_files.check("merge-fingerprint-golden", fingerprint_golden(), TESTDATA)


if __name__ == "__main__":
    unittest.main()
