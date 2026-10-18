"""What the sidecar's pronounce-user and pronunciation-use-alternate do to a file, recorded as cases the Go host replays.

The host sets the narrator's own pronunciation and switches to the kept alternate itself (apps/desktop/internal/guide/mutate.go), so each
has two implementations. Each case here runs the real command on a copy of a starting file (or on no file) and records what the file then
holds, or the reason it refused. ``TestPronunciationsMatchTheSidecarCases`` in the guide package replays every case and requires the same
JSON or the same reason with the file untouched, so the two cannot drift. Run with ``UPDATE_CONTRACTS=1`` to rewrite the cases after a
deliberate change.
"""

import argparse
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from narration_common import contract_files

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)

TESTDATA = Path(__file__).parents[3] / "apps" / "desktop" / "internal" / "guide" / "testdata"


def entry(entity_id: str, name: str, **extra) -> dict:
    value = {"id": entity_id, "canonical_name": name, "category": "Character", "aliases": [], "locked": False}
    value.update(extra)
    return value


DICTIONARY = {"ipa": "ɹɛn", "source": "cmu", "confidence": "high"}

STARTS = {
    "missing": None,
    "empty": {},
    "names": {
        "schema_version": 2,
        "entities": [
            entry(
                "entity-wren",
                "Wren",
                pronunciation={**DICTIONARY, "chosen": True, "status": "researched", "note": "said softly", "extra": "dropped"},
                aliases=[
                    {
                        "text": "W",
                        "pronunciation": {"ipa": "dʌbəl", "source": "user", "confidence": "narrator", "alternate": {"ipa": "dʌbəlju", "source": "espeak"}},
                        "occurrences": [],
                    },
                    {"text": "Bare", "pronunciation": {}, "occurrences": []},
                    {"text": "Plain", "occurrences": []},
                    "Wrenny",
                ],
            ),
            entry(
                "entity-ada", "Ada", pronunciation={"ipa": "ˈeɪdə", "source": "manual", "confidence": "narrator", "alternate": {**DICTIONARY, "ipa": "ˈɑdə"}}
            ),
            entry(
                "entity-hal",
                "Hal",
                pronunciation={
                    **DICTIONARY,
                    "ipa": "hæl",
                    "note": "short a",
                    "status": "query_sent",
                    "alternate": {"ipa": "hɑl", "source": "user", "confidence": "narrator", "note": "kept only in use"},
                },
            ),
            entry("entity-bo", "Bo"),
            entry("entity-eli", "Eli", pronunciation={"source": "espeak", "confidence": "low"}),
            entry("entity-fay", "Fay", pronunciation={"ipa": "", "source": "cmu", "alternate": {}}),
            entry("entity-gil", "Gil", pronunciation=None),
            entry("entity-mill", "The Mill", locked=True, pronunciation={"ipa": "mɪl", "source": "manual", "alternate": DICTIONARY}),
            entry("entity-cy", "Cy", locked=1),
            entry("entity-dot", "Dot", locked=0),
        ],
    },
}

