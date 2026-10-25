"""The narrator's own pronunciation.

A pronunciation can carry a ``note`` (a stored ``status`` from before docs/guides/using-the-app/story-bible.md#how-you-say-each-name is ignored). The narrator's own pronunciation (source ``manual``, set by the
host) sits beside the dictionary's answer instead of replacing it: the one not in use is kept as ``alternate``, so switching back is
lossless and never re-runs a lookup. A dictionary pronunciation set here and a rebuild keep the note and the alternate.
"""

import argparse
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

DICTIONARY = {"ipa": "wɹɛn", "source": "CMU dictionary", "confidence": "medium", "chosen": True}


def _guide_file(root: Path, **fields) -> Path:
    path = root / "ManuscriptGuide" / "manuscript_guide.json"
    entity = {
        "id": "entity-1",
        "canonical_name": "Wren",
        "category": "Character",
        "pronunciation": dict(DICTIONARY),
        "aliases": [{"text": "the Sparrow", "pronunciation": {}, "occurrences": []}],
        **fields,
    }
    guide.write_json(str(path), {"entities": [entity]})
    return path


def _entity(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))["entities"][0]


def _pronounce(path: Path) -> None:
    guide.pronounce(argparse.Namespace(guide=str(path), entity_id="entity-1", alias_index=None, source="cmu", espeak_library=""))


