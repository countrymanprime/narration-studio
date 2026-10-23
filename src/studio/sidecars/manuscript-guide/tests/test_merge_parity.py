"""What the sidecar's `merge`, `unmerge` and `split` do to a file, recorded as sequences the Go host replays, and the bytes its merge
fingerprints are made of.

The host runs the three itself (src/studio/desktop/internal/guide/merge.go), so each has two implementations. Each case here is a start file and
a list of steps; every step runs the real command on the file the step before left, and records whether it wrote and what the file then
holds, or the reason it refused. ``TestMergesMatchTheSidecarCases`` in the guide package replays each case twice, once as a chain on the
host's own writes and once with every step on the sidecar's file, so an undo of a record the other implementation wrote is covered both
ways round. The undo ids are fixed (``0000000000000001``, ``0000000000000002`` and on) so the files can be compared.

``merge-fingerprint-golden.json`` holds what Python's ``json.dumps(value, sort_keys=True, ensure_ascii=False)`` makes of values with
awkward numbers, text and key order, with their SHA-256, and what ``normalize_name``, ``entity_id`` and ``str.lower`` make of awkward
names. ``TestPythonJSONMatchesTheGolden`` requires the host's encoder to produce the same. Run with ``UPDATE_CONTRACTS=1`` to rewrite both
files after a deliberate change.
"""

import argparse
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from narration_common import contract_files

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)

TESTDATA = Path(__file__).parents[5] / "src" / "studio" / "desktop" / "internal" / "guide" / "testdata"


def evidence(chapter: str, paragraph: int, excerpt: str) -> dict:
    return {"chapter": chapter, "chapterId": "c-" + chapter, "paragraph": paragraph, "paragraphId": f"p-{paragraph}", "excerpt": excerpt}


def alias(text: str, ipa: str = "", *occurrences: dict) -> dict:
    return {"text": text, "pronunciation": {"ipa": ipa, "source": "manual"} if ipa else {}, "occurrences": list(occurrences)}


