"""What the sidecar's `rescan` and `status` do, and how it finds a name in the manuscript, recorded for the Go host to replay.

The host runs both itself (apps/desktop/internal/guide/rescan.go and occurrences.go), so each has two implementations. The part that
cannot drift is the search: ``find_occurrences`` is ``\\b`` + ``re.escape(name.strip())`` + ``\\b`` under ``re.IGNORECASE``, so what is a
word character, which letters are the same letter, what ``strip`` removes and where a code point index falls are all Python's, and the
excerpts it stores are cut by code point. Four files pin them:

* ``python-unicode.json``, next to the Go that embeds it: the Unicode data that search uses (``\\w``, ``str.isspace``, the simple
  lower-casing ``re`` uses, which characters ``re`` counts as cased, and its extra case pairs). The host reads this table, not Go's
  ``unicode`` package, so a Go upgrade cannot change which text matches. Python's Unicode version is in the file.
* ``occurrence-parity.json``: ``find_occurrences`` over paragraphs of awkward text (non-ASCII, emoji, right-to-left, combining marks,
  very long paragraphs, overlapping matches, names at the start and end of a paragraph, characters the pattern language treats
  specially), and a sweep that asks, for every character ``re`` folds, which characters of that set it matches.
* ``rescan-manuscript.json``: a manuscript in the shape the importer writes (chapters of every content kind, ids, titles, sections),
  generated here from a fixed seed.
* ``rescan-parity.json``: ``rescan`` and ``status`` cases. A rescan case is a start file and steps; every step runs the real command on
  the file the step before left and records whether it wrote and what the file then holds, or the reason it refused. ``TestRescansMatchThe
  SidecarCases`` replays each case twice, as a chain on the host's own writes and step by step on the sidecar's file.

Run with ``UPDATE_CONTRACTS=1`` to rewrite the files after a deliberate change.
"""

import _sre
import argparse
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import random
import re
import tempfile
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

GUIDE_DIR = Path(__file__).parents[3] / "apps" / "desktop" / "internal" / "guide"
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


def paragraph(index: int, text: str, chapter: str = "") -> dict:
    chapter = chapter or f"Chapter {index // 3 + 1}"
    return {"chapter": chapter, "chapterId": f"c-{index // 3 + 1:04d}", "paragraphId": f"p-{index + 1:06d}", "text": text}


LONG_FILLER = "The rain kept on over the hills and nobody on the road said a word about it. "
LONG_NO_SPACE = "x" * 400

