"""The ``pronunciation`` command: the whole value of ``pronunciation()`` for each word, with nothing read and nothing written.

The host asks for it when it creates an entry or adds an alias itself (src/studio/desktop/internal/guide/create.go), so the sidecar is asked
for a pronunciation and no more. ``pronunciation-lookup-golden.json`` holds what the command printed for words answered by stubbed
sources, so the order the sources are tried in and the value a miss gets do not depend on a dictionary's version; the guide package's
``TestPronunciationLookupMatchesTheGolden`` reads the same lines with the host's parser. Run with ``UPDATE_CONTRACTS=1`` to rewrite it.
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


def run(words, default_source="", espeak_library="", words_file=""):
    out = io.StringIO()
    args = argparse.Namespace(word=words, words_file=words_file, default_source=default_source, espeak_library=espeak_library, wiktextract_index="")
    with contextlib.redirect_stdout(out):
        guide.lookup_pronunciations(args)
    return out.getvalue().splitlines()


def stub_sources(known):
    """A ``pronounce_source`` that knows ``{source: {word: ipa}}`` and raises for anything else, recording the order it was asked in."""
    asked = []

    def pronounce_source(name, espeak_library, source):
        asked.append((name, source))
        if name not in known.get(source, {}):
            raise ValueError(f"{source} has no {name}")
        return {"ipa": known[source][name], "source": source, "confidence": "high" if source == "cmu" else "medium"}

    return pronounce_source, asked


KNOWN = {
    "cmu": {"Wren": "ɹɛn", "Zoë 😀": "zoʊ"},
    "espeak": {"Wren": "wɹɛn", "Arelian": "ˌærˈiːliən", "אבגד": "avgad", "x" * 400: "ɛks"},
}
WORDS = ["Wren", "Arelian", "Zoë 😀", "אבגד", "x" * 400, "Zzyzxqq"]


class PronunciationLookupTests(unittest.TestCase):
    def lines(self, words, default_source=""):
        stub, asked = stub_sources(KNOWN)
        with patch.object(guide, "pronounce_source", stub), patch.object(guide.SOURCES, "fallback_order", return_value=["cmu", "espeak"]):
            return run(words, default_source), asked

    def test_each_word_is_one_json_line_in_the_order_given(self):
        lines, _ = self.lines(WORDS)
        values = [json.loads(line) for line in lines]
        self.assertEqual(["cmu", "espeak", "cmu", "espeak", "espeak", "not generated"], [value["source"] for value in values])
        self.assertEqual({"ipa": "", "source": "not generated", "confidence": "unknown"}, values[-1])

    def test_a_miss_is_the_not_generated_value_and_not_an_error(self):
        lines, _ = self.lines(["Zzyzxqq"])
        self.assertEqual([{"ipa": "", "source": "not generated", "confidence": "unknown"}], [json.loads(line) for line in lines])

    def test_the_default_source_is_tried_first_and_the_others_after_it(self):
        _, asked = self.lines(["Wren", "Arelian"], default_source="espeak")
        self.assertEqual([("Wren", "espeak"), ("Arelian", "espeak")], asked)
        lines, asked = self.lines(["Zzyzxqq"], default_source="espeak")
        self.assertEqual([("Zzyzxqq", "espeak"), ("Zzyzxqq", "cmu")], asked)
        self.assertEqual("not generated", json.loads(lines[0])["source"])

    def test_a_default_source_that_is_not_registered_is_ignored(self):
        _, asked = self.lines(["Wren"], default_source="removed-source")
        self.assertEqual([("Wren", "cmu")], asked)

    def test_a_word_is_trimmed_and_may_be_long_or_in_any_script(self):
        lines, asked = self.lines(["  Wren  ", "x" * 400, "אבגד"])
        self.assertEqual(3, len(lines))
        self.assertEqual("Wren", asked[0][0])

    def test_a_blank_word_or_one_with_a_nul_is_refused_before_any_lookup(self):
        for bad in ("", "   ", "a\0b"):
            with (
                self.subTest(bad=bad),
                patch.object(guide, "pronounce_source", side_effect=AssertionError("looked up")),
                self.assertRaises(ValueError),
            ):
                run(["Wren", bad])

    def test_a_words_file_is_every_name_of_a_build_looked_up_as_it_is_in_one_process(self):
        names = ["  Wren  ", "Arelian", "x" * 400, "Zoë 😀", "-dash", "Wren"]
        stub, asked = stub_sources(KNOWN)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "words.json"
            path.write_text(json.dumps(names), encoding="utf-8")
            with patch.object(guide, "pronounce_source", stub), patch.object(guide.SOURCES, "fallback_order", return_value=["cmu", "espeak"]):
                lines = run(None, words_file=str(path))
        self.assertEqual(len(names), len(lines))
        self.assertEqual(names, [name for name, source in asked if source == "cmu"])
        self.assertEqual("ɹɛn", json.loads(lines[-1])["ipa"])

    def test_a_words_file_that_is_not_a_list_of_names_or_both_inputs_are_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            for content in ('{"a": 1}', '["Wren", 5]', '["Wren", ""]'):
                path = Path(temporary) / "words.json"
                path.write_text(content, encoding="utf-8")
                with self.subTest(content=content), self.assertRaises(ValueError):
                    run(None, words_file=str(path))
            with self.assertRaises(ValueError):
                run(["Wren"], words_file=str(path))
        with self.assertRaises(ValueError):
            run(None)

    def test_the_command_takes_a_words_file_and_a_log(self):
        with (
            patch("sys.argv", ["g", "pronunciation", "--words-file", "w.json", "--log", "log.txt"]),
            patch.object(guide, "lookup_pronunciations") as command,
            patch.object(guide, "set_log_file"),
            patch.object(Path, "open"),
            patch.object(Path, "mkdir"),
        ):
            guide.main()
        namespace = command.call_args.args[0]
        self.assertEqual(("w.json", None, "log.txt"), (namespace.words_file, namespace.word, namespace.log))

    def test_it_is_the_value_the_build_would_make(self):
        with patch.object(guide, "pronunciation", return_value={"ipa": "i", "source": "cmu", "confidence": "high"}) as made:
            run(["Wren"], default_source="cmu", espeak_library="lib")
        made.assert_called_once_with("Wren", "lib", "cmu")

    def test_the_command_is_registered_and_takes_repeated_words(self):
        with (
            patch("sys.argv", ["g", "pronunciation", "--word", "a", "--word=b", "--default-source", "cmu"]),
            patch.object(guide, "lookup_pronunciations") as command,
        ):
            guide.main()
        namespace = command.call_args.args[0]
        self.assertEqual((["a", "b"], "cmu"), (namespace.word, namespace.default_source))

    def test_a_real_dictionary_answers_a_familiar_word(self):
        value = json.loads(run(["hello"])[0])
        self.assertTrue(value["ipa"])
        self.assertNotEqual("not generated", value["source"])

    def test_what_it_printed_matches_the_committed_golden(self):
        cases = []
        for default_source in ("", "espeak"):
            lines, _ = self.lines(WORDS, default_source)
            cases.append({"default_source": default_source, "words": WORDS, "lines": lines})
        contract_files.check("pronunciation-lookup-golden", {"cases": cases}, TESTDATA)


if __name__ == "__main__":
    unittest.main()
