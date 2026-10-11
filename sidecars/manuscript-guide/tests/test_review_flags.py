"""A Story Bible entry's review flags and its speaker colour override (SNB-3b, SNB-4b).

``review`` is ``{entry, aliases}``: the entry itself, and the alias texts, that still need the narrator's look. A file written before it
reads ``entry`` from ``review_state``. ``speaker_color`` is 1..7, the ``--speaker-N`` hue of ADR 0367; absent means the stable pick.
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

LOCKED = "This entity is locked. Unlock it before editing."


def entity(entity_id: str, name: str, aliases: list[str], **fields) -> dict:
    return {
        "id": entity_id,
        "canonical_name": name,
        "category": "Character",
        "aliases": [{"text": text, "pronunciation": {}, "occurrences": []} for text in aliases],
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


class ReviewFlagTests(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.path = str(Path(self._dir.name) / "manuscript_guide.json")

    def tearDown(self):
        self._dir.cleanup()

    def write(self, *entities: dict) -> None:
        guide.write_json(self.path, {"schema_version": 2, "entities": list(entities)})

    def read(self, entity_id: str = "entity-wren") -> dict:
        with open(self.path, encoding="utf-8") as handle:
            return next(value for value in json.load(handle)["entities"] if value["id"] == entity_id)

    def mark(self, alias_index=None, entity_id="entity-wren"):
        guide.mark_reviewed(argparse.Namespace(guide=self.path, entity_id=entity_id, alias_index=alias_index))

    def flag(self, alias_index=None, entity_id="entity-wren"):
        guide.review_flag(argparse.Namespace(guide=self.path, entity_id=entity_id, alias_index=alias_index))

    def colour(self, index, entity_id="entity-wren"):
        guide.speaker_color(argparse.Namespace(guide=self.path, entity_id=entity_id, index=index))

    # 1. entity-carries-a-review-object
    def test_a_file_written_before_review_reads_the_entry_flag_from_review_state(self):
        self.assertEqual({"entry": True, "aliases": []}, guide.entity_review(entity("e", "Wren", [], review_state="needs review")))
        self.assertEqual({"entry": False, "aliases": []}, guide.entity_review(entity("e", "Wren", [], review_state="generated")))

    def test_a_stored_review_wins_and_keeps_only_the_names_the_entry_has(self):
        value = entity("e", "Wren", ["Sparrow"], review_state="needs review", review={"entry": False, "aliases": ["Sparrow", "Gone", 3]})
        self.assertEqual({"entry": False, "aliases": ["Sparrow"]}, guide.entity_review(value))

    def test_a_build_writes_the_review_object(self):
        paragraphs = [{"chapter": "Chapter 1", "text": "Captain Arelian said the Council of Ash would meet in Dawnspire."}]
        with patch.object(guide, "spacy_candidates", return_value=None):
            built = guide.build_entities(paragraphs, "unused", None)
        for value in built:
            self.assertEqual({"entry": value["review_state"] == "needs review", "aliases": []}, value["review"])

    # 2. mark-reviewed-clears-the-entry-or-one-name
    def test_mark_reviewed_clears_the_entry_and_every_name(self):
        self.write(entity("entity-wren", "Wren", ["Sparrow", "Jenny"], review_state="needs review", review={"entry": True, "aliases": ["Sparrow", "Jenny"]}))
        self.mark()
        saved = self.read()
        self.assertEqual({"entry": False, "aliases": []}, saved["review"])
        self.assertEqual("reviewed", saved["review_state"])

    def test_mark_one_name_reviewed_clears_that_name_only(self):
        self.write(entity("entity-wren", "Wren", ["Sparrow", "Jenny"], review={"entry": True, "aliases": ["Sparrow", "Jenny"]}))
        self.mark(alias_index=0)
        self.assertEqual({"entry": True, "aliases": ["Jenny"]}, self.read()["review"])

    def test_the_entry_is_reviewed_when_its_last_name_is(self):
        self.write(entity("entity-wren", "Wren", ["Sparrow"], review_state="needs review", review={"entry": False, "aliases": ["Sparrow"]}))
        self.mark(alias_index=0)
        saved = self.read()
        self.assertEqual({"entry": False, "aliases": []}, saved["review"])
        self.assertEqual("reviewed", saved["review_state"])

    def test_mark_reviewed_is_refused_on_a_locked_entry_and_for_a_name_it_does_not_have(self):
        self.write(entity("entity-wren", "Wren", ["Sparrow"], locked=True, review={"entry": True, "aliases": []}))
        with self.assertRaisesRegex(ValueError, LOCKED):
            self.mark()
        self.write(entity("entity-wren", "Wren", ["Sparrow"]))
        with self.assertRaisesRegex(ValueError, "Alias index out of range."):
            self.mark(alias_index=4)

    # 3. flag-review-sets-the-flag-and-is-the-undo-of-mark-reviewed
    def test_flag_review_is_the_undo_of_mark_reviewed(self):
        before = entity("entity-wren", "Wren", ["Sparrow"], review_state="needs review", review={"entry": True, "aliases": ["Sparrow"]})
        self.write(before)
        self.mark()
        self.flag()
        self.flag(alias_index=0)
        saved = self.read()
        self.assertEqual({"entry": True, "aliases": ["Sparrow"]}, saved["review"])
        self.assertEqual("needs review", saved["review_state"])

    def test_flagging_a_name_leaves_the_entry_flag_alone(self):
        self.write(entity("entity-wren", "Wren", ["Sparrow"]))
        self.flag(alias_index=0)
        saved = self.read()
        self.assertEqual({"entry": False, "aliases": ["Sparrow"]}, saved["review"])
        self.assertEqual("generated", saved["review_state"])

    def test_flagging_what_is_flagged_changes_nothing(self):
        self.write(entity("entity-wren", "Wren", ["Sparrow"], review_state="needs review", review={"entry": True, "aliases": ["Sparrow"]}))
        with patch.object(guide, "write_json") as write:
            self.flag()
            self.flag(alias_index=0)
        write.assert_not_called()

    def test_flag_review_is_refused_on_a_locked_entry(self):
        self.write(entity("entity-wren", "Wren", [], locked=True))
        with self.assertRaisesRegex(ValueError, LOCKED):
            self.flag()

    def test_removing_a_name_drops_its_flag(self):
        self.write(entity("entity-wren", "Wren", ["Sparrow", "Jenny"], review={"entry": False, "aliases": ["Sparrow", "Jenny"]}))
        guide.edit(argparse.Namespace(guide=self.path, entity_id="entity-wren", field=["aliases"], value=["Jenny"], manuscript=None, espeak_library=""))
        self.assertEqual(["Jenny"], self.read()["review"]["aliases"])

    # 4. merge-keeps-the-flags-of-both
    def test_merge_keeps_the_flags_of_both(self):
        target = entity("entity-a", "Wren", ["Sparrow"], review={"entry": False, "aliases": ["Sparrow"]})
        source = entity("entity-b", "Jenny", ["Jen"], review_state="needs review", review={"entry": True, "aliases": ["Jen", "Old name"]})
        self.write(target, source)
        guide.merge(argparse.Namespace(guide=self.path, source_id="entity-b", target_id="entity-a"))
        self.assertEqual({"entry": True, "aliases": ["Sparrow", "Jen"]}, self.read("entity-a")["review"])

    def test_merge_of_two_unflagged_entries_stays_unflagged(self):
        self.write(entity("entity-a", "Wren", []), entity("entity-b", "Jenny", []))
        guide.merge(argparse.Namespace(guide=self.path, source_id="entity-b", target_id="entity-a"))
        self.assertEqual({"entry": False, "aliases": []}, self.read("entity-a")["review"])

    def test_split_gives_the_names_flag_back_to_the_new_entry(self):
        self.write(entity("entity-wren", "Wren", ["Sparrow", "Jenny"], review={"entry": False, "aliases": ["Sparrow"]}))
        guide.split(argparse.Namespace(guide=self.path, entity_id="entity-wren", alias_text="Sparrow"))
        self.assertEqual({"entry": False, "aliases": []}, self.read()["review"])
        self.assertEqual({"entry": True, "aliases": []}, self.read(guide.entity_id("Sparrow"))["review"])

    def test_split_of_an_unflagged_name_is_not_flagged(self):
        self.write(entity("entity-wren", "Wren", ["Sparrow"]))
        guide.split(argparse.Namespace(guide=self.path, entity_id="entity-wren", alias_text="Sparrow"))
        self.assertEqual({"entry": False, "aliases": []}, self.read(guide.entity_id("Sparrow"))["review"])

    def test_a_rebuild_keeps_the_narrators_flags_and_colour(self):
        prior = entity("entity-wren", "Wren", ["Sparrow"], review={"entry": False, "aliases": ["Sparrow"]}, speaker_color=4)
        fresh = entity("entity-wren", "Wren", ["Sparrow"], review_state="needs review", review={"entry": True, "aliases": []})
        merged = guide.merge_locked([fresh], {"entities": [prior]})
        self.assertEqual({"entry": False, "aliases": ["Sparrow"]}, merged[0]["review"])
        self.assertEqual(4, merged[0]["speaker_color"])

    # 5. colour-override-wins
    def test_the_speaker_colour_is_stored_and_zero_puts_it_back_to_automatic(self):
        self.write(entity("entity-wren", "Wren", []))
        self.colour(7)
        self.assertEqual(7, self.read()["speaker_color"])
        self.colour(0)
        self.assertNotIn("speaker_color", self.read())

    def test_a_colour_outside_one_to_seven_is_refused(self):
        self.write(entity("entity-wren", "Wren", []))
        for bad in (-1, 8):
            with self.assertRaisesRegex(ValueError, "A speaker colour is 1 to 7, or 0 for automatic."):
                self.colour(bad)

    def test_the_colour_is_refused_on_a_locked_entry(self):
        self.write(entity("entity-wren", "Wren", [], locked=True))
        with self.assertRaisesRegex(ValueError, LOCKED):
            self.colour(2)

    def test_merge_keeps_the_targets_colour_else_takes_the_sources(self):
        self.write(entity("entity-a", "Wren", [], speaker_color=2), entity("entity-b", "Jenny", [], speaker_color=5))
        guide.merge(argparse.Namespace(guide=self.path, source_id="entity-b", target_id="entity-a"))
        self.assertEqual(2, self.read("entity-a")["speaker_color"])
        self.write(entity("entity-a", "Wren", []), entity("entity-b", "Jenny", [], speaker_color=5))
        guide.merge(argparse.Namespace(guide=self.path, source_id="entity-b", target_id="entity-a"))
        self.assertEqual(5, self.read("entity-a")["speaker_color"])

    # 6. colour-only-for-speaking-types
    def test_the_colour_is_refused_for_a_category_that_cannot_speak(self):
        for category in ("Place", "Item", "Needs Review"):
            self.write(entity("entity-wren", "Wren", [], category=category))
            with self.assertRaisesRegex(ValueError, "Only a character speaks, so only a character has a speaker colour."):
                self.colour(3)


class ReviewContractGoldenTests(unittest.TestCase):
    """The entities after Mark reviewed and after Flag review plus a colour, as the sidecar writes them. The Go host reads both back
    and pins what it sends to the UI (guide-review-marked.json, guide-review-flagged.json)."""

    def test_the_review_and_colour_writes_match_the_committed_contract_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = str(Path(temporary) / "manuscript_guide.json")
            start = entity("entity-wren", "Wren", ["the Sparrow", "Jenny"], review_state="needs review", review={"entry": True, "aliases": ["the Sparrow"]})
            guide.write_json(path, {"schema_version": 2, "entities": [start]})
            target = {"guide": path, "entity_id": "entity-wren"}
            guide.mark_reviewed(argparse.Namespace(**target, alias_index=None))
            with open(path, encoding="utf-8") as handle:
                contract_files.check("guide-review-marked-sidecar", json.load(handle)["entities"])
            guide.review_flag(argparse.Namespace(**target, alias_index=1))
            guide.speaker_color(argparse.Namespace(**target, index=3))
            with open(path, encoding="utf-8") as handle:
                contract_files.check("guide-review-flagged-sidecar", json.load(handle)["entities"])