class DictionaryPronunciationTests(unittest.TestCase):
    """The host sets the narrator's own pronunciation and switches to the alternate (src/studio/desktop/internal/guide/mutate.go); a
    dictionary's pronunciation, set here, keeps the narrator's one beside it."""

    def test_a_dictionary_replace_keeps_the_narrators_one_as_the_alternate(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = _guide_file(
                Path(temporary), canonical_name="hello", pronunciation={"ipa": "mine", "source": "manual", "confidence": "narrator", "chosen": True}
            )
            _pronounce(path)
            value = _entity(path)["pronunciation"]
            self.assertEqual("cmu", value["source"])
            self.assertEqual({"ipa": "mine", "source": "manual", "confidence": "narrator"}, value["alternate"])

    def test_user_is_not_a_dictionary_the_pronounce_command_offers(self):
        self.assertNotIn(guide.MANUAL_SOURCE, guide.PRONUNCIATION_SOURCES)


class PronunciationStatusIsGoneTests(unittest.TestCase):
    def test_the_status_command_and_its_constants_are_removed(self):
        for name in ("PRONUNCIATION_STATUSES", "DEFAULT_PRONUNCIATION_STATUS", "MAX_PRONUNCIATION_NOTE", "pronunciation_status_of", "pronunciation_status"):
            self.assertFalse(hasattr(guide, name), name)

    def test_the_command_line_has_no_status_command(self):
        with patch("sys.argv", ["manuscript_guide.py", "pronunciation-status", "--guide", "g"]), patch("sys.stderr"), self.assertRaises(SystemExit):
            guide.main()

    def test_a_stored_status_is_not_carried_when_the_pronunciation_changes_but_the_note_is(self):
        for status in ("author_confirmed", "query_sent"):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as temporary:
                path = _guide_file(Path(temporary), canonical_name="hello", pronunciation={**DICTIONARY, "status": status, "note": "Confirmed by phone."})
                _pronounce(path)
                value = _entity(path)["pronunciation"]
                self.assertNotIn("status", value)
                self.assertEqual("Confirmed by phone.", value["note"])


class RebuildKeepsTheNarratorsPronunciationWorkTests(unittest.TestCase):
    def _generated(self, aliases=None) -> dict:
        return {
            "id": guide.entity_id("Wren"),
            "canonical_name": "Wren",
            "aliases": aliases or [],
            "category": "Character",
            "occurrences": [],
            "occurrence_count": 0,
            "pronunciation": {"ipa": "fresh", "source": "CMU dictionary", "confidence": "medium"},
            "description": {"text": "", "evidence": {}},
            "personality_notes": [],
            "context": "",
            "relationships": [],
            "properties": [],
            "locked": False,
            "manual": False,
            "review_state": "generated",
        }

    def test_a_stored_status_is_not_carried_through_a_rebuild_but_the_note_is(self):
        for status in ("query_sent", "author_confirmed"):
            prior = {**self._generated(), "pronunciation": {"ipa": "fresh", "source": "cmu", "confidence": "medium", "status": status, "note": "Asked."}}
            merged = guide.merge_locked([self._generated()], {"entities": [prior]})
            self.assertNotIn("status", merged[0]["pronunciation"])
            self.assertEqual("Asked.", merged[0]["pronunciation"]["note"])

    def test_a_legacy_user_source_reads_as_manual_and_nothing_else_changes(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = _guide_file(
                Path(temporary),
                pronunciation={
                    "ipa": "mine",
                    "source": "user",
                    "confidence": "narrator",
                    "chosen": True,
                    "note": "n",
                    "alternate": {"ipa": "x", "source": "user", "confidence": "narrator"},
                },
            )
            value = guide.load_json(str(path))["entities"][0]["pronunciation"]
            self.assertEqual(
                {
                    "ipa": "mine",
                    "source": "manual",
                    "confidence": "narrator",
                    "chosen": True,
                    "note": "n",
                    "alternate": {"ipa": "x", "source": "manual", "confidence": "narrator"},
                },
                value,
            )

    def test_a_legacy_user_value_still_counts_as_the_narrators_own_for_the_alternate(self):
        legacy = {"ipa": "mine", "source": "user", "confidence": "narrator"}
        value = guide.set_pronunciation(legacy, {"ipa": "dict", "source": "cmu", "confidence": "medium"})
        self.assertEqual({"ipa": "mine", "source": "user", "confidence": "narrator"}, value["alternate"])
        again = guide.set_pronunciation(
            {"ipa": "mine", "source": "manual", "confidence": "narrator"}, {"ipa": "new", "source": "user", "confidence": "narrator"}
        )
        self.assertNotIn("alternate", again)

    def test_a_user_pronunciation_and_its_alternate_survive_a_rebuild(self):
        user = {
            "ipa": "mine",
            "source": "manual",
            "confidence": "narrator",
            "chosen": True,
            "alternate": {"ipa": "old", "source": "CMU dictionary", "confidence": "medium"},
        }
        prior = {**self._generated(), "pronunciation": user}
        merged = guide.merge_locked([self._generated()], {"entities": [prior]})
        self.assertEqual(user, merged[0]["pronunciation"])

    def test_a_chosen_alias_pronunciation_survives_and_an_unchosen_ones_status_is_carried(self):
        fresh_aliases = [
            {"text": "the Sparrow", "pronunciation": {"ipa": "fresh", "source": "CMU dictionary", "confidence": "medium"}, "occurrences": []},
            {"text": "Wrennie", "pronunciation": {"ipa": "fresh2", "source": "CMU dictionary", "confidence": "medium"}, "occurrences": []},
        ]
        prior_aliases = [
            {"text": "The Sparrow", "pronunciation": {"ipa": "mine", "source": "manual", "confidence": "narrator", "chosen": True}, "occurrences": []},
            {
                "text": "Wrennie",
                "pronunciation": {"ipa": "fresh2", "source": "CMU dictionary", "confidence": "medium", "status": "author_confirmed"},
                "occurrences": [],
            },
        ]
        merged = guide.merge_locked([self._generated(fresh_aliases)], {"entities": [{**self._generated(), "aliases": prior_aliases}]})
        aliases = {alias["text"]: alias for alias in merged[0]["aliases"]}
        self.assertEqual(prior_aliases[0]["pronunciation"], aliases["the Sparrow"]["pronunciation"])
        self.assertNotIn("status", aliases["Wrennie"]["pronunciation"])

    def test_an_entry_with_no_status_rebuilds_exactly_as_before(self):
        prior = self._generated()
        prior["pronunciation"] = {"ipa": "stale", "source": "CMU dictionary", "confidence": "medium"}
        fresh = self._generated()
        merged = guide.merge_locked([fresh], {"entities": [prior]})
        self.assertEqual({"ipa": "fresh", "source": "CMU dictionary", "confidence": "medium"}, merged[0]["pronunciation"])


if __name__ == "__main__":
    unittest.main()