# (command, start, arguments). Each command's arguments are its argparse names, without --guide.
CASES = [
    ("pronounce-user", "names", {"entity_id": "entity-wren", "alias_index": None, "ipa": " wɹɛn "}),
    ("pronounce-user", "names", {"entity_id": "entity-wren", "alias_index": 0, "ipa": "dʌb"}),
    ("pronounce-user", "names", {"entity_id": "entity-wren", "alias_index": 1, "ipa": "bɛə"}),
    ("pronounce-user", "names", {"entity_id": "entity-wren", "alias_index": 2, "ipa": "pleɪn"}),
    ("pronounce-user", "names", {"entity_id": "entity-wren", "alias_index": 3, "ipa": "ˈɹɛni"}),
    ("pronounce-user", "names", {"entity_id": "entity-wren", "alias_index": 4, "ipa": "x"}),
    ("pronounce-user", "names", {"entity_id": "entity-wren", "alias_index": -1, "ipa": "x"}),
    ("pronounce-user", "names", {"entity_id": "entity-ada", "alias_index": None, "ipa": "ˈædə"}),
    ("pronounce-user", "names", {"entity_id": "entity-hal", "alias_index": None, "ipa": "hal"}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "boʊ"}),
    ("pronounce-user", "names", {"entity_id": "entity-eli", "alias_index": None, "ipa": "ˈiːlaɪ"}),
    ("pronounce-user", "names", {"entity_id": "entity-fay", "alias_index": None, "ipa": "feɪ"}),
    ("pronounce-user", "names", {"entity_id": "entity-gil", "alias_index": None, "ipa": "ɡɪl"}),
    ("pronounce-user", "names", {"entity_id": "entity-mill", "alias_index": None, "ipa": "x"}),
    ("pronounce-user", "names", {"entity_id": "entity-cy", "alias_index": None, "ipa": "x"}),
    ("pronounce-user", "names", {"entity_id": "entity-dot", "alias_index": None, "ipa": "dɒt"}),
    ("pronounce-user", "names", {"entity_id": "entity-nobody", "alias_index": None, "ipa": "x"}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": ""}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "   "}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "\x1f\x1c"}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "two\nlines"}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "carriage\rreturn"}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "line\N{LINE SEPARATOR}separator"}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "x" * 200}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "x" * 201}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "ɛ" * 200}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "-boʊ"}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "\x1fboʊ\x1d"}),
    ("pronounce-user", "names", {"entity_id": "entity-bo", "alias_index": None, "ipa": "b\0o"}),
    ("pronounce-user", "names", {"entity_id": "entity-mill", "alias_index": None, "ipa": "   "}),
    ("pronounce-user", "missing", {"entity_id": "entity-bo", "alias_index": None, "ipa": "boʊ"}),
    ("pronounce-user", "missing", {"entity_id": "entity-bo", "alias_index": None, "ipa": ""}),
    ("pronounce-user", "empty", {"entity_id": "entity-bo", "alias_index": None, "ipa": "boʊ"}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-wren", "alias_index": None}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-wren", "alias_index": 0}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-wren", "alias_index": 1}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-wren", "alias_index": 2}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-wren", "alias_index": 4}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-ada", "alias_index": None}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-hal", "alias_index": None}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-bo", "alias_index": None}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-fay", "alias_index": None}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-gil", "alias_index": None}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-mill", "alias_index": None}),
    ("pronunciation-use-alternate", "names", {"entity_id": "entity-nobody", "alias_index": None}),
    ("pronunciation-use-alternate", "missing", {"entity_id": "entity-ada", "alias_index": None}),
    ("pronunciation-use-alternate", "empty", {"entity_id": "entity-ada", "alias_index": None}),
]

COMMANDS = {"pronounce-user": guide.pronounce_user, "pronunciation-use-alternate": guide.pronunciation_use_alternate}


def run_case(command: str, start: dict | None, arguments: dict) -> dict:
    with tempfile.TemporaryDirectory() as temporary:
        path = Path(temporary) / "manuscript_guide.json"
        if start is not None:
            guide.write_json(str(path), copy.deepcopy(start))
        before = path.read_text(encoding="utf-8") if path.exists() else None
        try:
            COMMANDS[command](argparse.Namespace(guide=str(path), **arguments))
        except ValueError as exc:
            after = path.read_text(encoding="utf-8") if path.exists() else None
            assert after == before, f"{command} {arguments} refused but wrote"
            return {"error": str(exc)}
        return {"after": json.loads(path.read_text(encoding="utf-8"))}


def switch_twice(start: dict, entity_id: str) -> tuple[dict, dict]:
    """The pronunciation after one switch to the alternate and after a second, for the lossless round trip."""
    with tempfile.TemporaryDirectory() as temporary:
        path = str(Path(temporary) / "manuscript_guide.json")
        guide.write_json(path, copy.deepcopy(start))
        seen = []
        for _ in range(2):
            guide.pronunciation_use_alternate(argparse.Namespace(guide=path, entity_id=entity_id, alias_index=None))
            seen.append(guide.find_entity(guide.load_json(path), entity_id)["pronunciation"])
        return seen[0], seen[1]


class PronunciationParityTests(unittest.TestCase):
    def test_every_case_matches_the_committed_file(self):
        cases = [
            {"command": command, "start": start, "arguments": arguments, **run_case(command, STARTS[start], arguments)} for command, start, arguments in CASES
        ]
        self.assertGreater(sum("error" in case for case in cases), 15)
        contract_files.check("pronunciation-parity", {"starts": STARTS, "cases": cases}, TESTDATA)

    def test_switching_twice_comes_back(self):
        # The "lossless both ways" the Go replay relies on: two switches put the first pronunciation and its alternate back.
        first, second = switch_twice(STARTS["names"], "entity-ada")
        self.assertEqual("ˈɑdə", first["ipa"])
        self.assertEqual("ˈeɪdə", second["ipa"])
        self.assertEqual("ˈɑdə", second["alternate"]["ipa"])


if __name__ == "__main__":
    unittest.main()
