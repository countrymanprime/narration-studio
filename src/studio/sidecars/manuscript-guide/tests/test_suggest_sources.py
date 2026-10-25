"""The ``suggest`` sources the sidecar still runs.

The rules source moved into the host (src/studio/desktop/internal/guide/rules.go, #2251 step 3), so ``suggest`` takes
``--source gliner`` or ``--source booknlp`` only; the host's TestRuleSuggestionsWriteNothing and the frozen cases in
tests/fixtures/guide-rules cover what the rules did. The Story Bible build moved into the host too (internal/guide/build.go): the
Alice build's hash and the recorded builds of tests/fixtures/guide-cues are its Go tests now (TestTheAliceStoryBibleIsByteIdentical,
TestEveryRecordedBuildWritesTheFileThatKeepsTheCues).
"""

import contextlib
import importlib.util
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)
REPO = Path(__file__).parents[5]


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
