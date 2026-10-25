"""The Story Bible ``build`` writes for the Alice fixture, pinned by its hash, the file it writes for every recorded build of
tests/fixtures/guide-cues, and the ``suggest`` sources the sidecar still runs.

The dialogue cues moved into the host (src/studio/desktop/internal/guide/cues.go, #2251 step 3): a build keeps the file's cues as they
were, and the host finds them against the new entries as soon as it ends. ``BuildKeepsTheCuesTests`` pins this half byte for byte; the
host's TestBuildThenRefreshIsTodaysBuild pins that the refresh then leaves the file the build wrote while it found the cues itself.

The rules source moved into the host (src/studio/desktop/internal/guide/rules.go, #2251 step 3), so ``suggest`` takes
``--source gliner`` or ``--source booknlp`` only; the host's TestRuleSuggestionsWriteNothing and the frozen cases in
tests/fixtures/guide-rules cover what the rules did with this book.
"""

import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import re
import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

from narration_common import brand

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)
REPO = Path(__file__).parents[5]


def _write_manuscript(root: Path, chapters: list[tuple[str, list[str]]]) -> Path:
    """A canonical manuscript.json with one chapter per (title, paragraphs) pair; paragraph ids are p-000001 onwards."""
    paragraphs, chapter_rows, index = [], [], 0
    for number, (title, texts) in enumerate(chapters, start=1):
        chapter_id = f"c-{number:04d}"
        chapter_rows.append(
            {"id": chapter_id, "title": title, "subtitle": None, "index": number - 1, "wordCount": sum(len(t.split()) for t in texts), "sections": []}
        )
        for text in texts:
            index += 1
            paragraphs.append(
                {
                    "id": f"p-{index:06d}",
                    "index": index - 1,
                    "chapterId": chapter_id,
                    "chapterTitle": title,
                    "sectionId": None,
                    "text": text,
                    "sourceIndex": index - 1,
                }
            )
    data = {
        "schemaVersion": guide.canonical_manuscript.SCHEMA_VERSION,
        "documentId": "test-document",
        "importedAt": "2026-01-01T00:00:00+00:00",
        "importer": {"format": "markdown", "version": guide.canonical_manuscript.IMPORTER_VERSION},
        "source": {"fileName": "fixture.md", "sha256": "0" * 64, "storedPath": brand.PROJECT_FOLDER + "/manuscript/sources/fixture.md"},
        "chapters": chapter_rows,
        "paragraphs": paragraphs,
    }
    path = guide.canonical_manuscript.manuscript_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def _alice_chapters() -> list[tuple[str, list[str]]]:
    """tests/fixtures/alice.md as chapters (split at its "# Chapter" headings), a paragraph per non-blank line."""
    chapters: list[tuple[str, list[str]]] = []
    for line in (REPO / "tests" / "fixtures" / "alice.md").read_text(encoding="utf-8").splitlines():
        if line.startswith("# Chapter"):
            chapters.append((line[2:], []))
        elif chapters and line.strip() and not line.startswith("#"):
            chapters[-1][1].append(line.strip())
    return chapters


# The SHA-256 of the Story Bible `build` writes for the Alice fixture (rules only, pronunciation stubbed, the
# timestamp and the absolute manuscript path left out), taken on main before the rules' suggest command (SN-X32) and again when the
# product name in the fixture manuscript changed (it moves `source.sha256` only), and again when the build's cues began suggesting
# nearby speakers (it moves `dialogue_cues` only). Moving the rules' suggest command into the host left it as it was. Moving the cues
# into the host moved it once more: the build now writes the file's old cues (none, for a first build), and the host's refresh writes
# the ones the build wrote before (TestBuildThenRefreshIsTodaysBuild, which pins it on Alice too).
ALICE_BUILD_SHA256 = "d3d875c914434f57201f04559fef776e3113ceac67d1f6028c47364bb5f32731"


