"""The undo of a Story Bible merge: `merge` records what it changed in the file and prints an undo id, and `unmerge` with that id
gives the file back as it was, or refuses with a reason when something it would overwrite changed since (SN-B93, G14)."""

import argparse
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)


def _evidence(chapter: str, paragraph: int, excerpt: str) -> dict:
    return {"chapter": chapter, "paragraph": paragraph, "excerpt": excerpt}


def merge_fixture() -> dict:
    """Three entries: Nico is merged into Nicholas, and Wren points at both of them."""
    return {
        "schema_version": 2,
        "source": {},
        "entities": [
            {
                "id": "nicholas",
                "canonical_name": "Nicholas",
                "aliases": [{"text": "Nick", "pronunciation": {"ipa": "nɪk", "source": "manual"}, "occurrences": [_evidence("One", 1, "Nick ran.")]}],
                "category": "Character",
                "occurrences": [_evidence("One", 0, "Nicholas sat.")],
                "pronunciation": {"ipa": "ˈnɪkələs", "source": "cmudict"},
                "description": {"text": "", "evidence": {}},
                "relationships": [{"id": "wren", "name": "Wren", "label": "friend"}],
                "appearances": [{"chapterId": "c-0001", "sceneIndex": 0}],
            },
            {
                "id": "nico",
                "canonical_name": "Nico",
                "aliases": [{"text": "N.", "pronunciation": {"ipa": "ɛn", "source": "manual"}, "occurrences": [_evidence("Two", 4, "N. waved.")]}],
                "category": "Character",
                "occurrences": [_evidence("Two", 3, "Nico laughed.")],
                "pronunciation": {"ipa": "ˈniːkoʊ", "source": "manual"},
                "description": {"text": "A boy who laughs.", "evidence": {}},
                "relationships": [{"id": "wren", "name": "Wren", "label": "brother"}, {"id": "nicholas", "name": "Nicholas", "label": "same"}],
                "appearances": [{"chapterId": "c-0002", "sceneIndex": 1}],
            },
            {
                "id": "wren",
                "canonical_name": "Wren",
                "aliases": [],
                "category": "Character",
                "occurrences": [],
                "relationships": [{"id": "nico", "name": "Nico", "label": "sister"}, {"id": "nicholas", "name": "Nicholas", "label": "friend"}],
            },
        ],
        "absorbed_names": {"nicky": "nicholas"},
    }


def write_fixture(root: Path, data: dict | None = None) -> Path:
    path = root / "ManuscriptGuide" / "manuscript_guide.json"
    guide.write_json(str(path), data or merge_fixture())
    return path


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def run_merge(path: Path, source: str = "nico", target: str = "nicholas") -> str:
    out = io.StringIO()
    with redirect_stdout(out):
        guide.merge(argparse.Namespace(guide=str(path), source_id=source, target_id=target))
    kind, merged_into, undo_id = out.getvalue().strip().split("|")
    assert (kind, merged_into) == ("MERGED", target)
    return undo_id


def run_unmerge(path: Path, undo_id: str) -> str:
    out = io.StringIO()
    with redirect_stdout(out):
        guide.unmerge(argparse.Namespace(guide=str(path), undo_id=undo_id))
    return out.getvalue().strip()