# name -> the paragraphs it is searched in (the same set is searched for several names).
PARAGRAPH_SETS: dict[str, list[str]] = {
    "plain": [
        "Nicholas sat down. Then nicholas stood, and NICHOLAS laughed.",
        "Nick's hat, Nicks hat, nick-name, Nick_2, 2Nick, Nick.",
        "Nick",
        "a Nick",
        "Nick ran; Nick sat. (Nick) [Nick] {Nick} “Nick” 'Nick' Nick!",
        "",
        "   ",
        "Banana ana ANA ana. Anana.",
        "aa aaa aa a a a a",
        "Nicholas\nNicholas\r\nNicholas\tNicholas",
    ],
    "specials": [
        "C++ is a language. C++, C+++ and c++! Say c++",
        "Dr. Who? dr. who? Dr. Who",
        "(Bob) and (bob), bob) (bob",
        "a|b a b a|b|c",
        "[x] x [X] [x]x",
        "back\\slash and Back\\Slash and back/slash",
        "cost $5 ^caret^ 5$ ^caret",
        ". * + ? . dot",
        "tab\there tab\there",
        "Mr. O'Neil, mr. o'neil; O’Neil with a curly quote; O'Neil's",
        "x-ray X-Ray xray",
    ],
    "unicode": [
        "Zoë and ZOË and zoë and Zoë and Zoe and ZOË.",
        "École, ÉCOLE, école, École, Ecole.",
        "Οδυσσευς, ΟΔΥΣΣΕΥΣ, οδυσσευσ, Οδυσσευσ, οδυσσευς.",
        "Ὀδυσσεύς and ὀδυσσεύς and ὈΔΥΣΣΕΎΣ.",
        "İstanbul, istanbul, ISTANBUL, Istanbul, ıstanbul, i̇stanbul.",
        "Kelvin K, kelvin k, KELVIN K. 5 K 5K",
        "Weiß, WEISS, weiss, WEIẞ, Weiß!",
        "ﬁne fine ﬁne FINE. ǅungla ǆungla ǄUNGLA Ǆungla.",
        "Иван, ИВАН, иван; Іван.",
        "Straße STRASSE strasse",
        "ſoft Soft SOFT soft",
        "田中さん. 田中 さん. 田中、さん. 田中。",
        "Ⅳ iv Ⅳ. ⅳ Ⅳth ⅣⅣ ²x x² ½ 1½",
        "ＡＢＣ１２３ ａｂｃ１２３ ABC123",
        "Ⓐ ⓐ Ⓑ A",
        "µ μ Μ ΜΥ μυ",
        "ΑΣ ας Ας ΑΣ. aς",
        "Ǆ ǅ ǆ ǆǆ ǅǅ",
    ],
    "emoji": [
        "Zoë 😀x and zoë 😀X and Zoë 😀 and 😀.",
        "😀😀😀 Wren 😀😀😀 wren 😀",
        "👨‍👩‍👧‍👦 Wren 👨‍👩‍👧‍👦",
        "🇫🇷 Wren 🇩🇪 WREN 🇯🇵",
        "𝐖𝐫𝐞𝐧 Wren 𝕎𝕣𝕖𝕟 𠀀Wren𠀀 𠀀 Wren",
        "😀" * 400 + " Wren " + "😀" * 400,
        "Wren" + "😀" * 200,
        "😀" * 200 + "Wren",
    ],
    "rtl": [
        "שלום דוד! דוד אמר שלום. דודי דוד",
        "قال محمد ثم محمّد وقال مُحَمَّد",
        "\u200fדוד\u200f and \u200eדוד\u200e and \u202bדוד\u202c",
        "ابتسم  محمد.",
        "דוד" * 3 + " דוד" + "דוד ",
        "Wren said דוד and דוד said Wren. דוד Wren דוד",
    ],
    "long": [
        "Wren " + LONG_FILLER * 60,
        LONG_FILLER * 60 + "Wren",
        LONG_FILLER * 3 + "Wren" + LONG_FILLER * 3,
        "x" * 149 + "Wren" + "y" * 149,
        "x" * 150 + " Wren " + "y" * 150,
        "x" * 151 + " Wren " + "y" * 151,
        "x" * 149 + " Wren " + "y" * 148,
        "x" * 149 + " Wren " + "y" * 149,
        "x" * 149 + " Wren " + "y" * 150,
        ("a " * 40) + "Wren" + (" b" * 40),
        LONG_NO_SPACE + "Wren" + LONG_NO_SPACE,
        "Wren " * 40,
        "   　\n\t Wren \x1c\x1d\x1e\x1f  \u0085 ",
        "　" * 200 + "Wren" + " " * 200,
        " " * 160 + "Wren" + " " * 160,
        "é" * 300 + " Wren " + "é" * 300,
    ],
}

