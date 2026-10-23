"""What the sidecar's Story Bible type commands do to a file, recorded as cases the Go host replays.

The host runs type-add, type-rename, type-colour, type-speaks and type-remove itself (src/studio/desktop/internal/guide/types.go), so each has
two implementations. Each case here runs the real command on a copy of a starting file (or on no file at all) and records what the file
then holds, or the reason it refused. ``TestTypesMatchTheSidecarCases`` in the guide package replays every case and requires the same
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

TESTDATA = Path(__file__).parents[5] / "src" / "studio" / "desktop" / "internal" / "guide" / "testdata"


def entry(entity_id: str, name: str, category: str, **extra) -> dict:
    value = {"id": entity_id, "canonical_name": name, "category": category, "aliases": [], "locked": False}
    value.update(extra)
    return value


ENTITIES = [
    entry("entity-ada", "Ada", "Character"),
    entry("entity-mill", "The Mill", "Place", locked=True),
    entry("entity-moor", "The Moor", "Place"),
    entry("entity-guild", "The Guild", "Organization"),
]

# A start of None is no file at all.
STARTS = {
    "missing": None,
    "empty": {},
    "default": {"schema_version": 2, "entities": ENTITIES},
    "stored": {
        "schema_version": 2,
        "entities": [entry("entity-ada", "Ada", "Hero"), entry("entity-mill", "The Mill", "Place", locked=True)],
        "types": [
            {"name": "Hero", "colour": "green", "speaks": True, "builtin": "Character"},
            {"name": "Place", "colour": "blue", "speaks": False, "builtin": "Place", "note": "dropped on the next write"},
            {"name": "Ship", "colour": "teal", "speaks": False},
        ],
    },
    "one": {"schema_version": 2, "entities": [], "types": [{"name": "Thing", "colour": "rose", "speaks": False}]},
    "bad": {"schema_version": 2, "entities": [], "types": [{"name": "Hero", "colour": "green", "speaks": "yes"}]},
    "twice": {
        "schema_version": 2,
        "entities": [],
        "types": [{"name": "Hero", "colour": "green", "speaks": True}, {"name": "HERO", "colour": "blue", "speaks": False}],
    },
    "empty-list": {"schema_version": 2, "entities": [], "types": []},
    "null-types": {"schema_version": 2, "entities": [entry("entity-moor", "The Moor", "Place")], "types": None},
    "cherokee": {"schema_version": 2, "entities": [], "types": [{"name": "\uab70\uab71", "colour": "green", "speaks": True}]},
}

# (command, start, arguments). Each command's arguments are its argparse names, without --guide.
CASES = [
    ("type-add", "default", {"name": "Creature"}),
    ("type-add", "default", {"name": "  Beast  "}),
    ("type-add", "default", {"name": "\x1fBeast\x1c"}),
    ("type-add", "default", {"name": "Ünïcødé"}),
    ("type-add", "default", {"name": "x" * 40}),
    ("type-add", "default", {"name": "x" * 41}),
    ("type-add", "default", {"name": "é" * 40}),
    ("type-add", "default", {"name": ""}),
    ("type-add", "default", {"name": "   "}),
    ("type-add", "default", {"name": "two\nlines"}),
    ("type-add", "default", {"name": "nul\0"}),
    ("type-add", "default", {"name": "n\0l"}),
    ("type-add", "default", {"name": "line\N{LINE SEPARATOR}break"}),
    ("type-add", "default", {"name": "character"}),
    ("type-add", "default", {"name": "Needs Review"}),
    ("type-add", "default", {"name": " Draft "}),
    ("type-add", "default", {"name": "draft"}),
    ("type-add", "stored", {"name": "Creature"}),
    ("type-add", "stored", {"name": "hero"}),
    ("type-add", "missing", {"name": "Creature"}),
    ("type-add", "empty", {"name": "Creature"}),
    ("type-add", "bad", {"name": "Creature"}),
    ("type-add", "twice", {"name": "Creature"}),
    ("type-add", "empty-list", {"name": "Creature"}),
    ("type-add", "null-types", {"name": "Creature"}),
    ("type-add", "cherokee", {"name": "\u13a0\u13a1"}),
    ("type-add", "cherokee", {"name": "\u13f0"}),
    ("type-rename", "cherokee", {"name": "\uab70\uab71", "to": "\u13a0\u13a1"}),
    ("type-rename", "default", {"name": "Place", "to": "Location"}),
    ("type-rename", "default", {"name": "Place", "to": " place "}),
    ("type-rename", "default", {"name": "Place", "to": "Place"}),
    ("type-rename", "default", {"name": "Place", "to": "character"}),
    ("type-rename", "default", {"name": "Place", "to": "Needs Review"}),
    ("type-rename", "default", {"name": "Place", "to": ""}),
    ("type-rename", "default", {"name": "place", "to": "Location"}),
    ("type-rename", "default", {"name": " Place", "to": "Location"}),
    ("type-rename", "default", {"name": "Nowhere", "to": "Location"}),
    ("type-rename", "default", {"name": "Needs Review", "to": "Location"}),
    ("type-rename", "stored", {"name": "Hero", "to": "Lead"}),
    ("type-rename", "stored", {"name": "Place", "to": "Ship"}),
    ("type-rename", "missing", {"name": "Place", "to": "Location"}),
    ("type-rename", "missing", {"name": "Nowhere", "to": "Location"}),
    ("type-rename", "bad", {"name": "Hero", "to": "Lead"}),
    ("type-colour", "default", {"name": "Place", "colour": "amber"}),
    ("type-colour", "default", {"name": "Place", "colour": "blue"}),
    ("type-colour", "default", {"name": "Place", "colour": "pink"}),
    ("type-colour", "default", {"name": "Place", "colour": "Amber"}),
    ("type-colour", "default", {"name": "Nowhere", "colour": "green"}),
    ("type-colour", "stored", {"name": "Ship", "colour": "violet"}),
    ("type-colour", "missing", {"name": "Lore", "colour": "teal"}),
    ("type-colour", "bad", {"name": "Hero", "colour": "teal"}),
    ("type-speaks", "default", {"name": "Place", "speaks": 1}),
    ("type-speaks", "default", {"name": "Character", "speaks": 0}),
    ("type-speaks", "default", {"name": "Character", "speaks": 1}),
    ("type-speaks", "default", {"name": "Nowhere", "speaks": 1}),
    ("type-speaks", "stored", {"name": "Ship", "speaks": 1}),
    ("type-speaks", "empty", {"name": "Item", "speaks": 1}),
    ("type-speaks", "twice", {"name": "Hero", "speaks": 0}),
    ("type-remove", "default", {"name": "Event"}),
    ("type-remove", "default", {"name": "Place"}),
    ("type-remove", "default", {"name": "event"}),
    ("type-remove", "default", {"name": "Nowhere"}),
    ("type-remove", "stored", {"name": "Ship"}),
    ("type-remove", "stored", {"name": "Hero"}),
    ("type-remove", "one", {"name": "Thing"}),
    ("type-remove", "missing", {"name": "Event"}),
    ("type-remove", "missing", {"name": "Character"}),
    ("type-remove", "bad", {"name": "Hero"}),
]

COMMANDS = {
    "type-add": guide.type_add,
    "type-rename": guide.type_rename,
    "type-colour": guide.type_colour,
    "type-speaks": guide.type_speaks,
    "type-remove": guide.type_remove,
}


def run_case(command: str, start: dict | None, arguments: dict) -> dict:
    with tempfile.TemporaryDirectory() as temporary:
        path = Path(temporary) / "ManuscriptGuide" / "manuscript_guide.json"
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


class TypeParityTests(unittest.TestCase):
    def test_every_case_matches_the_committed_file(self):
        cases = [
            {"command": command, "start": start, "arguments": arguments, **run_case(command, STARTS[start], arguments)} for command, start, arguments in CASES
        ]
        self.assertGreater(sum("error" in case for case in cases), 20)
        self.assertTrue(any(case["start"] == "missing" and "after" in case for case in cases), "a case that starts a Story Bible")
        contract_files.check("type-parity", {"starts": STARTS, "cases": cases}, TESTDATA)


if __name__ == "__main__":
    unittest.main()
