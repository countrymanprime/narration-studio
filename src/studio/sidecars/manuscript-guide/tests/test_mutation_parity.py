"""What the sidecar's small Story Bible commands do to a file, recorded as cases the Go host replays.

The host runs mark-reviewed, review-flag, speaker-color, relate, unrelate, delete and correct-cue itself
(src/studio/desktop/internal/guide/mutate.go), so each has two implementations. Each case here runs the real command on a copy of a starting
file and records whether it wrote the file and what the file then holds, or the reason it refused. ``TestMutationsMatchTheSidecarCases``
in the guide package replays every case and requires the same JSON, the same write or no write, or the same reason, so the two cannot
drift. Run with ``UPDATE_CONTRACTS=1`` to rewrite the cases after a deliberate change.
"""

import argparse
import copy
import importlib.util
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


def entry(entity_id: str, name: str, category: str, **extra) -> dict:
    value = {"id": entity_id, "canonical_name": name, "category": category, "aliases": [], "locked": False, "review_state": "reviewed"}
    value.update(extra)
    return value


CUE = {
    "id": "cue-1",
    "chapterId": "c1",
    "paragraphId": "p1",
    "quote_start": 0,
    "quote_end": 5,
    "quote_text": "Hello",
    "speaker_entity_id": None,
    "speaker_source": "unknown",
    "evidence": {"chapterId": "c1", "paragraphId": "p1", "excerpt": "Hello", "tag": ""},
    "corrected": False,
}

STARTS = {
    "types": {
        "schema_version": 2,
        "entities": [
            entry(
                "entity-wren",
                "Wren",
                "Hero",
                aliases=["Little Wren", {"text": "W", "pronunciation": {}, "occurrences": []}],
                review={"entry": True, "aliases": ["W", "gone", "W"]},
                review_state="needs review",
                relationships=[{"id": "entity-mill", "name": "The Mill", "label": "works at"}],
            ),
            entry(
                "entity-mill",
                "The Mill",
                "Place",
                locked=True,
                relationships=[{"id": "entity-wren", "name": "Wren", "label": "employs"}, {"id": "entity-ada", "name": "Ada", "label": "owned by"}],
            ),
            entry("entity-ada", "Ada", "Hero", review_state="needs review", speaker_color=3, relationships=[]),
            {"id": "entity-bo", "canonical_name": "Bo", "category": "Place", "aliases": []},
            entry("entity-cy", "Cy", "Hero", locked=1),
        ],
        "dialogue_cues": [CUE, {**CUE, "id": "cue-2", "speaker_entity_id": "entity-wren", "speaker_source": "tag"}],
        "types": [
            {"name": "Hero", "colour": "green", "speaks": True, "builtin": "Character"},
            {"name": "Place", "colour": "blue", "speaks": False, "builtin": "Place"},
        ],
    },
    "default": {
        "schema_version": 2,
        "entities": [entry("entity-dee", "Dee", "Character"), entry("entity-eli", "Eli", "Needs Review", review_state="needs review")],
    },
    "bad-types": {
        "schema_version": 2,
        "entities": [entry("entity-dee", "Dee", "Hero")],
        "types": [{"name": "Hero", "colour": "green", "speaks": "yes"}],
    },
}