# (set, name)
OCCURRENCE_CASES: list[tuple[str, str]] = [
    ("plain", "Nick"),
    ("plain", "nick"),
    ("plain", "NICHOLAS"),
    ("plain", "  Nicholas \n"),
    ("plain", " Nick　"),
    ("plain", "ana"),
    ("plain", "Ana"),
    ("plain", "aa"),
    ("plain", "a"),
    ("plain", "a a"),
    ("plain", "Nick Nick"),
    ("plain", "Nicholas Nicholas"),
    ("plain", ""),
    ("plain", "   "),
    ("plain", "\u200b"),
    ("plain", "nobody here"),
    ("specials", "C++"),
    ("specials", "c+"),
    ("specials", "Dr. Who?"),
    ("specials", "Dr."),
    ("specials", "(Bob)"),
    ("specials", "Bob)"),
    ("specials", "(bob"),
    ("specials", "a|b"),
    ("specials", "[x]"),
    ("specials", "x"),
    ("specials", "back\\slash"),
    ("specials", "$5"),
    ("specials", "5$"),
    ("specials", "^caret"),
    ("specials", "."),
    ("specials", "?"),
    ("specials", "tab\there"),
    ("specials", "O'Neil"),
    ("specials", "O’Neil"),
    ("specials", "Mr. O'Neil"),
    ("specials", "x-ray"),
    ("specials", "-ray"),
    ("unicode", "Zoë"),
    ("unicode", "ZOË"),
    ("unicode", "Zoe"),
    ("unicode", "Zoë"),
    ("unicode", "École"),
    ("unicode", "ecole"),
    ("unicode", "École"),
    ("unicode", "Οδυσσευς"),
    ("unicode", "ΟΔΥΣΣΕΥΣ"),
    ("unicode", "οδυσσευσ"),
    ("unicode", "Ὀδυσσεύς"),
    ("unicode", "İstanbul"),
    ("unicode", "istanbul"),
    ("unicode", "ISTANBUL"),
    ("unicode", "ıstanbul"),
    ("unicode", "i̇stanbul"),
    ("unicode", "Kelvin K"),
    ("unicode", "k"),
    ("unicode", "K"),
    ("unicode", "Weiß"),
    ("unicode", "WEISS"),
    ("unicode", "WEIẞ"),
    ("unicode", "ß"),
    ("unicode", "ẞ"),
    ("unicode", "fine"),
    ("unicode", "ﬁne"),
    ("unicode", "ǅungla"),
    ("unicode", "Ǆungla"),
    ("unicode", "Иван"),
    ("unicode", "Ivan"),
    ("unicode", "Straße"),
    ("unicode", "soft"),
    ("unicode", "ſoft"),
    ("unicode", "田中"),
    ("unicode", "田中さん"),
    ("unicode", "さん"),
    ("unicode", "Ⅳ"),
    ("unicode", "ⅳ"),
    ("unicode", "iv"),
    ("unicode", "²"),
    ("unicode", "½"),
    ("unicode", "ABC123"),
    ("unicode", "ａｂｃ１２３"),
    ("unicode", "Ⓐ"),
    ("unicode", "μ"),
    ("unicode", "µ"),
    ("unicode", "ΜΥ"),
    ("unicode", "ΑΣ"),
    ("unicode", "ας"),
    ("unicode", "Ǆ"),
    ("emoji", "Wren"),
    ("emoji", "wren"),
    ("emoji", "Zoë 😀"),
    ("emoji", "Zoë 😀x"),
    ("emoji", "😀"),
    ("emoji", "😀 Wren"),
    ("emoji", "Wren 😀"),
    ("emoji", "𝐖𝐫𝐞𝐧"),
    ("emoji", "𠀀Wren𠀀"),
    ("emoji", "👨‍👩‍👧‍👦 Wren"),
    ("emoji", "🇫🇷 Wren 🇩🇪"),
    ("rtl", "דוד"),
    ("rtl", "דודי"),
    ("rtl", "محمد"),
    ("rtl", "مُحَمَّد"),
    ("rtl", "Wren"),
    ("rtl", "דוד Wren"),
    ("rtl", "Wren said דוד"),
    ("long", "Wren"),
    ("long", "wren"),
    ("long", "  Wren  "),
    ("long", "Wren Wren"),
]


def chapter_of(index: int) -> str:
    return f"Chapter {index // 3 + 1}"


def occurrences_for(set_name: str, name: str) -> list[dict]:
    paragraphs = [paragraph(index, text) for index, text in enumerate(PARAGRAPH_SETS[set_name])]
    return guide.find_occurrences(paragraphs, name)


def fold_universe() -> list[int]:
    """Every character `re` treats as having a case, the characters it adds as case pairs, what they lower-case to, and the ASCII letters."""
    codes: set[int] = set(range(ord("A"), ord("Z") + 1)) | set(range(ord("a"), ord("z") + 1))
    codes.update(code for code in range(LAST_CODE_POINT + 1) if _sre.unicode_iscased(code))
    for code, others in _casefix._EXTRA_CASES.items():
        codes.add(code)
        codes.update(others)
    codes.update(_sre.unicode_tolower(code) for code in list(codes))
    return sorted(code for code in codes if not 0xD800 <= code <= 0xDFFF)


