"""The rules tier's `suggest` command (SN-X32): read-only suggestions from the rules the build already uses.

Each test is one of the slice's acceptance tests. The command reads the manuscript and the Story Bible, prints one JSON
line per suggestion and writes nothing; it proposes only what the Story Bible does not already say, never touches a
locked entry (ADR 0007), keeps every quote verbatim and takes each confidence from ``RULE_CONFIDENCE``.
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
from pathlib import Path
from unittest.mock import patch

CORE = Path(__file__).parents[1] / "core"
REPO = Path(__file__).parents[3]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, CORE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    # Registered first, so extraction_rules' own `import manuscript_guide` gets this module, and its dataclasses resolve.
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


guide = _load("manuscript_guide")
rules = _load("extraction_rules")


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
        "source": {"fileName": "fixture.md", "sha256": "0" * 64, "storedPath": "narration-utils/manuscript/sources/fixture.md"},
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


def _suggest(manuscript: Path, story_bible: Path) -> list[dict]:
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        rules.suggest(argparse.Namespace(manuscript=str(manuscript), guide=str(story_bible)))
    return [json.loads(line) for line in out.getvalue().splitlines()]


def _entity(name: str, category: str = "Character", aliases: tuple[str, ...] = (), **fields) -> dict:
    return {
        "id": guide.entity_id(name),
        "canonical_name": name,
        "category": category,
        "aliases": [{"text": alias, "pronunciation": {}, "occurrences": []} for alias in aliases],
        "locked": False,
        "manual": False,
        **fields,
    }


def _write_bible(root: Path, entities: list[dict], cues: list[dict] | None = None) -> Path:
    path = root / "ManuscriptGuide" / "manuscript_guide.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"schema_version": guide.SCHEMA_VERSION, "entities": entities, "dialogue_cues": cues or []}), encoding="utf-8")
    return path


DAWNSPIRE = [
    (
        "Chapter 1",
        [
            "Captain Arelian said the Council of Ash would meet in Dawnspire.",
            "Later they saw Dawnspire burning. The road to Dawnspire was long, and Arelian rode it alone.",
            "“We ride at dawn,” Ada said. Everyone knew Dawnspire well.",
            "Arelian said, “Then we ride together.”",
        ],
    )
]


def _paragraph_texts(manuscript: Path) -> dict[str, str]:
    data = json.loads(manuscript.read_text(encoding="utf-8"))
    return {item["id"]: item["text"] for item in data["paragraphs"]}


class SuggestIsReadOnlyTests(unittest.TestCase):
    """1. suggest-is-read-only."""

    def test_suggest_prints_json_lines_writes_no_file_and_gives_the_same_output_twice(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, DAWNSPIRE)
            bible = _write_bible(root, [_entity("Ada"), _entity("Captain Arelian")])
            before = {path: path.read_bytes() for path in root.rglob("*") if path.is_file()}

            first = _suggest(manuscript, bible)
            second = _suggest(manuscript, bible)

            after = {path: path.read_bytes() for path in root.rglob("*") if path.is_file()}
            self.assertEqual(before, after, "suggest must write, change or remove no file")
            self.assertTrue(first)
            self.assertEqual(first, second)

    def test_the_command_line_prints_one_json_object_per_line(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, DAWNSPIRE)
            bible = _write_bible(root, [])
            out = io.StringIO()
            argv = ["manuscript_guide.py", "suggest", "--manuscript", str(manuscript), "--guide", str(bible)]
            with patch.object(sys, "argv", argv), contextlib.redirect_stdout(out):
                guide.main()
            lines = out.getvalue().splitlines()
            self.assertTrue(lines)
            for line in lines:
                self.assertIsInstance(json.loads(line), dict)

    def test_a_missing_story_bible_is_read_as_an_empty_one(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, DAWNSPIRE)
            missing = root / "ManuscriptGuide" / "manuscript_guide.json"
            names = {s["payload"]["name"] for s in _suggest(manuscript, missing) if s["payload"]["kind"] == "entry"}
            self.assertIn("Dawnspire", names)
            self.assertFalse(missing.exists())


class EntriesAliasesAndSpeakersTests(unittest.TestCase):
    """2. emits-entries-aliases-and-speakers-with-quotes."""

    def test_a_name_the_story_bible_lacks_is_an_entry_suggestion(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, DAWNSPIRE)
            bible = _write_bible(root, [_entity("Ada"), _entity("Captain Arelian", aliases=("Arelian",))])
            entries = {s["payload"]["name"]: s for s in _suggest(manuscript, bible) if s["payload"]["kind"] == "entry"}
            self.assertEqual({"Council of Ash", "Dawnspire"}, set(entries))
            self.assertEqual("Organization", entries["Council of Ash"]["payload"]["type"])
            for suggestion in entries.values():
                self.assertTrue(suggestion["quotes"], "every entry carries the quote it was found in")
                self.assertEqual("rules", suggestion["source"])

    def test_a_name_held_only_as_needs_review_is_offered_again_and_a_known_one_is_not(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, DAWNSPIRE)
            bible = _write_bible(
                root,
                [
                    _entity("Ada"),
                    _entity("Captain Arelian", aliases=("Arelian",)),
                    _entity("Dawnspire", "Needs Review"),
                    _entity("Council of Ash", "Organization"),
                ],
            )
            entries = [s["payload"]["name"] for s in _suggest(manuscript, bible) if s["payload"]["kind"] == "entry"]
            self.assertEqual(["Dawnspire"], entries)

    def test_a_spelling_the_entry_does_not_have_is_an_alias_suggestion(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, DAWNSPIRE)
            bible = _write_bible(root, [_entity("Ada"), _entity("Arelian")])
            aliases = [s["payload"] for s in _suggest(manuscript, bible) if s["payload"]["kind"] == "alias"]
            self.assertEqual([{"kind": "alias", "entry": "Arelian", "alias": "Captain Arelian"}], aliases)

    def test_a_speech_tag_naming_a_character_is_a_speaker_suggestion_with_its_quote(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, DAWNSPIRE)
            bible = _write_bible(root, [_entity("Ada"), _entity("Captain Arelian", aliases=("Arelian",))])
            speakers = [s for s in _suggest(manuscript, bible) if s["payload"]["kind"] == "speaker"]
            self.assertEqual(
                [("“We ride at dawn,”", "Ada"), ("“Then we ride together.”", "Captain Arelian")],
                [(s["payload"]["quote"], s["payload"]["speaker"]) for s in speakers],
            )
            self.assertEqual(["“We ride at dawn,” Ada said", "Arelian said, “Then we ride together.”"], [s["quotes"][0]["text"] for s in speakers])
            self.assertEqual(["p-000003", "p-000004"], [s["quotes"][0]["paragraphId"] for s in speakers])

    def test_a_cue_the_story_bible_already_attributes_is_not_offered_again(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, DAWNSPIRE)
            entities = [_entity("Ada"), _entity("Captain Arelian", aliases=("Arelian",))]
            paragraphs = guide.load_manuscript(str(manuscript))
            cues = guide.extract_dialogue_cues(paragraphs, guide.character_name_index(entities))
            bible = _write_bible(root, entities, cues)
            self.assertEqual([], [s for s in _suggest(manuscript, bible) if s["payload"]["kind"] == "speaker"])

    def test_no_property_relationship_or_claim_is_emitted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, _alice_chapters())
            kinds = {s["payload"]["kind"] for s in _suggest(manuscript, _write_bible(root, [_entity("Alice")]))}
            self.assertLessEqual(kinds, {"entry", "alias", "speaker"})


class NoInventedNumbersTests(unittest.TestCase):
    """3. no-invented-numbers."""

    def test_every_rule_row_names_itself_says_why_and_is_provisional(self):
        self.assertTrue(rules.RULE_CONFIDENCE)
        for name, row in rules.RULE_CONFIDENCE.items():
            self.assertEqual(name, row.name)
            self.assertTrue(row.why.strip(), f"{name} needs its reason")
            self.assertTrue(row.provisional, f"{name} is provisional until SN-X8's calibration")
            if row.confidence is not None:
                self.assertTrue(0 <= row.confidence <= 1)

    def test_each_suggestion_takes_its_rules_confidence_or_null_with_the_reason(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, DAWNSPIRE)
            suggestions = _suggest(manuscript, _write_bible(root, [_entity("Ada"), _entity("Arelian")]))
            self.assertEqual({"entry", "alias", "speaker"}, {s["payload"]["kind"] for s in suggestions})
            for suggestion in suggestions:
                row = rules.RULE_CONFIDENCE[suggestion["rule"]]
                self.assertEqual(row.confidence, suggestion["confidence"])
                if row.confidence is None:
                    self.assertEqual(rules.NO_SCORE, suggestion["note"])
                    self.assertEqual("the rules give no score for this", rules.NO_SCORE.rstrip(".").lower())


class QuotesAreVerbatimTests(unittest.TestCase):
    """4. quotes-are-verbatim."""

    def test_every_quote_is_a_substring_of_the_paragraph_it_names(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, _alice_chapters())
            texts = _paragraph_texts(manuscript)
            suggestions = _suggest(manuscript, _write_bible(root, [_entity("Alice"), _entity("White Rabbit", aliases=("Rabbit",))]))
            self.assertTrue(suggestions)
            for suggestion in suggestions:
                self.assertTrue(suggestion["quotes"])
                for quote in suggestion["quotes"]:
                    self.assertIn(quote["text"], texts[quote["paragraphId"]])
                    self.assertLessEqual(len(quote["text"]), rules.MAX_QUOTE)

    def test_a_quote_that_is_not_in_its_paragraph_is_dropped_with_a_log_line(self):
        paragraph = {"paragraphId": "p-1", "chapterId": "c-1", "text": "Ada rode to Dawnspire."}
        logged: list[str] = []
        with patch.object(rules, "log", side_effect=lambda message, **_: logged.append(message)):
            kept = rules.verbatim(
                {"payload": {"kind": "entry", "name": "Dawnspire"}, "quotes": [{"paragraphId": "p-1", "text": "Dawnspyre"}]}, {"p-1": paragraph}
            )
        self.assertIsNone(kept)
        self.assertEqual(1, len(logged))
        self.assertIn("Dawnspyre", logged[0])


class NothingInALockedEntryTests(unittest.TestCase):
    """5. nothing-in-a-locked-entry (ADR 0007)."""

    def test_a_locked_entry_gets_no_entry_or_alias_suggestion(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, DAWNSPIRE)
            bible = _write_bible(root, [_entity("Ada"), _entity("Arelian", locked=True), _entity("Dawnspire", "Needs Review", locked=True)])
            suggestions = _suggest(manuscript, bible)
            touched = {s["payload"].get("entry") or s["payload"].get("name") for s in suggestions if s["payload"]["kind"] in {"entry", "alias"}}
            self.assertNotIn("Arelian", touched)
            self.assertNotIn("Captain Arelian", touched)
            self.assertNotIn("Dawnspire", touched)

    def test_a_name_absorbed_into_another_entry_is_not_offered_as_new(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, DAWNSPIRE)
            bible = _write_bible(root, [_entity("Ada"), _entity("Arelian"), _entity("The Spire", "Place", locked=True)])
            data = json.loads(bible.read_text(encoding="utf-8"))
            data["absorbed_names"] = {"dawnspire": guide.entity_id("The Spire")}
            bible.write_text(json.dumps(data), encoding="utf-8")
            names = {s["payload"].get("name") or s["payload"].get("alias") for s in _suggest(manuscript, bible)}
            self.assertNotIn("Dawnspire", names)


# The SHA-256 of the Story Bible `build` writes for the Alice fixture (rules only, pronunciation stubbed, the
# timestamp and the absolute manuscript path left out), taken on main before this slice. A change to it means `suggest`
# changed the build.
ALICE_BUILD_SHA256 = "509d824ce602cb908ac7b212c4f57108696a688b6facdc99a842a0721660e2b2"


class BuildIsUnchangedTests(unittest.TestCase):
    """8. build-is-unchanged."""

    def _build(self, root: Path, manuscript: Path) -> Path:
        out = root / "ManuscriptGuide" / "manuscript_guide.json"
        args = argparse.Namespace(manuscript=str(manuscript), out=str(out), progress=None, spacy_model=guide.RULES_ONLY, espeak_library="", default_source="")
        with patch.object(guide, "pronunciation", return_value={}), contextlib.redirect_stdout(io.StringIO()):
            guide.build(args)
        return out

    def test_the_alice_story_bible_is_byte_identical_and_suggest_leaves_it_so(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root, _alice_chapters())
            out = self._build(root, manuscript)
            written = out.read_bytes()
            _suggest(manuscript, out)
            self.assertEqual(written, out.read_bytes())

            data = json.loads(written)
            del data["generated_at"]
            del data["source"]["path"]
            digest = hashlib.sha256(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")).hexdigest()
            self.assertEqual(ALICE_BUILD_SHA256, digest)
            self.assertTrue(re.match(r"\d{4}-", json.loads(written)["generated_at"]))


if __name__ == "__main__":
    unittest.main()