class MergeUndoTests(unittest.TestCase):
    def setUp(self):
        self._temporary = tempfile.TemporaryDirectory()
        self.root = Path(self._temporary.name)
        self.path = write_fixture(self.root)

    def tearDown(self):
        self._temporary.cleanup()

    def test_unmerge_restores_both_entries_their_relationships_and_absorbed_names(self):
        before = read(self.path)
        undo_id = run_merge(self.path)
        merged = read(self.path)
        self.assertNotIn("nico", [entity["id"] for entity in merged["entities"]])
        self.assertEqual(merged["absorbed_names"]["nico"], "nicholas")

        self.assertEqual(run_unmerge(self.path, undo_id), "UNMERGED|nico|nicholas")
        # The whole file as it was: both entries, the source back in its place, Wren's relationship to Nico, and no absorbed name the
        # merge added (Nicky, there before, stays).
        self.assertEqual(read(self.path), before)

    def test_unmerge_after_another_edit_to_the_target_is_refused_with_a_reason(self):
        undo_id = run_merge(self.path)
        guide.edit(argparse.Namespace(guide=str(self.path), entity_id="nicholas", field=["description"], value=["Edited."], manuscript=None, espeak_library=""))
        edited = read(self.path)
        with self.assertRaisesRegex(ValueError, "Nicholas changed after the merge"):
            run_unmerge(self.path, undo_id)
        self.assertEqual(read(self.path), edited)

    def test_unmerge_after_a_repointed_relationship_changed_is_refused(self):
        undo_id = run_merge(self.path)
        guide.unrelate(argparse.Namespace(guide=str(self.path), entity_id="wren", other_id="nicholas", label="sister"))
        changed = read(self.path)
        with self.assertRaisesRegex(ValueError, "Wren's relationships changed after the merge"):
            run_unmerge(self.path, undo_id)
        self.assertEqual(read(self.path), changed)

    def test_an_edit_to_an_entry_the_merge_did_not_touch_does_not_block_the_undo(self):
        data = merge_fixture()
        data["entities"].append({"id": "moss", "canonical_name": "Moss", "aliases": [], "category": "Place", "relationships": []})
        write_fixture(self.root, data)
        undo_id = run_merge(self.path)
        guide.edit(argparse.Namespace(guide=str(self.path), entity_id="moss", field=["description"], value=["Damp."], manuscript=None, espeak_library=""))
        run_unmerge(self.path, undo_id)
        restored = read(self.path)
        self.assertEqual([entity["id"] for entity in restored["entities"]], ["nicholas", "nico", "wren", "moss"])
        self.assertEqual(restored["entities"][3]["description"]["text"], "Damp.")

    def test_unmerge_refuses_an_id_it_does_not_know_and_a_second_undo(self):
        with self.assertRaisesRegex(ValueError, "can no longer be undone"):
            run_unmerge(self.path, "0123456789abcdef")
        undo_id = run_merge(self.path)
        run_unmerge(self.path, undo_id)
        with self.assertRaisesRegex(ValueError, "can no longer be undone"):
            run_unmerge(self.path, undo_id)

    def test_unmerge_refuses_when_an_entry_now_has_the_sources_id(self):
        undo_id = run_merge(self.path)
        data = read(self.path)
        data["entities"].append({"id": "nico", "canonical_name": "Nico", "aliases": [], "category": "Draft", "relationships": []})
        guide.write_json(str(self.path), data)
        with self.assertRaisesRegex(ValueError, "An entry named Nico is in the Story Bible again"):
            run_unmerge(self.path, undo_id)

    def test_unmerge_refuses_when_the_target_is_gone(self):
        undo_id = run_merge(self.path)
        guide.delete(argparse.Namespace(guide=str(self.path), entity_id="nicholas"))
        with self.assertRaisesRegex(ValueError, "Nicholas is no longer in the Story Bible"):
            run_unmerge(self.path, undo_id)

    def test_two_merges_into_one_target_undo_newest_first(self):
        data = merge_fixture()
        data["entities"].append({"id": "nicky-boy", "canonical_name": "Nicky Boy", "aliases": [], "category": "Character", "relationships": []})
        write_fixture(self.root, data)
        before = read(self.path)
        first = run_merge(self.path)
        after_first = read(self.path)
        second = run_merge(self.path, source="nicky-boy")
        # The first merge's target has changed since (the second merge), so its undo waits until the second is undone.
        with self.assertRaisesRegex(ValueError, "Nicholas changed after the merge"):
            run_unmerge(self.path, first)
        run_unmerge(self.path, second)
        self.assertEqual(read(self.path), after_first)
        run_unmerge(self.path, first)
        self.assertEqual(read(self.path), before)

    def test_the_file_keeps_only_the_newest_undo_records(self):
        data = merge_fixture()
        extra = guide.MAX_MERGE_UNDO + 2
        data["entities"].extend(
            {"id": f"e{index}", "canonical_name": f"E{index}", "aliases": [], "category": "Place", "relationships": []} for index in range(extra * 2)
        )
        write_fixture(self.root, data)
        ids = [run_merge(self.path, source=f"e{index * 2}", target=f"e{index * 2 + 1}") for index in range(extra)]
        records = read(self.path)["merge_undo"]
        self.assertEqual([record["id"] for record in records], ids[-guide.MAX_MERGE_UNDO :])
        with self.assertRaisesRegex(ValueError, "can no longer be undone"):
            run_unmerge(self.path, ids[0])
        run_unmerge(self.path, ids[-1])

    def test_a_rebuild_drops_the_undo_records(self):
        undo_id = run_merge(self.path)
        manuscript = self.root / "manuscript.json"
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
        guide.build(argparse.Namespace(manuscript=str(manuscript), out=str(self.path), progress=None, spacy_model=guide.RULES_ONLY, espeak_library=""))
        rebuilt = read(self.path)
        self.assertNotIn("merge_undo", rebuilt)
        self.assertEqual(rebuilt["absorbed_names"]["nico"], "nicholas")
        with self.assertRaisesRegex(ValueError, "can no longer be undone"):
            run_unmerge(self.path, undo_id)

    def test_unmerge_refuses_a_malformed_id_before_reading_the_file(self):
        self.path.unlink()
        with self.assertRaisesRegex(ValueError, "not an undo id"):
            run_unmerge(self.path, "--guide")

    def test_the_command_line_merges_and_unmerges(self):
        before = read(self.path)
        script = str(MODULE_PATH)
        merged = subprocess.run(
            [sys.executable, script, "merge", "--guide", str(self.path), "--source-id", "nico", "--target-id", "nicholas"],
            capture_output=True,
            text=True,
            check=True,
        )
        undo_id = merged.stdout.strip().split("|")[2]
        unmerged = subprocess.run(
            [sys.executable, script, "unmerge", "--guide", str(self.path), "--undo-id", undo_id], capture_output=True, text=True, check=True
        )
        self.assertEqual(unmerged.stdout.strip(), "UNMERGED|nico|nicholas")
        self.assertEqual(read(self.path), before)


if __name__ == "__main__":
    unittest.main()
