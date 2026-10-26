"""Generate/replace pronunciation controls.

`pronounce_source` gets a pronunciation from one named engine and raises when that engine has nothing for the name,
instead of the automatic-fallback ``pronunciation()`` that quietly reports "not generated". ``pronunciation --source`` prints it for
the host, which applies it to the entry's own name or one of its aliases, refuses a locked entry and marks the value ``chosen``
(src/studio/desktop/internal/guide/pronounce.go, pinned to what this sidecar's deleted ``pronounce`` command wrote by
tests/fixtures/guide-pronounce).
"""

import argparse
import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from narration_common import contract_files

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)

TESTDATA = Path(__file__).parents[5] / "src" / "studio" / "desktop" / "internal" / "guide" / "testdata"


def _guide_file(root: Path, **fields) -> Path:
    path = root / "ManuscriptGuide" / "manuscript_guide.json"
    entity = {
        "id": "entity-1",
        "canonical_name": "Wren",
        "category": "Character",
        "aliases": [{"text": "the Sparrow", "pronunciation": {}, "occurrences": []}],
        **fields,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"entities": [entity]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


class PronounceSourceTests(unittest.TestCase):
    def test_cmu_returns_the_dictionary_pronunciation(self):
        value = guide.pronounce_source("hello", None, "cmu")
        self.assertEqual("cmu", value["source"])
        self.assertEqual("medium", value["confidence"])
        self.assertTrue(value["ipa"])

    def test_cmu_raises_for_a_name_the_dictionary_has_no_entry_for(self):
        with self.assertRaisesRegex(ValueError, "CMU dictionary has no entry"):
            guide.pronounce_source("Zzyzxqq", None, "cmu")

    def test_espeak_raises_when_it_produces_nothing(self):
        with patch("phonemizer.phonemize", return_value=""), self.assertRaisesRegex(ValueError, "eSpeak"):
            guide.pronounce_source("Name", None, "espeak")

    def test_espeak_returns_its_pronunciation_when_it_has_one(self):
        with patch("phonemizer.phonemize", return_value="n eɪ m"):
            value = guide.pronounce_source("Name", None, "espeak")
        self.assertEqual({"ipa": "n eɪ m", "source": "espeak", "confidence": "low"}, value)

    def test_an_unknown_source_is_refused(self):
        with self.assertRaises(ValueError):
            guide.pronounce_source("Name", None, "google")

    def test_pronunciation_still_falls_back_automatically_and_never_raises(self):
        with patch.object(guide, "pronounce_source", side_effect=ValueError("no")):
            self.assertEqual({"ipa": "", "source": "not generated", "confidence": "unknown"}, guide.pronunciation("Name", None))


class SourceLookupTests(unittest.TestCase):
    """``pronunciation --source``: each word asked of that source alone, one JSON line each, a miss being its reason."""

    def _run(self, words, source="cmu", **namespace):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "words.json"
            path.write_text(json.dumps(words), encoding="utf-8")
            out = io.StringIO()
            args = argparse.Namespace(word=None, words_file=str(path), source=source, default_source="espeak", espeak_library="", **namespace)
            with contextlib.redirect_stdout(out):
                guide.lookup_pronunciations(args)
        return out.getvalue().split("\n")[:-1]

    def test_a_hit_is_the_source_value_in_its_key_order(self):
        self.assertEqual(['{"ipa": "h ʌ l oʊ", "source": "cmu", "confidence": "medium"}'], self._run(["hello"]))

    def test_a_miss_is_the_reason_in_the_sources_words_and_no_other_source_is_asked(self):
        with patch("phonemizer.phonemize", side_effect=AssertionError("eSpeak asked")):
            lines = self._run(["Zzyzxqq", "hello"])
        self.assertEqual({"miss": 'The CMU dictionary has no entry for "Zzyzxqq".'}, json.loads(lines[0]))
        self.assertEqual("cmu", json.loads(lines[1])["source"])

    def test_any_failure_is_a_miss_and_one_with_no_text_is_its_type(self):
        for raised, reason in ((RuntimeError("espeak not installed on your system"), "espeak not installed on your system"), (KeyError(), "KeyError")):
            with self.subTest(reason=reason), patch.object(guide, "pronounce_source", side_effect=raised):
                self.assertEqual([json.dumps({"miss": reason})], self._run(["Wren"]))

    def test_a_name_is_asked_exactly_as_the_story_bible_holds_it_even_empty(self):
        asked = []

        def stub(name, espeak_library, source):
            asked.append((name, source))
            return {"ipa": "x", "source": source, "confidence": "low"}

        names = ["", "  Wren  ", "-dash", "a\u2028b", "Zoë 😀"]
        with patch.object(guide, "pronounce_source", stub):
            lines = self._run(names, source="espeak")
        self.assertEqual([(name, "espeak") for name in names], asked)
        self.assertEqual(len(names), len(lines))

    def test_without_source_an_empty_name_is_still_refused(self):
        with self.assertRaises(ValueError):
            self._run([""], source=None)

    def test_the_command_line_takes_a_registered_source_only(self):
        with patch("sys.argv", ["g", "pronunciation", "--source", "cmu", "--words-file", "w.json"]), patch.object(guide, "lookup_pronunciations") as run:
            guide.main()
        self.assertEqual("cmu", run.call_args.args[0].source)
        with patch("sys.argv", ["g", "pronunciation", "--source", "forvo", "--words-file", "w.json"]), patch("sys.stderr"), self.assertRaises(SystemExit):
            guide.main()

    def test_what_it_printed_matches_the_committed_golden(self):
        # pronunciation-source-golden.json: the lines the host's parseSourceAnswer reads (TestTheSourceAnswerMatchesTheGolden). Run with
        # UPDATE_CONTRACTS=1 to rewrite it.
        known = {"Wren": "ɹɛn", "Zoë 😀": "zoʊ", "a\u2028b": 'ə "b"'}
        failures = {"": KeyError(), "espeak": RuntimeError("espeak not installed on your system")}

        def stub(name, espeak_library, source):
            if name in failures:
                raise failures[name]
            if name not in known:
                raise ValueError(f'The CMU dictionary has no entry for "{name}".')
            return {"ipa": known[name], "source": source, "confidence": "medium"}

        words = ["Wren", "Zoë 😀", "Zzyzxqq", "", "espeak", "a\u2028b"]
        with patch.object(guide, "pronounce_source", stub):
            lines = self._run(words)
        contract_files.check("pronunciation-source-golden", {"source": "cmu", "words": words, "lines": lines}, TESTDATA)

    def test_the_pronounce_command_is_gone(self):
        self.assertFalse(hasattr(guide, "pronounce"))
        with patch("sys.argv", ["g", "pronounce", "--guide", "g", "--entity-id", "e", "--source", "cmu"]), patch("sys.stderr"), self.assertRaises(SystemExit):
            guide.main()


if __name__ == "__main__":
    unittest.main()


class CandidateCommandTests(unittest.TestCase):
    def _run(self, word, source="cmu"):
        import contextlib
        import io

        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            guide.candidate(argparse.Namespace(word=word, source=source, espeak_library="", wiktextract_index=""))
        lines = out.getvalue().splitlines()
        self.assertEqual(1, len(lines))
        return json.loads(lines[0])

    def test_a_hit_is_one_json_line_with_the_say_text(self):
        result = self._run("hello")
        self.assertTrue(result["ok"])
        self.assertTrue(result["say"])

    def test_a_miss_is_a_sentence_naming_the_source_and_the_word(self):
        result = self._run("Zzyzxqq")
        self.assertFalse(result["ok"])
        self.assertIn("CMU dictionary", result["reason"])
        self.assertIn("Zzyzxqq", result["reason"])
        self.assertNotIn("Traceback", result["reason"])

    def test_it_writes_no_file_and_touches_no_entity(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = _guide_file(Path(temporary), canonical_name="hello")
            before = path.read_bytes()
            self._run("hello")
            self.assertEqual(before, path.read_bytes())
            self.assertEqual(["manuscript_guide.json"], [p.name for p in path.parent.iterdir()])

    def test_a_bad_word_is_refused_before_any_lookup(self):
        for bad in ("x" * (guide.MAX_CANDIDATE_WORD + 1), "two\nlines", "nul\0", "   "):
            with (
                self.subTest(bad=bad[:6]),
                patch.object(guide, "pronounce_source", side_effect=AssertionError("looked up")),
                self.assertRaises(ValueError),
            ):
                self._run(bad)

    def test_the_command_is_registered(self):
        with patch("sys.argv", ["g", "candidate", "--word", "hello", "--source", "cmu"]), patch.object(guide, "candidate") as run:
            guide.main()
        run.assert_called_once()

    def test_an_automatic_build_records_the_registry_name_it_used(self):
        self.assertEqual("cmu", guide.pronunciation("hello", None)["source"])