def fold_sweep() -> dict:
    """For each character c of the universe: the universe characters that ``\\bxcx\\b`` (ignoring case) matches in "x?x", c itself included.

    The letter x on both sides keeps a character that is not a word character (a circled letter) from being ruled out by the word edge.
    Only the characters that match something other than themselves are written; every other one matches itself alone.
    """
    universe = fold_universe()
    text = " ".join("x" + chr(code) + "x" for code in universe)
    starts = {}
    position = 0
    for code in universe:
        starts[position + 1] = code
        position += 4
    rows = []
    for code in universe:
        pattern = re.compile(r"\bx" + re.escape(chr(code)) + r"x\b", re.IGNORECASE)
        found = [starts[match.start() + 1] for match in pattern.finditer(text)]
        if found != [code]:
            rows.append([code, found])
    return {"universe": ranges(universe), "matches": rows}


def occurrence_golden() -> dict:
    cases = []
    for set_name, name in OCCURRENCE_CASES:
        cases.append({"set": set_name, "name": name, "occurrences": occurrences_for(set_name, name)})
    return {
        "sets": {name: [paragraph(index, text) for index, text in enumerate(texts)] for name, texts in PARAGRAPH_SETS.items()},
        "cases": cases,
        "fold_sweep": fold_sweep(),
    }


# ---- A manuscript in the importer's shape -------------------------------------------------------------------------------------------

SENTENCES = [
    "The rain kept on over the hills and nobody on the road said a word about it.",
    "{n} looked at the door, then at the window, and then back at the door.",
    "It was late, and the lamp had burned down to a thumb of light.",
    '"We should go," said {n}. "Before the others wake."',
    "Nothing in the house had changed since the spring, except the clock, which {n} had stopped.",
    "Somebody had left a cup on the sill; it was still warm.",
    "{n}'s hands shook. {n} put them in a pocket and kept walking.",
    "The village of Ashgrove lay below them, and Ashgrove was quiet.",
    "Mrs. O'Neil had said so, and Mrs. O'Neil was never wrong about weather.",
    '"Zoë?" "Zoë." The two of them laughed until the dog barked.',
    "An old song went round in {n}'s head: something about a ship and a very long winter.",
    "She wrote it down: Οδυσσευς, then ΟΔΥΣΣΕΥΣ in capitals, then the lower-case form.",
    "שלום, אמר דוד. \u200fדוד חייך ושתק.",
    "قال محمد: لن نعود. ثم صمت محمد.",
    "A boy in the street shouted 😀 and ran, and {n} shouted back 😀😀.",
    "École, école, ÉCOLE: the sign said all three, and nobody minded.",
    "Istanbul, İstanbul and ISTANBUL were all the same city to the postman.",
    "田中さん said hello. 田中 said it again.",
    "At the end of the road there was a gate, and at the gate there was {n}.",
]

STAND_INS = ["the old man", "her brother", "the girl", "somebody", "the miller", "they"]
NAMES = ["Nicholas", "Nick", "Wren", "Zoë", "Mrs. O'Neil", "Ashgrove", "Οδυσσευς", "דוד", "محمد", "Ana", "Kelvin K"]


def make_paragraph(rng: random.Random) -> str:
    kind = rng.random()
    count = 1 if kind < 0.25 else rng.randint(2, 6) if kind < 0.95 else rng.randint(30, 70)
    parts = [rng.choice(SENTENCES).format(n=rng.choice(NAMES) if rng.random() < 0.2 else rng.choice(STAND_INS)) for _ in range(count)]
    if rng.random() < 0.05:
        parts.insert(0, rng.choice(NAMES))
    if rng.random() < 0.05:
        parts.append(rng.choice(NAMES))
    return " ".join(parts)


