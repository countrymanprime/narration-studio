"""The harness end to end: offline on fakes (acceptance test 2), the sources the protocol names with the missing ones
`not run` (3), chapters fixed after the first run, and nothing downloaded or large reaching git (6)."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).parents[1]
sys.path.insert(0, str(HERE))

import run_calibration
from calibration import books, demo, gold, sources

REPO = HERE.parents[2]


class OfflineRunTest(unittest.TestCase):
    def test_the_harness_runs_on_fakes_without_a_model_or_a_network_and_writes_the_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(run_calibration.main(["run", "--fake", "--data-dir", tmp]), 0)
            text = (Path(tmp) / "out" / "report.md").read_text(encoding="utf-8")
        self.assertIn("Fake demonstration", text)
        self.assertIn("Confidence versus correctness", text)
        self.assertIn("Confident but wrong", text)
        self.assertIn("Threshold recommendation", text)
        self.assertIn("| entry | 5 | 5 | 0 | 3 |", text)


class SourcesTest(unittest.TestCase):
    def test_a_source_that_is_not_installed_is_not_run_with_a_sentence(self):
        for run in (sources.run_installed("GLiNER", REPO, Path("m.json"), "gliner", "", "wheel-gliner", "gliner"), sources.read_import("")):
            self.assertEqual(run.status, "not run")
            self.assertTrue(run.reason.endswith("."))

    def test_the_rules_baseline_runs_the_sidecars_suggest_command_and_a_missing_gold_set_is_not_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            folder = data / "book"
            folder.mkdir()
            books.write_manuscript(folder, "book", demo.BOOKS["demo-one"])
            run = sources.run_rules(REPO, folder / "manuscript.json", "test")
            self.assertEqual(run.status, "ran", run.reason)
            self.assertTrue(all("payload" in item for item in run.items))
            run.items_by_book = {"book": run.items}
            result = run_calibration.evaluate_by_book(run, ["book"], data, 0.75, "rules")
            self.assertIn("no gold set", result["books"]["book"]["skipped"])

    def test_an_imported_file_is_read_and_its_hash_is_its_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "llm.jsonl"
            path.write_text(json.dumps({"payload": {"kind": "entry", "name": "Mole"}, "confidence": None, "quotes": []}) + "\n", encoding="utf-8")
            run = sources.read_import(str(path))
            self.assertEqual((run.status, len(run.items)), ("ran", 1))
            self.assertEqual(len(run.versions["sha256"]), 64)
            path.write_text("not json", encoding="utf-8")
            self.assertEqual(sources.read_import(str(path)).status, "not run")


class BooksTest(unittest.TestCase):
    TEXT = "*** START OF THE PROJECT GUTENBERG EBOOK X ***\nCONTENTS\nI. ONE\nII. TWO\n\nI. ONE\n\nFirst para.\n\nSecond para.\n\nII. TWO\n\nThird para.\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\nlicence"

    def test_chapters_are_cut_from_the_later_heading_not_the_contents_list(self):
        chapters = books.split_chapters(books.strip_gutenberg(self.TEXT))
        self.assertEqual(chapters["I"], ("ONE", ["First para.", "Second para."]))
        self.assertEqual(chapters["II"][1], ["Third para."])

    def test_the_chapter_list_cannot_change_after_the_first_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            book = {"id": "b", "chapters": ["I"]}
            path, words = books.build_manuscript(folder, book, self.TEXT)
            self.assertEqual(words, 4)
            self.assertEqual(len(books.paragraph_texts(path)), 2)
            with self.assertRaisesRegex(ValueError, "fixed on the first run"):
                books.build_manuscript(folder, {"id": "b", "chapters": ["I", "II"]}, self.TEXT)

    def test_gold_with_an_unknown_kind_is_an_error_and_shortfalls_are_listed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "gold.jsonl"
            path.write_text(json.dumps({"id": "1", "kind": "nonsense", "payload": {}}) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "nonsense"):
                gold.load_gold(path)
        self.assertEqual(gold.shortfalls({"entry": set(range(40))})["speaker"], (0, 100))
        self.assertNotIn("entry", gold.shortfalls({"entry": set(range(40))}))


class NothingLargeIsCommittedTest(unittest.TestCase):
    def test_downloaded_texts_gold_and_output_are_ignored(self):
        def ignored(path):
            return subprocess.run(["git", "check-ignore", "-q", path], cwd=REPO, check=False).returncode == 0

        folder = "scripts/research/extraction-calibration/data"
        for path in ("wind-in-the-willows/text.txt", "wind-in-the-willows/gold.jsonl", "three-men-in-a-boat/manuscript.json", "out/report.md"):
            self.assertTrue(ignored(f"{folder}/{path}"), path)
        self.assertFalse(ignored(f"{folder}/books.json"))

    def test_the_book_list_names_two_scored_books_and_one_smoke_book(self):
        listed = json.loads((HERE / "data" / "books.json").read_text(encoding="utf-8"))["books"]
        self.assertEqual(sorted(b["role"] for b in listed), ["scored", "scored", "smoke"])


if __name__ == "__main__":
    unittest.main()
