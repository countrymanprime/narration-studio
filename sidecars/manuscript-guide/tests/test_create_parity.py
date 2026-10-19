"""What the sidecar's ``create`` and ``edit`` of the aliases do to a file, recorded as sequences the Go host replays.

The host creates an entry and adds an alias itself and asks the sidecar only for the pronunciations (apps/desktop/internal/guide/create.go),
so each has two implementations. Each case here is a start file, a manuscript and a list of steps; every step runs the real command on the
file the step before left, with pronunciation fixed by ``fixed_pronunciation`` so no dictionary is involved, and records whether it wrote
and what the file then holds, or the reason it refused. It also records what the command asked of the two things the host answers
differently: the words it wanted a pronunciation for, and the names it searched the manuscript for, each with the answer it got.

``TestCreatesMatchTheSidecarCases`` in the guide package replays every case twice, once as a chain on the host's own writes and once with
every step on the sidecar's file, answering the pronunciations and the searches from what is recorded here; it requires the same JSON, the
same reason, and the same words and names asked in the same order. Run with ``UPDATE_CONTRACTS=1`` to rewrite the file after a deliberate
change.
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

TESTDATA = Path(__file__).parents[3] / "apps" / "desktop" / "internal" / "guide" / "testdata"


def fixed_pronunciation(name: str, espeak_library: str | None, default_source: str | None = None) -> dict:
    """What the dictionaries would say, without them: a value made of the name, a miss for a name that starts with Zz, and a number for
    a confidence when the name has a ü (a Wiktextract-style value)."""
    if name.startswith("Zz"):
        return {"ipa": "", "source": "not generated", "confidence": "unknown"}
    return {"ipa": "ˈ" + name.lower(), "source": "cmu" if name.isascii() else "espeak", "confidence": 0.75 if "ü" in name else "high"}


MANUSCRIPT = {
    "schemaVersion": 1,
    "documentId": "doc-1",
    "chapters": [
        {"id": "c-1", "title": "One", "contentKind": "narration"},
        {"id": "c-2", "title": "Two", "contentKind": "narration"},
        {"id": "c-front", "title": "Front matter", "contentKind": "front"},
    ],
    "paragraphs": [
        {"id": "p-0", "chapterId": "c-1", "chapterTitle": "One", "text": "Wren was a tall girl, and Wren ran. Nick looked on."},
        {"id": "p-1", "chapterId": "c-1", "chapterTitle": "One", "text": "The boy said nothing.  Nick, the boy, is the quiet one! Wren? Wren."},
        {"id": "p-2", "chapterId": "c-2", "chapterTitle": "Two", "text": "Zoë Ünal laughed. Zoë is an old friend; Ünal agreed. שלום Wren 😀 Nico-Rose O'Neil."},
        {"id": "p-3", "chapterId": "c-2", "chapterTitle": "Two", "text": "The Mill  was the oldest building. Mill hands left. A mill is a place, they said."},
        {"id": "p-4", "chapterId": "c-front", "chapterTitle": "Front matter", "text": "Wren is in the front matter and is not narrated."},
        {
            "id": "p-5",
            "chapterId": "c-2",
            "chapterTitle": "Two",
            "text": "Arelian—Captain Arelian, was the captain of the Ash. Captain Arelian is the man. " + "x" * 400,
        },
    ],
}
NO_TEXT = {**MANUSCRIPT, "paragraphs": [{**MANUSCRIPT["paragraphs"][4]}]}
MANUSCRIPTS = {"story": MANUSCRIPT, "no-text": NO_TEXT, "missing": None}


def evidence(chapter: str, paragraph: int, excerpt: str) -> dict:
    return {"chapter": chapter, "chapterId": "c-" + chapter, "paragraph": paragraph, "paragraphId": f"p-{paragraph}", "excerpt": excerpt}


def alias(text: str, ipa: str = "", *occurrences: dict, **extra) -> dict:
    return {"text": text, "pronunciation": {"ipa": ipa, "source": "manual"} if ipa else {}, "occurrences": list(occurrences), **extra}


def entry(entity_id: str, name: str, category: str = "Character", **extra) -> dict:
    value = {
        "id": entity_id,
        "canonical_name": name,
        "aliases": [],
        "category": category,
        "occurrences": [],
        "occurrence_count": 0,
        "pronunciation": {},
        "description": {"text": "", "evidence": {}},
        "personality_notes": [],
        "relationships": [],
        "properties": [],
        "locked": False,
        "review_state": "reviewed",
        "appearances": [],
    }
    value.update(extra)
    return value


def bible() -> dict:
    return {
        "schema_version": 2,
        "source": {"path": "manuscript.json", "sha256": "0" * 64},
        "generated_at": "2026-10-18T00:00:00+00:00",
        "entities": [
            entry(
                "nick",
                "Nick",
                aliases=[alias("The Boy", "ðə bɔɪ", evidence("One", 1, "The boy said nothing."), evidence("One", 1, "the boy, is")), alias("Nicky"), "Plain"],
                occurrences=[evidence("One", 1, "Nick, the boy, is the quiet one!")],
                occurrence_count=3,
                review={"entry": True, "aliases": ["Nicky", "Plain", "gone"]},
                review_state="needs review",
                score=1.0,
                weight=12345678901234567,
            ),
            entry("old", "Old", aliases=[alias("Olden")]),
            entry("closed", "Closed", locked=True, aliases=[alias("Shut")]),
            entry("wren", "Wren", review="not a dict", review_state="needs review", aliases=[alias("Wr")]),
            entry("bare", "Bare"),
        ],
        "dialogue_cues": [],
        "vocabulary_candidates": ["Wren"],
        "absorbed_names": {"nicky": "nick"},
    }


def typed() -> dict:
    data = bible()
    data["types"] = [
        {"name": "Hero", "colour": "green", "speaks": True, "builtin": "Character"},
        {"name": "Place", "colour": "blue", "speaks": False, "builtin": "Place"},
    ]
    data["entities"][0]["category"] = "Hero"
    return data


STARTS = {
    "missing": None,
    "empty": {},
    "bible": bible(),
    "typed": typed(),
    "bad-types": {"schema_version": 2, "entities": [], "types": [{"name": "Hero", "colour": "pink", "speaks": True}]},
}


def create(name: str, category: str = "", aliases: str = "", description: str = "", properties: list | None = None) -> tuple[str, dict]:
    return "create", {"name": name, "category": category, "aliases": aliases, "description": description, "properties": properties or []}


def edit(entity_id: str, **fields: str) -> tuple[str, dict]:
    return "edit", {"entity_id": entity_id, "fields": dict(sorted(fields.items()))}


LONG = "Long " + "name " * 60 + "end"

# (name, start, manuscript, steps)
CASES = [
    ("a plain create", "bible", "story", [create("Mira", "Character")]),
    (
        "a create with aliases, a description and properties",
        "bible",
        "story",
        [
            create(
                "Nico-Rose O'Neil",
                "Character",
                "Nico; the boy ;; Nick ",
                "A second description.",
                [{"key": " Codename ", "value": " Wren "}, {"key": "Eyes", "value": ""}],
            ),
        ],
    ),
    ("a create in a file that is not there yet starts a Story Bible", "missing", "story", [create("Wren", "Draft", "Wr")]),
    ("a create in a file with an empty object starts a Story Bible", "empty", "story", [create("Wren")]),
    ("a create with no category is a Draft", "bible", "story", [create("Mira"), create("Mirb", "  "), create("Mirc", " Draft ")]),
    ("a create under a type of the narrators own", "typed", "story", [create("Wren", "Hero"), create("The Mill", "Place"), create("Zoë", "Character")]),
    (
        "a create under a type that does not exist, or a system one, is refused",
        "typed",
        "story",
        [
            create("Wren", "Lore"),
            create("Wren", "Needs Review"),
            create("Wren", "hero"),
            create("Wren", "Character"),
        ],
    ),
    ("a create without a name is refused", "bible", "story", [create(""), create("   ", "Hero"), create("   ", "Nothing")]),
    ("a create of a name that has an entry is refused", "bible", "story", [create("nick"), create("NICK!"), create("N i c k", "Nothing"), create("Closed")]),
    ("a create twice is refused the second time", "bible", "story", [create("Mira", "Character", "Mi"), create("Mira", "Character", "Mi"), create("mira")]),
    (
        "a create with a property that is refused",
        "bible",
        "story",
        [
            create("Mira", "Character", properties=[{"key": "a", "value": ""}, {"key": "A", "value": ""}]),
            create("Mira", "Character", properties=[{"key": "  ", "value": "x"}]),
            create("Mira", "Character", properties=[{"key": "ﬁle", "value": ""}, {"key": "FILE", "value": ""}]),
            create("Mira", "Character", properties=[{"key": "Straße", "value": ""}, {"key": "STRASSE", "value": ""}]),
        ],
    ),
    (
        "a create of a name the manuscript describes",
        "bible",
        "story",
        [
            create("Wren"),
            create("Captain Arelian"),
            create("Arelian"),
            create("The Mill"),
            create("Mill"),
            create("Zoë Ünal"),
            create("Zoë"),
        ],
    ),
    (
        "a create of a name the manuscript describes, with a description of its own",
        "bible",
        "story",
        [create("Wren", "Character", "", "Said by the narrator.")],
    ),
    ("a create of a name that is not in the manuscript", "bible", "story", [create("Nobody Home", "Character", "Zzyzx; Somebody")]),
    (
        "a create with aliases that repeat, equal the name or belong to another entry",
        "bible",
        "story",
        [
            create("Mira", "Character", "Mira; mira; MIRA; Nick; Old;Mira"),
        ],
    ),
    (
        "a create with names in other scripts, emoji and a very long name",
        "bible",
        "story",
        [
            create("שלום", "Character", "Wren 😀; Zoë; 😀"),
            create(LONG, "Character", LONG + "; " + LONG.upper()),
            create("Ünal Zoë", "Character", "Nico-Rose O'Neil"),
        ],
    ),
    ("a create with a name that has a pronunciation miss", "bible", "story", [create("Zzyzx", "Character", "Zzyzx the Great")]),
    ("a create with the manuscript missing or without text is refused", "bible", "missing", [create("Mira")]),
    ("a create with no readable text is refused", "bible", "no-text", [create("Mira")]),
    ("a create with the manuscript missing still refuses a duplicate first", "bible", "missing", [create("Nick"), create("")]),
    ("a create in a file whose types are refused", "bad-types", "story", [create("Mira", "Character"), create("Mira", "Draft")]),
    (
        "an edit of the aliases adds, keeps, removes and reorders",
        "bible",
        "story",
        [
            edit("nick", aliases="Nicky; the boy; Nico; Plain"),
            edit("nick", aliases="Nico ; ; Nick; nick"),
            edit("nick", aliases=""),
        ],
    ),
    (
        "an edit of the aliases of an entry without review flags",
        "bible",
        "story",
        [edit("old", aliases="Olden; Wren; Zoë Ünal"), edit("wren", aliases="Wr; Wren; WREN")],
    ),
    (
        "an edit of the aliases along with other fields",
        "bible",
        "story",
        [
            edit("old", aliases="Mill; Zzyzx", description="Kept.", canonical_name="Older", locked="true"),
            edit("nick", aliases="Nick the Quiet", category="Hero", description="Quiet", context="c"),
        ],
    ),
    (
        "an edit of the aliases that is refused changes nothing",
        "typed",
        "story",
        [
            edit("old", aliases="Mill", category="Nothing"),
            edit("old", aliases="Mill", properties='[{"key": "a", "value": ""}, {"key": "A", "value": ""}]'),
            edit("closed", aliases="Mill"),
            edit("closed", aliases="Mill", locked="false"),
            edit("nobody", aliases="Mill"),
            edit("old", aliases="Mill"),
        ],
    ),
    (
        "an edit of the aliases of an entry whose alias list is an alias the entry already has",
        "bible",
        "story",
        [
            edit("old", aliases="olden; OLDEN; Olden"),
            edit("closed", aliases="shut"),
        ],
    ),
    (
        "an edit of the aliases with the manuscript missing is refused, a locked entry too",
        "bible",
        "missing",
        [
            edit("old", aliases="Mill"),
            edit("closed", aliases="Mill"),
            edit("old", description="no aliases, so it is allowed"),
        ],
    ),
    ("an edit of the aliases with no readable text is refused", "bible", "no-text", [edit("old", aliases="Mill")]),
    ("an edit of the aliases with emoji, right-to-left and long names", "bible", "story", [edit("bare", aliases="שלום; Wren 😀; " + LONG + "; Zoë; ünal")]),
    ("an edit of the aliases in a file that is not there is refused", "missing", "story", [edit("old", aliases="Mill")]),
    (
        "a create, an edit of its aliases and another create",
        "bible",
        "story",
        [
            create("Mira", "Character", "Mi"),
            edit(guide.entity_id("Mira"), aliases="Mi; Wren; Mira the Tall"),
            create("Mira the Tall"),
        ],
    ),
]


def write_manuscript(folder: Path, key: str) -> str:
    path = folder / "manuscript.json"
    if MANUSCRIPTS[key] is not None:
        path.write_text(json.dumps(MANUSCRIPTS[key]), encoding="utf-8")
    return str(path)


def run_step(path: str, manuscript: str, command: str, arguments: dict) -> None:
    common = {"guide": path, "manuscript": manuscript, "espeak_library": "", "default_source": ""}
    if command == "create":
        guide.create(
            argparse.Namespace(
                **common,
                name=arguments["name"],
                category=arguments["category"],
                aliases=arguments["aliases"],
                description=arguments["description"],
                properties=json.dumps(arguments["properties"]) if arguments["properties"] else "",
            )
        )
        return
    fields = list(arguments["fields"])
    guide.edit(argparse.Namespace(**common, entity_id=arguments["entity_id"], field=fields, value=[arguments["fields"][field] for field in fields]))


def run_case(start: dict | None, manuscript_key: str, steps: list, pronounced: dict, searched: dict) -> list[dict]:
    results = []
    asked: list[str] = []
    seen: list[str] = []

    def pronunciation(name, espeak_library, default_source=None):
        asked.append(name)
        pronounced[name] = fixed_pronunciation(name, espeak_library, default_source)
        return pronounced[name]

    real_find = guide.find_occurrences

    def find_occurrences(paragraphs, name):
        seen.append(name)
        searched[name] = real_find(paragraphs, name)
        return searched[name]

    with (
        tempfile.TemporaryDirectory() as temporary,
        patch.object(guide, "pronunciation", pronunciation),
        patch.object(guide, "find_occurrences", find_occurrences),
    ):
        folder = Path(temporary)
        path = str(folder / "ManuscriptGuide" / "manuscript_guide.json")
        manuscript = write_manuscript(folder, manuscript_key)
        if start is not None:
            guide.write_json(path, copy.deepcopy(start))
        for command, arguments in steps:
            before = Path(path).read_text(encoding="utf-8") if Path(path).exists() else None
            asked.clear()
            seen.clear()
            try:
                run_step(path, manuscript, command, arguments)
            except ValueError as exc:
                after = Path(path).read_text(encoding="utf-8") if Path(path).exists() else None
                assert after == before, f"{command} {arguments} refused but wrote"
                results.append({"command": command, "arguments": arguments, "error": str(exc), "pronounced": list(asked), "searched": list(seen)})
                continue
            after = Path(path).read_text(encoding="utf-8")
            results.append(
                {
                    "command": command,
                    "arguments": arguments,
                    "wrote": after != before,
                    "after": json.loads(after),
                    "pronounced": list(asked),
                    "searched": list(seen),
                }
            )
    return results


class CreateParityTests(unittest.TestCase):
    def test_every_case_matches_the_committed_file(self):
        pronounced: dict = {}
        searched: dict = {}
        cases = [
            {
                "name": name,
                "start": start,
                "manuscript": manuscript,
                "steps": steps,
                "results": run_case(STARTS[start], manuscript, steps, pronounced, searched),
            }
            for name, start, manuscript, steps in CASES
        ]
        results = [result for case in cases for result in case["results"]]
        self.assertGreater(sum("error" in result for result in results), 20, "cases the commands refuse")
        self.assertGreater(sum(result["command"] == "create" and "after" in result for result in results), 15, "creates that work")
        self.assertGreater(sum(result["command"] == "edit" and "after" in result for result in results), 8, "alias edits that work")
        descriptions = [
            entity["description"]["text"]
            for result in results
            if result["command"] == "create" and "after" in result
            for entity in result["after"]["entities"]
            if entity["description"]["text"].startswith("Explicitly")
        ]
        self.assertGreaterEqual(len(set(descriptions)), 4, "creates the manuscript describes")
        contract_files.check(
            "create-parity",
            {
                "manuscripts": {key: ({"error": self.manuscript_error(key)} if key != "story" else {"error": ""}) for key in MANUSCRIPTS},
                "starts": STARTS,
                "pronunciations": pronounced,
                "occurrences": searched,
                "cases": cases,
            },
            TESTDATA,
        )

    def manuscript_error(self, key: str) -> str:
        with tempfile.TemporaryDirectory() as temporary:
            try:
                guide.load_manuscript(write_manuscript(Path(temporary), key))
            except ValueError as exc:
                return str(exc)
        return ""


if __name__ == "__main__":
    unittest.main()
