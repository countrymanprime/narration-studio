"""What the sidecar's ``edit`` does to a Story Bible, recorded as cases the Go host replays.

The host applies an edit without the sidecar unless it changes the aliases (src/studio/desktop/internal/guide/edit.go), so the same edit has
two implementations. Each case here runs the real ``edit`` on a copy of a starting file and records the file it left, or the reason it
refused. ``TestEditMatchesTheSidecarCases`` in the guide package runs every case through the Go edit and requires the same JSON or the
same reason, so the two cannot drift. Run with ``UPDATE_CONTRACTS=1`` to rewrite the cases after a deliberate change.
"""

import argparse
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from narration_common import contract_files

MODULE_PATH = Path(__file__).parents[1] / "core" / "manuscript_guide.py"
SPEC = importlib.util.spec_from_file_location("manuscript_guide", MODULE_PATH)
guide = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(guide)

TESTDATA = Path(__file__).parents[5] / "tests" / "fixtures" / "guide-edit"


def entry(entity_id: str, name: str, category: str, **extra) -> dict:
    value = {
        "id": entity_id,
        "canonical_name": name,
        "category": category,
        "aliases": [],
        "occurrences": [{"chapter": "Chapter 1", "paragraph": 3, "excerpt": "…Wren said…"}],
        "occurrence_count": 1,
        "pronunciation": {"ipa": "ɹɛn", "source": "cmu", "confidence": 0.75},
        "description": {"text": "", "evidence": {}},
        "personality_notes": [],
        "relationships": [],
        "properties": [],
        "locked": False,
        "review_state": "needs review",
        "review": {"entry": True, "aliases": []},
    }
    value.update(extra)
    return value


# Two starting files: one with the narrator's own types, and one from before types existed. The first also carries the legacy shapes
# load_json normalizes on every edit (a plain-text alias, the old "user" source) and numbers that must come back exactly as they were.
STARTS = {
    "types": {
        "schema_version": 2,
        "source": {"path": "manuscript.json", "sha256": "0" * 64},
        "generated_at": "2026-10-18T00:00:00+00:00",
        "entities": [
            entry(
                "entity-wren",
                "Wren",
                "Hero",
                aliases=[
                    "Little Wren",
                    {"text": "the Sparrow", "pronunciation": {"ipa": "x", "source": "user", "alternate": {"ipa": "y", "source": "user"}}, "occurrences": []},
                ],
                properties=[{"key": "Codename", "value": "Sparrow"}],
                score=1.0,
                weight=12345678901234567,
            ),
            entry("entity-mill", "The Mill", "Place", locked=True, review_state="reviewed", review={"entry": False, "aliases": []}),
        ],
        "dialogue_cues": [],
        "vocabulary_candidates": ["Wren"],
        "absorbed_names": {"wren": "entity-wren"},
        "types": [
            {"name": "Hero", "colour": "green", "speaks": True, "builtin": "Character"},
            {"name": "Place", "colour": "blue", "speaks": False, "builtin": "Place"},
        ],
    },
    # A file whose types list the sidecar refuses (two rows with one name whatever the case), one locked by a value that is truthy but not
    # true, and an empty object, which the sidecar reads as no file.
    "bad-types": {
        "schema_version": 2,
        "entities": [entry("entity-ada", "Ada", "Hero")],
        "types": [{"name": "Hero", "colour": "green", "speaks": True}, {"name": "HERO", "colour": "blue", "speaks": False}],
    },
    "bad-colour": {"schema_version": 2, "entities": [entry("entity-ada", "Ada", "Hero")], "types": [{"name": "Hero", "colour": "pink", "speaks": True}]},
    "bad-speaks": {"schema_version": 2, "entities": [entry("entity-ada", "Ada", "Hero")], "types": [{"name": "Hero", "colour": "green", "speaks": 1}]},
    "locked-by-number": {"schema_version": 2, "entities": [entry("entity-ada", "Ada", "Character", locked=1)]},
    "empty": {},
    "default": {
        "schema_version": 2,
        "source": {},
        "generated_at": None,
        "entities": [entry("entity-ada", "Ada", "Needs Review")],
        "vocabulary_candidates": [],
        "absorbed_names": {},
    },
}

