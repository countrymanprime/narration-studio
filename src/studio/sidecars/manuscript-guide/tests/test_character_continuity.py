"""Character Continuity Review, story-bible side:

- stable entity ids across a rebuild, even when the canonical spelling choice shifts
- a rebuild after an alias split (the host splits; the inverse of its merge)
- chapter and scene appearance maps

The dialogue cues moved into the host (src/studio/desktop/internal/guide/cues.go, #2251 step 3), with their tests (cues_test.go).
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


def _paragraphs(*rows: tuple[str, str, str]) -> list[dict[str, str]]:
    """Each row is (chapterId, paragraphId, text); chapter title mirrors chapterId for readability."""
    return [
        {"chapter": chapter_id, "chapterId": chapter_id, "paragraph": str(i), "paragraphId": paragraph_id, "text": text}
        for i, (chapter_id, paragraph_id, text) in enumerate(rows)
    ]


class StableIdReconciliationTests(unittest.TestCase):
    """An unlocked, generated character keeps its id across a rebuild."""

    def test_an_unlocked_entity_keeps_its_id_when_a_title_prefixed_mention_first_appears(self):
        # Build 1: only the short form is in the text, so the id is hashed from "Arelian". The mentions are
        # mid-sentence (not sentence-initial) so the rules-only extractor accepts the single-word name at all.
        build1 = _paragraphs(("c1", "p1", "Ada saw Arelian arrive. Then Arelian sat down, and Arelian said nothing."))
        with patch.object(guide, "spacy_candidates", return_value=None):
            entities1 = guide.build_entities(build1, "unused", None)
        (arelian,) = [e for e in entities1 if e["canonical_name"] == "Arelian"]
        old_id = arelian["id"]
        previous_guide = {"entities": entities1}

        # Build 2: a new chapter's title-prefixed mention joins the group, so the canonical name (and a
        # freshly-hashed id) would otherwise become "Captain Arelian" - orphaning any review the narrator did.
        build2 = [*build1, *_paragraphs(("c2", "p2", "Captain Arelian gave the order."))]
        with patch.object(guide, "spacy_candidates", return_value=None):
            entities2 = guide.build_entities(build2, "unused", None)
        merged = guide.merge_locked(entities2, previous_guide)
        (reconciled,) = [e for e in merged if "Arelian" in e["canonical_name"]]
        self.assertEqual("Captain Arelian", reconciled["canonical_name"])
        self.assertEqual(old_id, reconciled["id"], "the id must survive even though the canonical spelling changed")

    def test_reviewed_fields_survive_the_canonical_name_shift_too(self):
        build1 = _paragraphs(("c1", "p1", "Ada saw Arelian arrive. Then Arelian sat down, and Arelian said nothing."))
        with patch.object(guide, "spacy_candidates", return_value=None):
            entities1 = guide.build_entities(build1, "unused", None)
        previous = {"entities": entities1}
        previous["entities"][0]["context"] = "A veteran navigator."
        previous["entities"][0]["review_state"] = "reviewed"

        build2 = [*build1, *_paragraphs(("c2", "p4", "Captain Arelian gave the order."))]
        with patch.object(guide, "spacy_candidates", return_value=None):
            entities2 = guide.build_entities(build2, "unused", None)
        merged = guide.merge_locked(entities2, previous)
        (reconciled,) = [e for e in merged if "Arelian" in e["canonical_name"]]
        self.assertEqual("A veteran navigator.", reconciled["context"])

    def test_two_previously_distinct_entities_are_never_silently_collapsed(self):
        # A guard against the reconciliation itself becoming a false merge: two previous entities
        # that happen to share no real name overlap must never be folded into one just because a
        # rebuild's id-hashing coincidentally lines up with the wrong entry.
        previous = {
            "entities": [
                {
                    "id": "entity-aaa",
                    "canonical_name": "Ada",
                    "aliases": [],
                    "category": "Character",
                    "occurrences": [],
                    "occurrence_count": 1,
                    "locked": False,
                    "manual": False,
                },
                {
                    "id": "entity-bbb",
                    "canonical_name": "Zeph",
                    "aliases": [],
                    "category": "Character",
                    "occurrences": [],
                    "occurrence_count": 1,
                    "locked": False,
                    "manual": False,
                },
            ]
        }
        build2 = _paragraphs(
            ("c1", "p1", "They saw Ada arrive. Then Ada waved, and Ada smiled."), ("c1", "p2", "They saw Zeph arrive. Then Zeph waved, and Zeph smiled.")
        )
        with patch.object(guide, "spacy_candidates", return_value=None):
            entities2 = guide.build_entities(build2, "unused", None)
        merged = guide.merge_locked(entities2, previous)
        ids = {e["canonical_name"]: e["id"] for e in merged}
        self.assertEqual("entity-aaa", ids["Ada"])
        self.assertEqual("entity-bbb", ids["Zeph"])


class AliasSplitTests(unittest.TestCase):
    """The host splits an alias off into an entry of its own (src/studio/desktop/internal/guide/merge.go) and clears the name's
    ``absorbed_names`` redirect; a rebuild then leaves the split entry standing alone."""

    def test_a_split_entity_does_not_come_back_on_the_next_rebuild(self):
        # The file as a split of "Robert" off Captain Arelian leaves it: Robert its own entry, and no absorbed-names redirect, so
        # merge_locked's redirect step (which only fires when a name is listed there) does not fold the freshly generated Robert back in.
        parent_id = guide.entity_id("Captain Arelian")
        robert = {"canonical_name": "Robert", "aliases": [], "category": "Character", "occurrences": [], "occurrence_count": 0, "locked": False}
        saved = {
            "entities": [
                {**robert, "id": parent_id, "canonical_name": "Captain Arelian"},
                {**robert, "id": guide.entity_id("Robert")},
            ],
            "absorbed_names": {},
        }
        rebuild_paragraphs = _paragraphs(("c1", "p0", "They heard Robert speak. Then Robert paused, and Robert spoke again."))
        with patch.object(guide, "spacy_candidates", return_value=None):
            generated = guide.build_entities(rebuild_paragraphs, "unused", None)
        merged = guide.merge_locked(generated, saved)
        robert_entry = next(e for e in merged if e["canonical_name"] == "Robert")
        self.assertEqual([], robert_entry.get("aliases", []))
        parent = next((e for e in merged if e["id"] == parent_id), None)
        self.assertTrue(parent is None or all(alias["text"] != "Robert" for alias in parent.get("aliases", [])))


class SceneAppearanceTests(unittest.TestCase):
    def test_a_scene_break_paragraph_starts_a_new_scene_and_is_itself_unassigned(self):
        paragraphs = _paragraphs(("c1", "p1", "Ada arrived."), ("c1", "p2", "* * *"), ("c1", "p3", "Ada left."))
        scenes = guide.assign_scene_indices(paragraphs)
        self.assertEqual([0, None, 1], scenes)

    def test_entities_record_which_chapter_and_scene_they_appear_in(self):
        paragraphs = _paragraphs(
            ("c1", "p1", "Ada Voss arrived. Ada Voss looked around."),
            ("c1", "p2", "***"),
            ("c1", "p3", "Ada Voss left. Ada Voss was gone."),
            ("c2", "p4", "Ada Voss returned. Ada Voss smiled."),
        )
        with patch.object(guide, "spacy_candidates", return_value=None):
            entities = guide.build_entities(paragraphs, "unused", None)
        (ada,) = [e for e in entities if e["canonical_name"] == "Ada Voss"]
        self.assertEqual(
            [
                {"chapterId": "c1", "chapter": "c1", "sceneIndex": 0},
                {"chapterId": "c1", "chapter": "c1", "sceneIndex": 1},
                {"chapterId": "c2", "chapter": "c2", "sceneIndex": 0},
            ],
            ada["appearances"],
        )


if __name__ == "__main__":
    unittest.main()