class BuildIsUnchangedTests(unittest.TestCase):
    def _build(self, root: Path, manuscript: Path) -> Path:
        out = root / "ManuscriptGuide" / "manuscript_guide.json"
        args = argparse.Namespace(manuscript=str(manuscript), out=str(out), progress=None, spacy_model=guide.RULES_ONLY, espeak_library="", default_source="")
        with patch.object(guide, "pronunciation", return_value={}), contextlib.redirect_stdout(io.StringIO()):
            guide.build(args)
        return out

    def test_the_alice_story_bible_is_byte_identical(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            out = self._build(root, _write_manuscript(root, _alice_chapters()))
            written = out.read_bytes()
            data = json.loads(written)
            del data["generated_at"]
            del data["source"]["path"]
            digest = hashlib.sha256(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")).hexdigest()
            self.assertEqual(ALICE_BUILD_SHA256, digest)
            self.assertTrue(re.match(r"\d{4}-", json.loads(written)["generated_at"]))


class _FixedClock(datetime):
    """The clock the builds of tests/fixtures/guide-cues were recorded at."""

    @classmethod
    def now(cls, tz=None):
        return datetime(2026, 10, 25, 12, 0, 0, 123456, tzinfo=UTC)


class BuildKeepsTheCuesTests(unittest.TestCase):
    def test_every_recorded_build_writes_the_recorded_file(self):
        folder = REPO / "tests" / "fixtures" / "guide-cues"
        cases = [json.loads(line) for line in (folder / "builds.jsonl").read_text(encoding="utf-8").split("\n") if line]
        results = json.loads((folder / "builds.golden.json").read_text(encoding="utf-8"))
        self.assertEqual(len(cases), len(results))
        self.assertGreater(len(cases), 140)
        for case, want in zip(cases, results, strict=True):
            with self.subTest(case["name"]), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                manuscript = root / "manuscript.json"
                text = (REPO / case["manuscriptPath"]).read_text(encoding="utf-8") if "manuscriptPath" in case else case["manuscript"]
                manuscript.write_bytes(text.encode("utf-8"))
                out = root / "ManuscriptGuide" / "manuscript_guide.json"
                previous = (REPO / case["previousPath"]).read_text(encoding="utf-8") if "previousPath" in case else case["previous"]
                if previous is not None:
                    out.parent.mkdir(parents=True)
                    out.write_bytes(previous.encode("utf-8"))
                args = argparse.Namespace(
                    manuscript=str(manuscript), out=str(out), progress=None, spacy_model=guide.RULES_ONLY, espeak_library="", default_source=""
                )
                with (
                    patch.object(guide, "pronunciation", return_value={}),
                    patch.object(guide, "datetime", _FixedClock),
                    contextlib.redirect_stdout(io.StringIO()),
                    contextlib.redirect_stderr(io.StringIO()),
                ):
                    if want["cutExit"]:
                        with self.assertRaises(Exception):  # noqa: B017 - the build failed before the cues, now as then
                            guide.build(args)
                        continue
                    guide.build(args)
                written = out.read_text(encoding="utf-8").replace(json.dumps(str(manuscript.resolve()))[1:-1], "@MANUSCRIPT@")
                self.assertEqual(_untied(want["cut"]), _untied(written))


def _untied(text: str) -> str:
    """The file, with vocabulary_candidates in code point order when two of them fold to the same case: vocabulary_candidates sorts a
    set by str.casefold, so the order of "Ada" and "ADA" is the set's, which changes with the process's hash seed. Every other file is
    compared byte for byte."""
    data = json.loads(text)
    words = data.get("vocabulary_candidates", [])
    if len({word.casefold() for word in words}) == len(words):
        return text
    data["vocabulary_candidates"] = sorted(words)
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


class SuggestSourcesTests(unittest.TestCase):
    def test_suggest_takes_gliner_or_booknlp_and_refuses_the_rules_which_run_in_the_host(self):
        for argv in (["suggest", "--source", "rules"], ["suggest"]):
            with self.subTest(argv), patch.object(sys, "argv", ["manuscript_guide.py", *argv, "--manuscript", "m.json", "--guide", "g.json"]):
                with contextlib.redirect_stderr(io.StringIO()) as stderr, self.assertRaises(SystemExit) as exit_:
                    guide.main()
                self.assertEqual(2, exit_.exception.code)
                self.assertIn("--source", stderr.getvalue())

    def test_a_named_source_is_the_one_that_runs(self):
        for source in ("gliner", "booknlp"):
            module = type(sys)(f"extraction_{source}")
            module.suggest = lambda args, source=source: print(f"ran {source}")
            argv = ["manuscript_guide.py", "suggest", "--source", source, "--manuscript", "m.json", "--guide", "g.json"]
            with self.subTest(source), patch.dict(sys.modules, {f"extraction_{source}": module}), patch.object(sys, "argv", argv):
                with contextlib.redirect_stdout(io.StringIO()) as out:
                    guide.main()
                self.assertEqual(f"ran {source}\n", out.getvalue())


if __name__ == "__main__":
    unittest.main()