def real_manuscript() -> dict:
    rng = random.Random(20261018)
    chapters, paragraphs = [], []
    kinds = ["opening", "narration"] * 1 + ["narration"] * 20 + ["reference"]
    for index, kind in enumerate(kinds):
        chapter_id = f"c-{index + 1:04d}"
        title = f"Chapter {index}" if kind == "narration" else {"opening": "Front matter", "reference": "Appendix"}[kind]
        chapters.append({"id": chapter_id, "title": title, "subtitle": "", "index": index, "wordCount": 0, "contentKind": kind, "sections": []})
        for _ in range(rng.randint(10, 18)):
            number = len(paragraphs)
            paragraphs.append(
                {
                    "id": f"p-{number + 1:06d}",
                    "index": number,
                    "chapterId": chapter_id,
                    "chapterTitle": title,
                    "sectionId": None,
                    "text": make_paragraph(rng),
                    "sourceIndex": number,
                }
            )
    return {
        "schemaVersion": 1,
        "documentId": "doc-rescan-parity",
        "importedAt": "2026-10-18T00:00:00Z",
        "importer": {"format": "markdown", "version": 1},
        "source": {"fileName": "book.md", "sha256": "0" * 64, "storedPath": "source/book.md"},
        "chapters": chapters,
        "paragraphs": paragraphs,
    }


def small_manuscript(*chapters: tuple[str, str | None, list[str]]) -> dict:
    """A manuscript of (title, content kind or None for the default, paragraph texts) chapters."""
    out_chapters, out_paragraphs = [], []
    for index, (title, kind, texts) in enumerate(chapters):
        chapter_id = f"c-{index + 1:04d}"
        chapter = {"id": chapter_id, "title": title}
        if kind is not None:
            chapter["contentKind"] = kind
        out_chapters.append(chapter)
        for text in texts:
            number = len(out_paragraphs)
            out_paragraphs.append({"id": f"p-{number + 1:06d}", "chapterId": chapter_id, "chapterTitle": title, "text": text})
    return {"schemaVersion": 1, "documentId": "doc-small", "chapters": out_chapters, "paragraphs": out_paragraphs}


