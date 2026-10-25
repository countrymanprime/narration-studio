"""The narrator's own pronunciation.

A pronunciation can carry a ``note`` (a stored ``status`` from before docs/guides/using-the-app/story-bible.md#how-you-say-each-name is ignored). The narrator's own pronunciation (source ``manual``, set by the
host) sits beside the dictionary's answer instead of replacing it: the one not in use is kept as ``alternate``, so switching back is
lossless and never re-runs a lookup. The host sets every pronunciation (src/studio/desktop/internal/guide/mutate.go and pronounce.go);
this sidecar only reads a legacy source.
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
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"entities": [entity]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


class DictionaryPronunciationTests(unittest.TestCase):
    def test_manual_is_not_a_source_the_narrator_can_ask(self):
        self.assertNotIn(guide.MANUAL_SOURCE, guide.PRONUNCIATION_SOURCES)


class PronunciationStatusIsGoneTests(unittest.TestCase):
    def test_the_status_command_and_its_constants_are_removed(self):
        for name in ("PRONUNCIATION_STATUSES", "DEFAULT_PRONUNCIATION_STATUS", "MAX_PRONUNCIATION_NOTE", "pronunciation_status_of", "pronunciation_status"):
            self.assertFalse(hasattr(guide, name), name)

    def test_the_command_line_has_no_status_command(self):
        with patch("sys.argv", ["manuscript_guide.py", "pronunciation-status", "--guide", "g"]), patch("sys.stderr"), self.assertRaises(SystemExit):
            guide.main()


class LegacyNarratorSourceTests(unittest.TestCase):
    """A file written before the narrator's own source was called ``manual``; a rebuild keeping the narrator's work is the host's
    (internal/guide/build_test.go TestARebuildKeepsTheNarratorsPronunciationWork)."""

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


if __name__ == "__main__":
    unittest.main()
