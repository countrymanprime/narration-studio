"""A Story Bible entry's review flags and its speaker colour override (SNB-3b, SNB-4b), as a build reads and keeps them.

``review`` is ``{entry, aliases}``: the entry itself, and the alias texts, that still need the narrator's look. A file written before it
reads ``entry`` from ``review_state``. ``speaker_color`` is 1..7, the ``--speaker-N`` hue of docs/design/colour-and-contrast.md#per-speaker-colours; absent means the stable pick.
The host sets, clears and merges both itself (src/studio/desktop/internal/guide/mutate.go and merge.go); its tests cover those.
"""

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)


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

    def test_a_rebuild_keeps_the_narrators_flags_and_colour(self):
        prior = entity("entity-wren", "Wren", ["Sparrow"], review={"entry": False, "aliases": ["Sparrow"]}, speaker_color=4)
        fresh = entity("entity-wren", "Wren", ["Sparrow"], review_state="needs review", review={"entry": True, "aliases": []})
        merged = guide.merge_locked([fresh], {"entities": [prior]})
        self.assertEqual({"entry": False, "aliases": ["Sparrow"]}, merged[0]["review"])
        self.assertEqual(4, merged[0]["speaker_color"])


if __name__ == "__main__":
    unittest.main()