def entry(entity_id: str, name: str, category: str = "Character", **extra) -> dict:
    value = {
        "id": entity_id,
        "canonical_name": name,
        "aliases": [],
        "category": category,
        "occurrences": [],
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
    return {
        "schema_version": 2,
        "source": {},
        "entities": [
            entry(
                "nicholas",
                "Nicholas",
                aliases=[alias("Nick", "nɪk", evidence("One", 1, "Nick ran.")), alias("The Boy", "", evidence("One", 2, "The boy sat."))],
                occurrences=[evidence("One", 0, "Nicholas sat.")],
                pronunciation={"ipa": "ˈnɪkələs", "source": "cmudict"},
                relationships=[{"id": "wren", "name": "Wren", "label": "friend"}, {"id": "mill", "name": "The Mill", "label": "lives by"}],
                appearances=[{"chapterId": "c-0001", "sceneIndex": 0}, {"chapterId": "c-0003", "sceneIndex": 2}],
                properties=[{"key": "Codename", "value": "Wren"}],
                review={"entry": False, "aliases": ["Nick"]},
                review_state="needs review",
            ),
            entry(
                "nico",
                "Nico",
                aliases=[
                    alias("N.", "ɛn", evidence("Two", 4, "N. waved.")),
                    alias("nick", "", evidence("One", 1, "Nick ran."), evidence("Two", 7, "Nick left.")),
                ],
                occurrences=[evidence("Two", 3, "Nico laughed."), evidence("One", 5, "Nico?")],
                pronunciation={"ipa": "ˈniːkoʊ", "source": "manual"},
                description={"text": "A boy who laughs.", "evidence": {}},
                personality_notes=["laughs"],
                relationships=[
                    {"id": "wren", "name": "Wren", "label": "brother"},
                    {"id": "nicholas", "name": "Nicholas", "label": "same"},
                    {"id": "wren", "name": "Wren", "label": "friend"},
                    {"id": "nico", "name": "Nico", "label": "self"},
                ],
                appearances=[{"chapterId": "c-0002", "sceneIndex": 1.0}, {"chapterId": "c-0001", "sceneIndex": 0}],
                properties=[{"key": "codename", "value": "Other"}, {"key": "Eyes", "value": "green"}, {"key": "EYES", "value": "again"}],
                speaker_color=3,
                review={"entry": True, "aliases": ["N.", "gone"]},
                review_state="needs review",
            ),
            entry(
                "wren",
                "Wren",
                relationships=[
                    {"id": "nico", "name": "Nico", "label": "sister"},
                    {"id": "nicholas", "name": "Nicholas", "label": "friend"},
                    {"id": "nico", "name": "Nico", "label": "sister"},
                    {"id": "mill", "name": "The Mill", "label": "works at", "note": "kept"},
                ],
            ),
            entry("mill", "The Mill", "Place", locked=True, relationships=[{"id": "nico", "name": "Nico", "label": "owned by"}]),
            entry("elder", "Elder", locked=True, aliases=[alias("The Elder")]),
            entry(
                "bare",
                "Bare",
                aliases=[alias("Barely")],
                description={"text": "Kept.", "evidence": {}},
                personality_notes=["calm"],
                speaker_color=6,
                properties=[{"key": "EYES", "value": "grey"}],
            ),
        ],
        "dialogue_cues": [],
        "absorbed_names": {"nicky": "nicholas"},
    }


def unicode_bible() -> dict:
    return {
        "schema_version": 2,
        "entities": [
            entry("odysseus", "Οδυσσευς", aliases=[alias("Ὀδυσσεύς")]),
            entry("odysseus-caps", "ΟΔΥΣΣΕΥΣ", aliases=[alias("İstanbul"), alias("ΑΣ"), alias("Zoë 😀")]),
            entry("istanbul", "i̇stanbul", aliases=[alias("Kelvin K")]),
            entry("kelvin", "Kelvin K", aliases=[alias("Zé")]),
        ],
    }


def many_bible() -> dict:
    return {"schema_version": 2, "entities": [entry(f"e{index:02d}", f"Name {index:02d}") for index in range(14)]}


def split_bible() -> dict:
    return {
        "schema_version": 2,
        "entities": [
            entry(
                "parent",
                "Parent",
                category="Place",
                aliases=[
                    alias("Robin", "ˈrɑbɪn", evidence("One", 1, "Robin.")),
                    alias("Robin Hood", "", evidence("One", 2, "Hood."), evidence("One", 3, "Hood?")),
                    alias("ΑΣ"),
                    alias("Parent"),
                ],
                occurrences=[evidence("One", 0, "Parent.")],
                review={"entry": False, "aliases": ["Robin", "ΑΣ"]},
                review_state="needs review",
            ),
            entry("locked", "Locked", locked=True, aliases=[alias("Closed")]),
            entry("taken-owner", "Owner", aliases=[alias("Bare")]),
            entry(guide.entity_id("Bare"), "Bare"),
            entry("plain", "Plain", aliases=[alias("Pl ain")]),
        ],
        "absorbed_names": {"robin": "parent", "robinhood": "parent", "other": "x"},
    }


def no_absorbed() -> dict:
    data = bible()
    del data["absorbed_names"]
    return data


STARTS = {
    "bible": bible(),
    "no-absorbed": no_absorbed(),
    "unicode": unicode_bible(),
    "many": many_bible(),
    "split": split_bible(),
}

ID1, ID2, ID3 = "0000000000000001", "0000000000000002", "0000000000000003"


def merge(source: str, target: str) -> tuple[str, dict]:
    return "merge", {"source_id": source, "target_id": target}


def unmerge(undo_id: str) -> tuple[str, dict]:
    return "unmerge", {"undo_id": undo_id}


def split(entity_id: str, alias_text: str) -> tuple[str, dict]:
    return "split", {"entity_id": entity_id, "alias_text": alias_text}


MANY = [merge(f"e{index:02d}", "e00") for index in range(1, 13)]

# (name, start, steps). Each step is (command, argparse names without --guide).
CASES = [
    ("merge", "bible", [merge("nico", "nicholas")]),
    ("merge, then unmerge", "bible", [merge("nico", "nicholas"), unmerge(ID1)]),
    ("merge, then unmerge, in a file with no absorbed names", "no-absorbed", [merge("nico", "nicholas"), unmerge(ID1)]),
    ("merge into a locked entry", "bible", [merge("bare", "elder"), unmerge(ID1)]),
    ("merge into an entry that has a colour, a description and notes", "bible", [merge("nico", "bare"), unmerge(ID1)]),
    ("merge of a locked entry is refused", "bible", [merge("mill", "nicholas")]),
    ("merge into itself is refused", "bible", [merge("nico", "nico")]),
    ("merge of an unknown source or target is refused", "bible", [merge("nobody", "nicholas"), merge("nico", "nobody")]),
    (
        "unmerge after the target was edited is refused",
        "bible",
        [merge("nico", "nicholas"), ("mark-reviewed", {"entity_id": "nicholas", "alias_index": None}), unmerge(ID1)],
    ),
    (
        "unmerge after a re-pointed relationship changed is refused",
        "bible",
        [merge("nico", "nicholas"), ("unrelate", {"entity_id": "wren", "other_id": "nicholas", "label": "sister"}), unmerge(ID1)],
    ),
    (
        "unmerge after an entry the merge did not touch was edited",
        "bible",
        [merge("nico", "nicholas"), ("mark-reviewed", {"entity_id": "bare", "alias_index": None}), unmerge(ID1)],
    ),
    ("unmerge when the target is gone is refused", "bible", [merge("nico", "nicholas"), ("delete", {"entity_id": "nicholas"}), unmerge(ID1)]),
    ("unmerge of an unknown id is refused", "bible", [unmerge(ID1), merge("nico", "nicholas"), unmerge(ID2), unmerge(ID1), unmerge(ID1)]),
    (
        "two merges taken back newest first, then oldest first",
        "bible",
        [merge("nico", "nicholas"), merge("wren", "nicholas"), unmerge(ID1), unmerge(ID2), unmerge(ID1), merge("bare", "nicholas"), unmerge(ID3)],
    ),
    ("the file keeps the last ten merges", "many", [*MANY, unmerge("0000000000000001"), unmerge("0000000000000002"), unmerge("000000000000000c")]),
    (
        "merge of names that lower-case differently in Go and Python",
        "unicode",
        [merge("odysseus-caps", "odysseus"), merge("istanbul", "kelvin"), unmerge(ID1), unmerge(ID2)],
    ),
    (
        "split an alias",
        "split",
        [split("parent", "Robin"), split("parent", "  robin hood "), split("parent", "ΑΣ"), split("parent", "nobody"), split("parent", "Parent")],
    ),
    ("split of a locked entry or an unknown one is refused", "split", [split("locked", "Closed"), split("nobody", "x")]),
    ("split into a name that has an entry is refused", "split", [split("taken-owner", "Bare"), split("plain", "pl ain")]),
    ("split after a merge", "bible", [merge("nico", "nicholas"), split("nicholas", "nico"), split("nicholas", "N.")]),
]

COMMANDS = {
    "merge": guide.merge,
    "unmerge": guide.unmerge,
    "split": guide.split,
    "mark-reviewed": guide.mark_reviewed,
    "unrelate": guide.unrelate,
    "delete": guide.delete,
}


def run_case(start: dict, steps: list) -> list[dict]:
    results = []
    counter = iter(range(1, 100))

    def urandom(count: int) -> bytes:
        return bytes(count - 1) + bytes([next(counter)])

    with tempfile.TemporaryDirectory() as temporary, patch.object(guide.os, "urandom", urandom):
        path = str(Path(temporary) / "manuscript_guide.json")
        guide.write_json(path, copy.deepcopy(start))
        for command, arguments in steps:
            before = Path(path).read_text(encoding="utf-8")
            try:
                COMMANDS[command](argparse.Namespace(guide=path, **arguments))
            except ValueError as exc:
                assert Path(path).read_text(encoding="utf-8") == before, f"{command} {arguments} refused but wrote"
                results.append({"command": command, "arguments": arguments, "error": str(exc)})
                continue
            after = Path(path).read_text(encoding="utf-8")
            results.append({"command": command, "arguments": arguments, "wrote": after != before, "after": json.loads(after)})
    return results


# Text a Story Bible file can hold, as JSON, so the number forms are the ones a parser sees.
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


def golden() -> dict:
    values = []
    for text in VALUE_TEXTS:
        value = json.loads(text)
        dumped = json.dumps(value, sort_keys=True, ensure_ascii=False)
        values.append({"json": text, "python_json": dumped, "fingerprint": guide._fingerprint(value)})
    names = [{"text": name, "lower": name.lower(), "normalized": guide.normalize_name(name), "entity_id": guide.entity_id(name)} for name in NAMES]
    return {"values": values, "names": names}


class MergeParityTests(unittest.TestCase):
    def test_every_case_matches_the_committed_file(self):
        cases = [{"name": name, "start": start, "steps": steps, "results": run_case(STARTS[start], steps)} for name, start, steps in CASES]
        results = [result for case in cases for result in case["results"]]
        self.assertGreater(sum("error" in result for result in results), 10, "cases the commands refuse")
        self.assertGreater(sum(result.get("command") == "unmerge" and "after" in result for result in results), 5, "undos that work")
        contract_files.check("merge-parity", {"starts": STARTS, "cases": cases}, TESTDATA)

    def test_the_fingerprint_golden_matches_what_python_makes(self):
        contract_files.check("merge-fingerprint-golden", golden(), TESTDATA)


if __name__ == "__main__":
    unittest.main()