# (command, start, arguments). Each command's arguments are its argparse names, without --guide.
CASES = [
    ("mark-reviewed", "types", {"entity_id": "entity-wren", "alias_index": None}),
    ("mark-reviewed", "types", {"entity_id": "entity-wren", "alias_index": 1}),
    ("mark-reviewed", "types", {"entity_id": "entity-wren", "alias_index": 0}),
    ("mark-reviewed", "types", {"entity_id": "entity-wren", "alias_index": 2}),
    ("mark-reviewed", "types", {"entity_id": "entity-wren", "alias_index": -1}),
    ("mark-reviewed", "types", {"entity_id": "entity-ada", "alias_index": None}),
    ("mark-reviewed", "types", {"entity_id": "entity-bo", "alias_index": None}),
    ("mark-reviewed", "types", {"entity_id": "entity-mill", "alias_index": None}),
    ("mark-reviewed", "types", {"entity_id": "entity-cy", "alias_index": None}),
    ("mark-reviewed", "types", {"entity_id": "entity-nobody", "alias_index": None}),
    ("review-flag", "types", {"entity_id": "entity-wren", "alias_index": None}),
    ("review-flag", "types", {"entity_id": "entity-wren", "alias_index": 0}),
    ("review-flag", "types", {"entity_id": "entity-wren", "alias_index": 1}),
    ("review-flag", "types", {"entity_id": "entity-ada", "alias_index": None}),
    ("review-flag", "types", {"entity_id": "entity-bo", "alias_index": None}),
    ("review-flag", "types", {"entity_id": "entity-bo", "alias_index": 0}),
    ("review-flag", "types", {"entity_id": "entity-mill", "alias_index": None}),
    ("speaker-color", "types", {"entity_id": "entity-wren", "index": 5}),
    ("speaker-color", "types", {"entity_id": "entity-ada", "index": 0}),
    ("speaker-color", "types", {"entity_id": "entity-wren", "index": 7}),
    ("speaker-color", "types", {"entity_id": "entity-wren", "index": 8}),
    ("speaker-color", "types", {"entity_id": "entity-wren", "index": -1}),
    ("speaker-color", "types", {"entity_id": "entity-bo", "index": 2}),
    ("speaker-color", "types", {"entity_id": "entity-mill", "index": 2}),
    ("speaker-color", "types", {"entity_id": "entity-nobody", "index": 2}),
    ("speaker-color", "default", {"entity_id": "entity-dee", "index": 1}),
    ("speaker-color", "default", {"entity_id": "entity-eli", "index": 1}),
    ("speaker-color", "bad-types", {"entity_id": "entity-dee", "index": 1}),
    ("relate", "types", {"entity_id": "entity-wren", "other_id": "entity-ada", "label": "friend"}),
    ("relate", "types", {"entity_id": "entity-wren", "other_id": "entity-mill", "label": "works at"}),
    ("relate", "types", {"entity_id": "entity-wren", "other_id": "entity-ada", "label": "  ally of  "}),
    ("relate", "types", {"entity_id": "entity-bo", "other_id": "entity-ada", "label": "near"}),
    ("relate", "types", {"entity_id": "entity-mill", "other_id": "entity-bo", "label": "beside"}),
    ("relate", "types", {"entity_id": "entity-wren", "other_id": "entity-wren", "label": "self"}),
    ("relate", "types", {"entity_id": "entity-wren", "other_id": "entity-ada", "label": "   "}),
    ("relate", "types", {"entity_id": "entity-wren", "other_id": "entity-ada", "label": "\x1fally of\x1c"}),
    ("relate", "types", {"entity_id": "entity-wren", "other_id": "entity-ada", "label": "\x1e"}),
    ("relate", "types", {"entity_id": "entity-wren", "other_id": "entity-nobody", "label": "x"}),
    ("relate", "types", {"entity_id": "entity-nobody", "other_id": "entity-ada", "label": "x"}),
    ("unrelate", "types", {"entity_id": "entity-wren", "other_id": "entity-mill", "label": "works at"}),
    ("unrelate", "types", {"entity_id": "entity-wren", "other_id": "entity-mill", "label": " works at "}),
    ("unrelate", "types", {"entity_id": "entity-bo", "other_id": "entity-mill", "label": "x"}),
    ("unrelate", "types", {"entity_id": "entity-mill", "other_id": "entity-ada", "label": "owned by"}),
    ("unrelate", "types", {"entity_id": "entity-nobody", "other_id": "entity-mill", "label": "x"}),
    ("delete", "types", {"entity_id": "entity-ada"}),
    ("delete", "types", {"entity_id": "entity-wren"}),
    ("delete", "types", {"entity_id": "entity-mill"}),
    ("delete", "types", {"entity_id": "entity-cy"}),
    ("delete", "types", {"entity_id": "entity-nobody"}),
    ("correct-cue", "types", {"cue_id": "cue-1", "speaker_entity_id": "entity-wren"}),
    ("correct-cue", "types", {"cue_id": "cue-2", "speaker_entity_id": "unknown"}),
    ("correct-cue", "types", {"cue_id": "cue-2", "speaker_entity_id": "  "}),
    ("correct-cue", "types", {"cue_id": "cue-1", "speaker_entity_id": " Unknown "}),
    ("correct-cue", "types", {"cue_id": "cue-1", "speaker_entity_id": "\x1funknown\x1d"}),
    ("correct-cue", "types", {"cue_id": "cue-1", "speaker_entity_id": "  entity-ada  "}),
    ("correct-cue", "types", {"cue_id": "cue-9", "speaker_entity_id": "entity-wren"}),
    ("correct-cue", "default", {"cue_id": "cue-1", "speaker_entity_id": "entity-dee"}),
]

COMMANDS = {
    "mark-reviewed": guide.mark_reviewed,
    "review-flag": guide.review_flag,
    "speaker-color": guide.speaker_color,
    "relate": guide.relate,
    "unrelate": guide.unrelate,
    "delete": guide.delete,
    "correct-cue": guide.correct_cue,
}


def run_case(command: str, start: dict, arguments: dict) -> dict:
    with tempfile.TemporaryDirectory() as temporary:
        path = str(Path(temporary) / "manuscript_guide.json")
        guide.write_json(path, copy.deepcopy(start))
        before = Path(path).read_text(encoding="utf-8")
        writes = []
        real_write = guide.write_json

        def counting_write(target, data):
            writes.append(target)
            real_write(target, data)

        with patch.object(guide, "write_json", counting_write):
            try:
                COMMANDS[command](argparse.Namespace(guide=path, **arguments))
            except ValueError as exc:
                assert Path(path).read_text(encoding="utf-8") == before, f"{command} {arguments} refused but wrote"
                return {"error": str(exc)}
        return {"wrote": bool(writes), "after": json.loads(Path(path).read_text(encoding="utf-8"))}


class MutationParityTests(unittest.TestCase):
    def test_every_case_matches_the_committed_file(self):
        cases = [
            {"command": command, "start": start, "arguments": arguments, **run_case(command, STARTS[start], arguments)} for command, start, arguments in CASES
        ]
        self.assertTrue(any(case.get("wrote") is False for case in cases), "a case where the command writes nothing")
        self.assertGreater(sum("error" in case for case in cases), 15)
        contract_files.check("mutation-parity", {"starts": STARTS, "cases": cases}, TESTDATA)


if __name__ == "__main__":
    unittest.main()