# (start, entity id, fields). The host sends the fields in name order, so the sidecar gets them in that order here too.
CASES = [
    ("types", "entity-wren", {"description": "A courier who never stops."}),
    ("types", "entity-wren", {"personality": "Gruff, kind."}),
    ("types", "entity-wren", {"personality": ""}),
    ("types", "entity-wren", {"context": "Narrate softly."}),
    ("types", "entity-wren", {"canonical_name": "Wren of the Mill"}),
    ("types", "entity-wren", {"properties": '[{"key": " Codename ", "value": " The Sparrow "}, {"key": "Abilities", "value": ""}]'}),
    ("types", "entity-wren", {"properties": ""}),
    ("types", "entity-wren", {"category": "Place"}),
    ("types", "entity-wren", {"locked": "true"}),
    ("types", "entity-wren", {"locked": " On "}),
    ("types", "entity-wren", {"locked": "\x1ftrue\x1c"}),
    ("types", "entity-wren", {"locked": "no"}),
    ("types", "entity-wren", {"canonical_name": "Wren", "context": "c", "description": "d", "personality": "p"}),
    ("types", "entity-wren", {"description": 'שלום 👋 — \N{LINE SEPARATOR} "quoted" <b>&amp;</b>'}),
    ("types", "entity-wren", {"description": "-brave"}),
    ("types", "entity-mill", {"locked": "false"}),
    ("types", "entity-mill", {"description": "refused"}),
    ("types", "entity-mill", {"description": "refused", "locked": "false"}),
    ("types", "entity-wren", {"category": "Character"}),
    ("types", "entity-wren", {"category": "Draft"}),
    ("types", "entity-wren", {"category": "Needs Review"}),
    ("types", "entity-wren", {"description": "never written", "properties": '[{"key": "a", "value": ""}, {"key": "A", "value": ""}]'}),
    ("types", "entity-wren", {"properties": '[{"key": "  ", "value": "x"}]'}),
    ("types", "entity-wren", {"properties": '[{"key": "a"}]'}),
    ("types", "entity-wren", {"properties": "[1]"}),
    ("types", "entity-wren", {"properties": '{"key": "a", "value": "b"}'}),
    ("types", "entity-wren", {"properties": "[{"}),
    ("types", "entity-wren", {"nickname": "Wrennie"}),
    ("types", "entity-nobody", {"description": "x"}),
    ("types", "entity-wren", {"properties": '[{"key": "\ufb01le", "value": ""}, {"key": "FILE", "value": ""}]'}),
    ("types", "entity-wren", {"properties": '[{"key": "Stra\u00dfe", "value": ""}, {"key": "STRASSE", "value": ""}]'}),
    ("bad-types", "entity-ada", {"description": "x"}),
    ("bad-colour", "entity-ada", {"description": "x"}),
    ("bad-speaks", "entity-ada", {"description": "x"}),
    ("locked-by-number", "entity-ada", {"description": "x"}),
    ("locked-by-number", "entity-ada", {"locked": "false"}),
    ("empty", "entity-ada", {"description": "x"}),
    ("default", "entity-ada", {"category": "Character"}),
    ("default", "entity-ada", {"category": "Lore", "description": "An old tale."}),
    ("default", "entity-ada", {"category": "Hero"}),
]


def run_case(start: dict, entity_id: str, fields: dict) -> dict:
    with tempfile.TemporaryDirectory() as temporary:
        path = str(Path(temporary) / "manuscript_guide.json")
        guide.write_json(path, copy.deepcopy(start))
        names = sorted(fields)
        args = argparse.Namespace(
            guide=path, entity_id=entity_id, field=names, value=[fields[name] for name in names], manuscript="", espeak_library="", default_source=""
        )
        try:
            guide.edit(args)
        except ValueError as exc:
            unchanged = Path(path).read_text(encoding="utf-8") == guide_text(start)
            return {"error": str(exc), "unchanged": unchanged}
        return {"after": json.loads(Path(path).read_text(encoding="utf-8"))}


def guide_text(start: dict) -> str:
    return json.dumps(start, ensure_ascii=False, indent=2) + "\n"


class EditParityTests(unittest.TestCase):
    def test_every_edit_case_matches_the_committed_file(self):
        cases = []
        for start, entity_id, fields in CASES:
            outcome = run_case(STARTS[start], entity_id, fields)
            if "error" in outcome:
                self.assertTrue(outcome["unchanged"], f"a refused edit wrote the file: {fields}")
            cases.append({"start": start, "entity_id": entity_id, "fields": fields, **outcome})
        self.assertGreater(sum("error" in case for case in cases), 5)
        contract_files.check("edit-parity", {"starts": STARTS, "cases": cases}, TESTDATA)


if __name__ == "__main__":
    unittest.main()