def as_text(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


MANUSCRIPTS: dict = {
    "real": {"file": "rescan-manuscript.json"},
    "small": as_text(
        small_manuscript(
            ("One", None, ["Ann met Annie at the gate.", "Nobody else came.", "Zoë 😀x waved."]),
            ("Notes", "reference", ["Ann is mentioned here only to be skipped."]),
            ("Two", "narration", ["ANN left. Ann came back. ann sat."]),
        )
    ),
    "all-reference": as_text(small_manuscript(("Notes", "reference", ["Ann."]), ("Credits", "opening", ["Ann."]))),
    "no-paragraphs": as_text(small_manuscript(("One", None, []))),
    "changed": as_text(small_manuscript(("One", None, ["Ann met Annie at the gate.", "Ann stayed."]), ("Two", None, ["Nobody."]))),
    "wrong-schema": as_text({**small_manuscript(("One", None, ["Ann."])), "schemaVersion": 2}),
    "bad-paragraph": as_text(
        {**small_manuscript(("One", None, ["Ann."])), "paragraphs": [{"id": "p-1", "chapterId": "c-9999", "chapterTitle": "One", "text": "Ann."}]}
    ),
    "bad-document": as_text({**small_manuscript(("One", None, ["Ann."])), "documentId": 7}),
    "not-json": "{not json",
    "empty": "",
    "list": "[]",
    "missing": None,
}


def manuscript_text(spec) -> str | None:
    """The bytes a manuscript spec stands for; the real-shaped one is the committed rescan-manuscript.json."""
    if isinstance(spec, dict):
        return contract_files.encode(real_manuscript())
    return spec


# ---- Story Bible files --------------------------------------------------------------------------------------------------------------


def evidence(chapter: str, paragraph_number: int, excerpt: str) -> dict:
    return {"chapter": chapter, "chapterId": "c-old", "paragraph": paragraph_number, "paragraphId": f"p-old-{paragraph_number}", "excerpt": excerpt}


def alias(text: str, *occurrences: dict) -> dict:
    return {"text": text, "pronunciation": {}, "occurrences": list(occurrences)}


def entry(entity_id: str, name: str, category: str = "Character", **extra) -> dict:
    value = {
        "id": entity_id,
        "canonical_name": name,
        "aliases": [],
        "category": category,
        "occurrences": [],
        "occurrence_count": 0,
        "pronunciation": {},
        "description": {"text": "", "evidence": {}},
        "personality_notes": [],
        "context": "",
        "relationships": [],
        "properties": [],
        "locked": False,
        "manual": False,
        "review_state": "reviewed",
        "appearances": [],
    }
    value.update(extra)
    return value


def bible() -> dict:
    stale = evidence("Old", 3, "stale excerpt")
    return {
        "schema_version": 2,
        "source": {"path": "/somewhere/manuscript.json", "sha256": "old"},
        "generated_at": "2026-10-01T00:00:00Z",
        "entities": [
            entry(
                "nicholas",
                "Nicholas",
                aliases=[alias("Nick", stale), alias("Nicky"), alias("The Boy")],
                occurrences=[stale, stale],
                occurrence_count=5,
                review_state="needs review",
            ),
            entry("wren", "Wren", locked=True, aliases=[alias("Wrenna")], review_state="needs review", review={"entry": True, "aliases": []}),
            entry("zoe", "Zoë", aliases=[alias("Zoe"), alias("ZOË"), alias("Zoë")], occurrences=[stale], review_state="needs review"),
            entry("greek", "Οδυσσευς", aliases=[alias("Ὀδυσσεύς"), alias("ΟΔΥΣΣΕΥΣ")]),
            entry("emoji", "Zoë 😀", aliases=[alias("Zoë 😀x")]),
            entry("rtl", "דוד", aliases=[alias("דויד"), alias("דודי")], review_state="needs review"),
            entry("arabic", "محمد", aliases=[alias("مُحَمَّد")]),
            entry("ghost", "Nobody Here", aliases=[alias("Not A Soul")], review_state="needs review", occurrences=[stale], occurrence_count=1),
            entry("padded", "  Ashgrove  ", "Place", aliases=[alias(" Ash grove "), alias("")], review_state="needs review"),
            entry("oneil", "Mrs. O'Neil", aliases=[alias("O'Neil"), alias("Mr. O'Neil")]),
            entry("turkey", "İstanbul", "Place", aliases=[alias("Istanbul"), alias("ıstanbul")]),
            entry("kelvin", "Kelvin K", aliases=[alias("k"), alias("K")]),
            entry("legacy", "Ana", aliases=["Anna", "ana"]),
            entry("empty", "", aliases=[alias("   ")], occurrences=[stale], occurrence_count=1),
            entry("small", "Ann", aliases=[alias("Annie")]),
            entry("same", "Ann", aliases=[alias("ann"), alias("Ann")]),
        ],
        "dialogue_cues": [],
        "absorbed_names": {},
    }


def document_hash_of(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def rescan_step(entity_id: str) -> tuple[str, dict]:
    return "rescan", {"entity_id": entity_id}


def status_step() -> tuple[str, dict]:
    return "status", {}


EVERY_ENTRY = ["nicholas", "wren", "zoe", "greek", "emoji", "rtl", "arabic", "ghost", "padded", "oneil", "turkey", "kelvin", "legacy", "empty"]

# (name, start guide, manuscript, steps). A start guide of None is no file.
CASES = [
    ("every entry, one after another", "bible", "real", [rescan_step(entity_id) for entity_id in EVERY_ENTRY]),
    ("rescan twice (rapid double-fire)", "bible", "real", [rescan_step("nicholas"), rescan_step("nicholas"), rescan_step("rtl"), rescan_step("rtl")]),
    ("rescan of an entry with no occurrences", "bible", "real", [rescan_step("ghost")]),
    ("rescan of a locked entry", "bible", "real", [rescan_step("wren")]),
    ("rescan of an entry that stays needs review", "bible", "small", [rescan_step("ghost"), rescan_step("rtl")]),
    ("rescan skips reference and opening chapters and counts only narration paragraphs", "bible", "small", [rescan_step("small"), rescan_step("same")]),
    ("rescan of an unknown entry is refused", "bible", "real", [rescan_step("nobody")]),
    ("rescan with no Story Bible is refused", None, "real", [rescan_step("nicholas")]),
    ("rescan with an empty Story Bible is refused", "empty", "real", [rescan_step("nicholas")]),
    ("rescan with no manuscript is refused", "bible", "missing", [rescan_step("nicholas")]),
    ("rescan of an unknown entry reads the Story Bible before the manuscript", "bible", "missing", [rescan_step("nobody")]),
    ("rescan with a manuscript that is not JSON is refused", "bible", "not-json", [rescan_step("nicholas")]),
    ("rescan with an empty manuscript file is refused", "bible", "empty", [rescan_step("nicholas")]),
    ("rescan with a manuscript that is a list is refused", "bible", "list", [rescan_step("nicholas")]),
    ("rescan with a manuscript of another schema is refused", "bible", "wrong-schema", [rescan_step("nicholas")]),
    ("rescan with a manuscript with a bad paragraph is refused", "bible", "bad-paragraph", [rescan_step("nicholas")]),
    ("rescan with a manuscript with a bad document id is refused", "bible", "bad-document", [rescan_step("nicholas")]),
    ("rescan with a manuscript that has nothing to narrate is refused", "bible", "all-reference", [rescan_step("small")]),
    ("rescan with a manuscript that has no paragraphs is refused", "bible", "no-paragraphs", [rescan_step("small")]),
    (
        "rescan after the manuscript changed since the build",
        "stale-source",
        "changed",
        [status_step(), rescan_step("small"), status_step(), rescan_step("same")],
    ),
]

# (name, start guide, manuscript)
STATUS_CASES = [
    ("current", "current", "small"),
    ("stale: the manuscript changed", "current", "changed"),
    ("stale: the Story Bible has no source", "no-source", "small"),
    ("stale: the source has no hash", "no-hash", "small"),
    ("stale: the hash is not text", "number-hash", "small"),
    ("missing: no Story Bible", None, "small"),
    ("missing: an empty object", "empty", "small"),
    ("missing: null", "null", "small"),
    ("missing: not JSON", "corrupt", "small"),
    ("missing: no Story Bible and no manuscript", None, "missing"),
    ("a Story Bible and no manuscript", "current", "missing"),
    ("a manuscript that is not JSON still has a hash", "not-json-current", "not-json"),
    ("the real manuscript", "real-current", "real"),
]


def guide_text(kind: str | None) -> str | None:
    """The text of a start file; a current one holds the hash of the manuscript it is current for."""
    match kind:
        case None:
            return None
        case "bible":
            return as_text(bible())
        case "stale-source":
            return as_text({**bible(), "source": {"path": "/x", "sha256": document_hash_of(as_text(small_manuscript(("Old", None, ["Ann."]))))}})
        case "empty":
            return "{}"
        case "null":
            return "null"
        case "corrupt":
            return "{broken"
        case "current" | "not-json-current" | "real-current":
            return as_text({"schema_version": 2, "source": {"path": "/x", "sha256": document_hash_of(manuscript_text_for_current(kind))}, "entities": []})
        case "no-source":
            return as_text({"schema_version": 2, "entities": []})
        case "no-hash":
            return as_text({"schema_version": 2, "source": {"path": "/x"}, "entities": []})
        case "number-hash":
            return as_text({"schema_version": 2, "source": {"path": "/x", "sha256": 7}, "entities": []})
        case "string-source":
            return as_text({"schema_version": 2, "source": "x", "entities": []})
    raise AssertionError(kind)


def manuscript_text_for_current(kind: str) -> str:
    return {"current": MANUSCRIPTS["small"], "not-json-current": MANUSCRIPTS["not-json"], "real-current": manuscript_text(MANUSCRIPTS["real"])}[kind]


def run_status(guide_path: str, manuscript_path: str) -> dict:
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            guide.status(argparse.Namespace(guide=guide_path, manuscript=manuscript_path, out=None))
    except ValueError as exc:
        return {"error": str(exc)}
    except OSError:
        return {"os_error": True}
    return {"result": out.getvalue().strip()}


def run_rescan_case(start: str | None, manuscript: str | None, steps: list) -> list[dict]:
    results = []
    with tempfile.TemporaryDirectory() as temporary:
        path = Path(temporary) / "manuscript_guide.json"
        manuscript_path = Path(temporary) / "manuscript.json"
        if start is not None:
            path.write_text(start, encoding="utf-8")
        if manuscript is not None:
            manuscript_path.write_text(manuscript, encoding="utf-8")
        for command, arguments in steps:
            before = path.read_text(encoding="utf-8") if path.exists() else None
            if command == "status":
                results.append({"command": command, "arguments": arguments, **run_status(str(path), str(manuscript_path))})
                continue
            normalized = guide.load_json(str(path))
            try:
                guide.rescan(argparse.Namespace(guide=str(path), manuscript=str(manuscript_path), **arguments))
            except ValueError as exc:
                after = path.read_text(encoding="utf-8") if path.exists() else None
                assert after == before, f"{command} {arguments} refused but wrote"
                results.append({"command": command, "arguments": arguments, "error": str(exc)})
                continue
            after = path.read_text(encoding="utf-8")
            results.append(
                {"command": command, "arguments": arguments, "wrote": after != before, "entity": the_entity(json.loads(after), arguments, normalized)}
            )
    return results


def the_entity(after: dict, arguments: dict, before: dict) -> dict:
    """The rescanned entry as the file now holds it. A rescan changes that entry alone, which this asserts: the rest of the file is as it was,
    read the way ``load_json`` reads it (an alias that was plain text is an object, as the sidecar writes every file back).

    Only the entry is recorded, because a whole file after every step of a rescan of a full manuscript would be tens of megabytes.
    """
    entity_id = arguments["entity_id"]

    def rest(document: dict) -> dict:
        return {**document, "entities": [entity for entity in document["entities"] if entity["id"] != entity_id]}

    assert rest(after) == rest(before), f"rescan {entity_id} changed more than the entry"
    return next(entity for entity in after["entities"] if entity["id"] == entity_id)


def rescan_golden() -> dict:
    cases = []
    for name, start_kind, manuscript_name, steps in CASES:
        results = run_rescan_case(guide_text(start_kind), manuscript_text(MANUSCRIPTS[manuscript_name]), copy.deepcopy(steps))
        cases.append({"name": name, "start": start_kind, "manuscript": manuscript_name, "steps": steps, "results": results})
    statuses = []
    for name, start_kind, manuscript_name in STATUS_CASES:
        start, text = guide_text(start_kind), manuscript_text(MANUSCRIPTS[manuscript_name])
        with tempfile.TemporaryDirectory() as temporary:
            guide_path, manuscript_path = Path(temporary) / "manuscript_guide.json", Path(temporary) / "manuscript.json"
            if start is not None:
                guide_path.write_text(start, encoding="utf-8")
            if text is not None:
                manuscript_path.write_text(text, encoding="utf-8")
            statuses.append({"name": name, "start": start_kind, "manuscript": manuscript_name, **run_status(str(guide_path), str(manuscript_path))})
    kinds = {case[1] for case in CASES} | {case[1] for case in STATUS_CASES}
    return {
        "starts": {kind: guide_text(kind) for kind in sorted(kinds - {None})},
        "manuscripts": MANUSCRIPTS,
        "cases": cases,
        "statuses": statuses,
    }


class RescanParityTests(unittest.TestCase):
    def test_the_unicode_tables_match_the_committed_file(self):
        contract_files.check("python-unicode", unicode_tables(), GUIDE_DIR)

    def test_find_occurrences_matches_the_committed_file(self):
        golden = occurrence_golden()
        found = [case["occurrences"] for case in golden["cases"]]
        self.assertGreater(sum(1 for occurrences in found if occurrences), 60, "cases that find something")
        self.assertGreater(sum(1 for occurrences in found if not occurrences), 8, "cases that find nothing")
        self.assertGreater(len(golden["fold_sweep"]["matches"]), 1000, "characters that match more than themselves")
        contract_files.check("occurrence-parity", golden, TESTDATA)

    def test_the_manuscript_has_every_content_kind(self):
        manuscript = real_manuscript()
        self.assertEqual({chapter["contentKind"] for chapter in manuscript["chapters"]}, {"opening", "narration", "reference"})
        self.assertGreater(len(manuscript["paragraphs"]), 300)
        contract_files.check("rescan-manuscript", manuscript, TESTDATA)

    def test_rescan_and_status_match_the_committed_file(self):
        golden = rescan_golden()
        results = [result for case in golden["cases"] for result in case["results"]]
        self.assertGreater(sum("error" in result for result in results), 8, "cases the command refuses")
        self.assertGreater(sum(result.get("wrote", False) for result in results), 20, "rescans that write")
        self.assertEqual({result["result"] for result in golden["statuses"] if "result" in result}, {"STATUS|CURRENT", "STATUS|STALE", "STATUS|MISSING"})
        contract_files.check("rescan-parity", golden, TESTDATA)


if __name__ == "__main__":
    unittest.main()
