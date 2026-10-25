"""Entity properties: an ordered list of {key, value} facts the narrator keeps on an entry.

The list is additive: a Story Bible file written before it existed has no ``properties`` and reads as an empty list, and
``schema_version`` stays 2. The host sets them (src/studio/desktop/internal/guide/edit.go, create.go and merge.go); a rebuild carries them.
"""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)

PAIRS = [{"key": "Codename", "value": "Wren"}, {"key": "Abilities", "value": "Flight, sleight of hand"}, {"key": "Dossier", "value": "Sealed."}]


def _guide_file(root: Path, **fields) -> Path:
    path = root / "ManuscriptGuide" / "manuscript_guide.json"
    entity = {"id": "entity-1", "canonical_name": "Alice", "category": "Character", "description": {"text": ""}, "aliases": [], **fields}
    guide.write_json(str(path), {"entities": [entity]})
    return path


def _entity(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))["entities"][0]


class StoredPropertiesTests(unittest.TestCase):
    def test_a_file_written_before_properties_existed_reads_as_an_empty_list(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = _guide_file(Path(temporary))
            self.assertNotIn("properties", _entity(path))
            self.assertEqual([], guide.entity_properties(_entity(path)))


class RebuildPropertiesTests(unittest.TestCase):
    def _generated(self, name: str = "Alice") -> dict:
        return {
            "id": guide.entity_id(name),
            "canonical_name": name,
            "aliases": [],
            "category": "Character",
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
            "review_state": "generated",
        }

    def test_a_built_entity_starts_with_an_empty_list(self):
        paragraphs = [{"chapter": "Chapter 1", "text": "Captain Arelian said the Council of Ash would meet in Dawnspire."}] * 3
        with patch.object(guide, "spacy_candidates", return_value=None):
            entities = guide.build_entities(paragraphs, "unused", None)
        self.assertTrue(entities)
        self.assertTrue(all(entity["properties"] == [] for entity in entities))

    def test_a_rebuild_keeps_the_properties_of_a_generated_entry(self):
        prior = {**self._generated(), "properties": PAIRS, "review_state": "reviewed"}
        merged = guide.merge_locked([self._generated()], {"entities": [prior]})
        self.assertEqual(PAIRS, merged[0]["properties"])

    def test_a_rebuild_keeps_the_properties_of_a_locked_and_a_manual_entry(self):
        locked = {**self._generated("Vex"), "locked": True, "properties": PAIRS}
        manual = {**self._generated("Nyx"), "manual": True, "properties": PAIRS[:1]}
        merged = {entity["id"]: entity for entity in guide.merge_locked([self._generated("Vex")], {"entities": [locked, manual]})}
        self.assertEqual(PAIRS, merged[locked["id"]]["properties"])
        self.assertEqual(PAIRS[:1], merged[manual["id"]]["properties"])

    def test_a_rebuild_over_a_file_without_properties_gives_an_empty_list(self):
        prior = self._generated()
        del prior["properties"]
        merged = guide.merge_locked([self._generated()], {"entities": [prior]})
        self.assertEqual([], merged[0]["properties"])


if __name__ == "__main__":
    unittest.main()
