"""The Story Bible types (SN-B95): a stored, editable list of ``{name, colour, speaks}`` in the Story Bible file.

A file with no ``types`` list reads as the defaults, which are the fixed categories of before with their colours and only Character
speaking, so an old file reads exactly as it did. The first edit writes the whole list. A type's ``speaks`` flag decides which entries can
have a speaker colour and which names the dialogue cues resolve to.
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

    def run_command(self, command, **fields) -> None:
        command(argparse.Namespace(guide=self.path, **fields))

    # 1
    def test_a_new_file_lists_the_default_types_with_character_speaking(self):
        self.write(entity("e-wren", "Wren", "Character"))
        self.assertEqual(DEFAULTS, self.types())
        self.assertNotIn("types", self.document(), "reading an old file writes nothing")
        self.assertEqual(DEFAULTS, rows(guide.guide_types({})))
        self.assertEqual({"Character"}, guide.speaking_types({}))
        self.assertEqual(set(guide.VALID_CATEGORIES), {row["name"] for row in DEFAULTS})
        # The host's guide.DefaultTypes reads this file, so the two lists cannot drift.
        contract_files.check("guide-types-default-sidecar", rows(guide.guide_types({})))

    def test_an_edit_writes_the_whole_list_and_a_rebuild_keeps_it(self):
        self.write(entity("e-wren", "Wren", "Character"))
        self.run_command(guide.type_colour, name="Place", colour="rose")
        self.assertEqual("rose", self.types()[1]["colour"])
        self.assertEqual(6, len(self.document()["types"]))
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

    def test_a_malformed_list_is_refused_rather_than_guessed(self):
        for bad in (
            {"types": "Character"},
            {"types": [{"name": "", "colour": "green", "speaks": True}]},
            {"types": [{"name": "A", "colour": "pink", "speaks": False}]},
            {"types": []},
        ):
            with self.subTest(bad=bad), self.assertRaisesRegex(ValueError, "types"):
                guide.guide_types(bad)

    def test_adding_a_type_takes_the_next_colour_and_does_not_speak(self):
        self.write()
        self.run_command(guide.type_add, name="  Creature ")
        self.assertEqual({"name": "Creature", "colour": "green", "speaks": False}, self.types()[-1])
        for bad in ("", "creature", "Needs Review", "Draft", "x" * 41, "two\nlines"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.run_command(guide.type_add, name=bad)

    def test_a_type_command_starts_a_story_bible_that_does_not_exist_yet(self):
        self.run_command(guide.type_add, name="Creature")
        self.assertEqual([*DEFAULTS, {"name": "Creature", "colour": "green", "speaks": False}], self.types())
        self.assertEqual([], self.document()["entities"])

    # 2
    def test_renaming_a_type_moves_its_entries_and_refuses_an_empty_or_taken_name(self):
        self.write(entity("e-wren", "Wren", "Character"), entity("e-ash", "Ash", "Character", locked=True), entity("e-town", "Dawnspire", "Place"))
        self.run_command(guide.type_rename, name="Character", to="Person")
        self.assertEqual("Person", self.types()[0]["name"])
        self.assertEqual(["Person", "Person", "Place"], [self.read(key)["category"] for key in ("e-wren", "e-ash", "e-town")])
        self.assertEqual({"Person"}, guide.speaking_types(self.document()))
        for to in ("", "   ", "Place", "place", "Needs Review"):
            with self.subTest(to=to), self.assertRaises(ValueError):
                self.run_command(guide.type_rename, name="Person", to=to)
        with self.assertRaisesRegex(ValueError, "no type"):
            self.run_command(guide.type_rename, name="Character", to="Someone")
        self.assertEqual("Person", self.types()[0]["name"])

    def test_an_edit_and_a_create_accept_the_listed_types_only(self):
        self.write(entity("e-wren", "Wren", "Character"))
        self.run_command(guide.type_rename, name="Place", to="Location")
        document = self.document()
        guide.apply_edit(document["entities"][0], "category", "Location", None, None, categories=guide.type_names(document))
        with self.assertRaises(ValueError):
            guide.apply_edit(document["entities"][0], "category", "Place", None, None, categories=guide.type_names(document))
        with patch.object(guide, "load_manuscript", return_value=[]):
            fields = {"manuscript": "unused", "aliases": "", "espeak_library": "", "default_source": "", "description": "", "properties": ""}
            self.run_command(guide.create, name="Dawnspire", category="Location", **fields)
            with self.assertRaisesRegex(ValueError, "Unknown category"):
                self.run_command(guide.create, name="Ash", category="Place", **fields)

    def test_a_rebuild_files_new_entries_under_the_renamed_type(self):
        types = [{**row, "builtin": row["name"]} for row in DEFAULTS]
        types[0]["name"] = "Person"
        del types[1]
        generated = [entity("e-wren", "Wren", "Character"), entity("e-town", "Dawnspire", "Place", review={"entry": False, "aliases": []})]
        guide.file_under_types(generated, types)
        self.assertEqual("Person", generated[0]["category"])
        self.assertEqual(("Needs Review", "needs review", True), (generated[1]["category"], generated[1]["review_state"], generated[1]["review"]["entry"]))

    # 3
    def test_a_type_in_use_or_the_last_type_cannot_be_removed(self):
        self.write(entity("e-wren", "Wren", "Character"))
        with self.assertRaisesRegex(ValueError, "in use"):
            self.run_command(guide.type_remove, name="Character")
        self.run_command(guide.type_remove, name="Place")
        self.assertNotIn("Place", [row["name"] for row in self.types()])
        for name in ("Organization", "Lore", "Item", "Event"):
            self.run_command(guide.type_remove, name=name)
        self.write(types=self.document()["types"])
        with self.assertRaisesRegex(ValueError, "last"):
            self.run_command(guide.type_remove, name="Character")

    def test_a_colour_outside_the_palette_is_refused(self):
        self.write()
        with self.assertRaisesRegex(ValueError, "colour"):
            self.run_command(guide.type_colour, name="Place", colour="pink")
        self.assertNotIn("types", self.document())

    # 4
    def test_speaker_colour_and_dialogue_cues_follow_the_can_speak_flag(self):
        self.write(entity("e-wren", "Wren", "Character"), entity("e-town", "Dawnspire", "Place"))
        with self.assertRaisesRegex(ValueError, "type can speak"):
            self.run_command(guide.speaker_color, entity_id="e-town", index=2)
        self.run_command(guide.type_speaks, name="Place", speaks=1)
        self.run_command(guide.speaker_color, entity_id="e-town", index=2)
        self.assertEqual(2, self.read("e-town")["speaker_color"])
        self.run_command(guide.type_speaks, name="Character", speaks=0)
        with self.assertRaisesRegex(ValueError, "type can speak"):
            self.run_command(guide.speaker_color, entity_id="e-wren", index=3)

        entities = self.document()["entities"]
        speaking = guide.speaking_types(self.document())
        self.assertEqual({"dawnspire": "e-town"}, guide.character_name_index(entities, speaking))
        self.assertEqual({"wren": "e-wren"}, guide.character_name_index(entities), "without a list, Character speaks as before")
        cues = guide.extract_cues_from_text('"Come in," Dawnspire said. "No," Wren said.', guide.character_name_index(entities, speaking))
        self.assertEqual(["e-town", None], [cue["speaker_entity_id"] for cue in cues])

    def test_the_type_edits_match_the_committed_contract_file(self):
        self.write(entity("e-wren", "Wren", "Character"))
        self.run_command(guide.type_add, name="Creature")
        self.run_command(guide.type_speaks, name="Creature", speaks=1)
        self.run_command(guide.type_colour, name="Creature", colour="amber")
        self.run_command(guide.type_rename, name="Place", to="Location")
        self.run_command(guide.type_remove, name="Event")
        contract_files.check("guide-types-sidecar", self.document()["types"])


if __name__ == "__main__":
    unittest.main()
