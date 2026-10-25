"""The Story Bible types (SN-B95): a stored, editable list of ``{name, colour, speaks}`` in the Story Bible file.

A file with no ``types`` list reads as the defaults, which are the fixed categories of before with their colours and only Character
speaking, so an old file reads exactly as it did. The host edits the list itself (src/studio/desktop/internal/guide/types.go); a build keeps it. A type's
``speaks`` flag decides which names the dialogue cues resolve to (the host's internal/guide cues.go, with its tests).
"""

import argparse
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

DEFAULTS = [
    {"name": "Character", "colour": "green", "speaks": True},
    {"name": "Place", "colour": "blue", "speaks": False},
    {"name": "Organization", "colour": "violet", "speaks": False},
    {"name": "Lore", "colour": "amber", "speaks": False},
    {"name": "Item", "colour": "teal", "speaks": False},
    {"name": "Event", "colour": "rose", "speaks": False},
]


def entity(entity_id: str, name: str, category: str, **fields) -> dict:
    return {
        "id": entity_id,
        "canonical_name": name,
        "category": category,
        "aliases": [],
        "occurrences": [],
        "occurrence_count": 0,
        "pronunciation": {},
        "description": {"text": "", "evidence": {}},
        "personality_notes": [],
        "relationships": [],
        "properties": [],
        "locked": False,
        "manual": False,
        "review_state": "generated",
        **fields,
    }


def rows(types: list[dict]) -> list[dict]:
    """The rows as the UI sees them: the ``builtin`` the file keeps for a rebuild is not part of a row."""
    return [{key: row[key] for key in ("name", "colour", "speaks")} for row in types]


class BibleTypesTests(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.path = str(Path(self._dir.name) / "manuscript_guide.json")

    def tearDown(self):
        self._dir.cleanup()

    def write(self, *entities: dict, **document) -> None:
        guide.write_json(self.path, {"schema_version": 2, "entities": list(entities), **document})

    def document(self) -> dict:
        with open(self.path, encoding="utf-8") as handle:
            return json.load(handle)

    def read(self, entity_id: str) -> dict:
        return next(value for value in self.document()["entities"] if value["id"] == entity_id)

    def types(self) -> list[dict]:
        return rows(guide.guide_types(self.document()))

    # 1
    def test_a_new_file_lists_the_default_types_with_character_speaking(self):
        self.write(entity("e-wren", "Wren", "Character"))
        self.assertEqual(DEFAULTS, self.types())
        self.assertNotIn("types", self.document(), "reading an old file writes nothing")
        self.assertEqual(DEFAULTS, rows(guide.guide_types({})))
        self.assertEqual(["Character"], [row["name"] for row in guide.guide_types({}) if row["speaks"]])
        self.assertEqual(set(guide.VALID_CATEGORIES), {row["name"] for row in DEFAULTS})
        # The host's guide.DefaultTypes reads this file, so the two lists cannot drift.
        contract_files.check("guide-types-default-sidecar", rows(guide.guide_types({})))

    def test_a_rebuild_keeps_the_stored_list(self):
        types = [{**row, "builtin": row["name"]} for row in DEFAULTS]
        types[1]["colour"] = "rose"
        self.write(entity("e-wren", "Wren", "Character"), types=types)
        manuscript = Path(self._dir.name) / "manuscript.json"
        manuscript.write_text(json.dumps({"chapters": [{"id": "c1", "title": "One", "paragraphs": [{"id": "p1", "text": "Wren said hello."}]}]}))
        with (
            patch.object(guide, "load_manuscript", return_value=[{"chapter": "One", "text": "Wren said hello."}]),
            patch.object(guide, "document_hash", return_value="x"),
        ):
            guide.build(
                argparse.Namespace(manuscript=str(manuscript), out=self.path, progress=None, spacy_model=guide.RULES_ONLY, espeak_library="", default_source="")
            )
        self.assertEqual("rose", self.types()[1]["colour"])
        self.assertEqual(types, self.document()["types"])

    def test_a_malformed_list_is_refused_rather_than_guessed(self):
        for bad in (
            {"types": "Character"},
            {"types": [{"name": "", "colour": "green", "speaks": True}]},
            {"types": [{"name": "A", "colour": "pink", "speaks": False}]},
            {"types": []},
        ):
            with self.subTest(bad=bad), self.assertRaisesRegex(ValueError, "types"):
                guide.guide_types(bad)

    # 2
    def test_a_rebuild_files_new_entries_under_the_renamed_type(self):
        types = [{**row, "builtin": row["name"]} for row in DEFAULTS]
        types[0]["name"] = "Person"
        del types[1]
        generated = [entity("e-wren", "Wren", "Character"), entity("e-town", "Dawnspire", "Place", review={"entry": False, "aliases": []})]
        guide.file_under_types(generated, types)
        self.assertEqual("Person", generated[0]["category"])
        self.assertEqual(("Needs Review", "needs review", True), (generated[1]["category"], generated[1]["review_state"], generated[1]["review"]["entry"]))


if __name__ == "__main__":
    unittest.main()
