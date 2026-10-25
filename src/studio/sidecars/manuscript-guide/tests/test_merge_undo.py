"""A rebuild and the undo of a Story Bible merge (SN-B93, G14).

The host merges and takes a merge back itself (src/studio/desktop/internal/guide/merge.go): a merge stores its undo in the file's
``merge_undo`` and the names it absorbed in ``absorbed_names``. A rebuild writes a new file without the undo records, so a merge from
before it can no longer be taken back, and keeps the absorbed names, so the merged name does not come back as an entry of its own.
"""

import argparse
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)


def merged_file() -> dict:
    """A Story Bible as the host leaves it after merging Nico into Nicholas: Nico is an alias, and the undo record is stored."""
    return {
        "schema_version": 2,
        "source": {},
        "entities": [
            {
                "id": "nicholas",
                "canonical_name": "Nicholas",
                "aliases": [{"text": "Nico", "pronunciation": {}, "occurrences": []}],
                "category": "Character",
                "occurrences": [],
                "relationships": [],
            },
            {"id": "wren", "canonical_name": "Wren", "aliases": [], "category": "Character", "occurrences": [], "relationships": []},
        ],
        "absorbed_names": {"nicky": "nicholas", "nico": "nicholas"},
        "merge_undo": [{"id": "0123456789abcdef", "source_index": 1, "source": {"id": "nico"}, "target": {"id": "nicholas"}}],
    }


class MergeUndoTests(unittest.TestCase):
    def test_a_rebuild_drops_the_undo_records_and_keeps_the_absorbed_names(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "ManuscriptGuide" / "manuscript_guide.json"
            guide.write_json(str(path), merged_file())
            manuscript = root / "manuscript.json"
            manuscript.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "documentId": "test",
                        "chapters": [{"id": "c-0001", "title": "One"}],
                        "paragraphs": [{"id": "p-000001", "chapterId": "c-0001", "chapterTitle": "One", "text": "Nicholas met Wren by the river."}],
                    }
                ),
                encoding="utf-8",
            )
            guide.build(argparse.Namespace(manuscript=str(manuscript), out=str(path), progress=None, spacy_model=guide.RULES_ONLY, espeak_library=""))
            rebuilt = json.loads(path.read_text(encoding="utf-8"))
        self.assertNotIn("merge_undo", rebuilt)
        self.assertEqual(rebuilt["absorbed_names"], {"nicky": "nicholas", "nico": "nicholas"})


if __name__ == "__main__":
    unittest.main()
