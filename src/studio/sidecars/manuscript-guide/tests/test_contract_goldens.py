"""The Story Bible entities as the sidecar really builds them, pinned as a contract file.

The entities come from ``manuscript_guide.build_entities`` (the rules-only path, so no language model is needed) over a few
paragraphs. The files the host's own edits write (guide-entities-pronunciation-sidecar.json, guide-review-*-sidecar.json,
guide-types-sidecar.json) are pinned by the Go tests that make them (src/studio/desktop/internal/guide/contract_test.go and types_test.go). The Go host reads them back through ``guide.Service`` and pins
what it sends to the UI, and the TypeScript contract tests validate both files against the UI's schemas.
"""

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

from narration_common import contract_files

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)

PARAGRAPHS = [
    {"chapter": "Chapter 1", "text": text}
    for text in (
        "Captain Arelian said the Council of Ash would meet in Dawnspire.",
        "Arelian was a veteran navigator, brave and wary before the council arrived.",
        "Later they saw Dawnspire burning. The road to Dawnspire was long.",
        "Everyone knew Dawnspire well.",
    )
]


class ContractGoldenTests(unittest.TestCase):
    def test_the_built_entities_match_the_committed_contract_file(self):
        with patch.object(guide, "spacy_candidates", return_value=None):
            entities = guide.build_entities(PARAGRAPHS, "unused", None)

        self.assertEqual({"Captain Arelian", "Council of Ash", "Dawnspire"}, {entity["canonical_name"] for entity in entities})
        contract_files.check("guide-entities-sidecar", entities)


class SuggestContractGoldenTests(unittest.TestCase):
    """The rules tier's `suggest` lines (SN-X32), one of each kind it emits. They never reach the UI, so the file sits in
    the Go rules extractor's testdata (internal/extractionport/rules), whose test parses it: the two cannot drift."""

    def test_the_suggest_lines_match_the_committed_contract_file(self):
        import sys

        sys.modules.setdefault("manuscript_guide", guide)
        rules_spec = importlib.util.spec_from_file_location("extraction_rules", MODULE_PATH.parent / "extraction_rules.py")
        rules = importlib.util.module_from_spec(rules_spec)
        assert rules_spec.loader is not None
        sys.modules["extraction_rules"] = rules
        rules_spec.loader.exec_module(rules)

        paragraphs = [
            {"chapter": "Chapter 1", "chapterId": "c-0001", "paragraphId": f"p-{index:06d}", "text": text}
            for index, text in enumerate(
                (
                    "Captain Arelian said the Council of Ash would meet in Dawnspire.",
                    "Later they saw Dawnspire burning. The road to Dawnspire was long, and Arelian rode it alone.",
                    "“We ride at dawn,” Ada said. Everyone knew Dawnspire well.",
                ),
                start=1,
            )
        ]
        story_bible = {
            "entities": [
                {"id": "entity-ada", "canonical_name": "Ada", "category": "Character", "aliases": []},
                {"id": "entity-arelian", "canonical_name": "Arelian", "category": "Character", "aliases": []},
            ]
        }
        lines = rules.suggestions(paragraphs, story_bible)

        self.assertEqual({"entry", "alias", "speaker"}, {line["payload"]["kind"] for line in lines})
        testdata = Path(__file__).parents[5] / "src" / "studio" / "desktop" / "internal" / "extractionport" / "rules" / "testdata"
        contract_files.check("suggest-lines", lines, testdata)
