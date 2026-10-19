"""What the sidecar's `create` and `edit` with `aliases` do to a file, recorded for the Go host to replay.

The host runs both itself (apps/desktop/internal/guide/create.go) and asks the sidecar only for the pronunciations
(``pronunciation-lookup``), because those come from the dictionaries and eSpeak. So each case here runs the real command with
``pronunciation`` replaced by a stand-in that answers from a fixed table (one answer per source the registry has, and the "not generated"
answer), and records:

* ``pronunciations``: the answer the stand-in gave for each name it was asked about, which the Go replay hands back from its injected
  lookup, so no Python starts in the Go job;
* ``lookups`` per step: the names the real command asked about, which the Go replay must ask about too (the same names, the order and
  repeats aside). A step that is refused records none, because the host does not look up a name for a command it is about to refuse;
* the entry the step created or changed, or the reason it was refused, and whether the file changed.

``TestCreatesMatchTheSidecarCases`` in the guide package replays each case twice, as a chain on the host's own writes and with each step on
the file the sidecar left. ``descriptions`` records ``direct_description`` over awkward sentences, which the host ports. Run with
``UPDATE_CONTRACTS=1`` to rewrite ``create-parity.json`` after a deliberate change.
"""

import argparse
import contextlib
import copy
import hashlib
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

TESTDATA = Path(__file__).parents[3] / "apps" / "desktop" / "internal" / "guide" / "testdata"

# What each pronunciation source answers, by registry name. The stand-in picks one per name from the name's own hash, so the same name
# always gets the same answer and every source (and the answer for a name nothing knows) is used by some case.
ANSWERS = (
    ("cmu", "medium"),
    ("wiktextract", "medium"),
    ("espeak", "low"),
    ("not generated", "unknown"),
)


def stand_in_value(name: str) -> dict:
    source, confidence = ANSWERS[hashlib.sha1(name.encode("utf-8")).digest()[0] % len(ANSWERS)]
    if source == "not generated":
        return {"ipa": "", "source": source, "confidence": confidence}
    return {"ipa": f"/{name.lower()}/", "source": source, "confidence": confidence}


# ---- manuscripts ---------------------------------------------------------------------------------------------------------------------


def small_manuscript(*chapters: tuple[str, str | None, list[str]]) -> dict:
    """A manuscript of (title, content kind or None for the default, paragraph texts) chapters."""
    out_chapters, out_paragraphs = [], []
    for index, (title, kind, texts) in enumerate(chapters):
        chapter_id = f"c-{index + 1:04d}"
        chapter = {"id": chapter_id, "title": title}
        if kind is not None:
            chapter["contentKind"] = kind
        out_chapters.append(chapter)
        for text in texts:
            number = len(out_paragraphs)
            out_paragraphs.append({"id": f"p-{number + 1:06d}", "chapterId": chapter_id, "chapterTitle": title, "text": text})
    return {"schemaVersion": 1, "documentId": "doc-create", "chapters": out_chapters, "paragraphs": out_paragraphs}


def as_text(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


# Sentences that say what somebody is: the appositive and copular forms direct_description reads, and the near misses it does not.
DESCRIBED = [
    "Wren was a courier who knew every road.",
    "Nicholas, is the miller of Ashgrove. Nick was an honest boy.",
    "Mrs. O'Neil, was the cook. O'Neil is the one who counts.",
    "ZOË WAS AN artist, and Zoë 😀x is THE one.",
    "דוד was a king, and דוד, is the best of them.",
    "محمد is a poet from the south.",
    "İstanbul is the city. Istanbul was a place. ıstanbul is a name.",
    "Ann  was a  baker; Ann is an  \t owl.",
    "Kelvin K is the unit. Kelvin K, was a scale.",
    "The Boy was the one who ran. Boy is a word.",
    "Wren wasn't a thief. Wren isn't a liar. Wren washed. Wren island.",
    "Wren was any one of them. Wren was anything. Wren was a",
    "Wren was a , and nothing else. Wren is the; ghost.",
    "Wren is   the    ,x",
    "Wren is a     , gap",
    "A name: Ana is a person! Ana was the owner? Anana is a thing.",
    "Ashgrove is the place. The Ashgrove was a village. Ash grove is a phrase.",
    "Ὀδυσσεύς was an adventurer; ΟΔΥΣΣΕΥΣ is the king.",
    "STRASSE is a road. Straße was the road. strasse is the way.",
    "ﬁne is a word; Fine was a state.",
    "x" * 200 + " Wren was a long sentence maker " + "y" * 200,
    "Wren was an",
    "Wren was a x",
    "Wren was a\nline break. Wren is the\nother.",
    "😀 Wren was a 😀 courier. 👨‍👩‍👧 Wren is the 👨‍👩‍👧 end.",
]


def real_manuscript_text() -> str:
    """The committed real-shaped manuscript (written by test_rescan_parity.py)."""
    return (TESTDATA / "rescan-manuscript.json").read_text(encoding="utf-8")


MANUSCRIPTS: dict = {
    "real": {"file": "rescan-manuscript.json"},
    "described": as_text(
        small_manuscript(
            ("One", None, DESCRIBED[:12]),
            ("Notes", "reference", ["Wren is a reference only. Ghost Writer was a hidden one."]),
            ("Two", "narration", DESCRIBED[12:]),
        )
    ),
    "small": as_text(
        small_manuscript(
            ("One", None, ["Ann met Annie at the gate.", "Nobody else came.", "Zoë 😀x waved. Zoe waved."]),
            ("Two", "narration", ["ANN left. Ann came back. ann sat. Al said hello to Ally and Alfie."]),
        )
    ),
    "all-reference": as_text(small_manuscript(("Notes", "reference", ["Ann."]))),
    "wrong-schema": as_text({**small_manuscript(("One", None, ["Ann."])), "schemaVersion": 2}),
    "not-json": "{not json",
    "missing": None,
}


def manuscript_text(spec) -> str | None:
    if isinstance(spec, dict):
        return real_manuscript_text()
    return spec


# ---- Story Bible files ---------------------------------------------------------------------------------------------------------------


def evidence(chapter: str, paragraph_number: int, excerpt: str) -> dict:
    return {"chapter": chapter, "chapterId": "c-old", "paragraph": paragraph_number, "paragraphId": f"p-old-{paragraph_number}", "excerpt": excerpt}


def alias(text: str, ipa: str = "", *occurrences: dict) -> dict:
    return {"text": text, "pronunciation": {"ipa": ipa, "source": "cmu", "confidence": "medium"} if ipa else {}, "occurrences": list(occurrences)}


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
        "context": "",
        "relationships": [],
        "properties": [],
        "locked": False,
        "manual": False,
        "review_state": "reviewed",
        "appearances": [],
    }
    value.update(extra)
    return value


WREN = guide.entity_id("Wren")
PLAIN = guide.entity_id("Plain")


def bible() -> dict:
    stale = evidence("Old", 3, "stale excerpt")
    return {
        "schema_version": 2,
        "source": {"path": "/somewhere/manuscript.json", "sha256": "old"},
        "generated_at": "2026-10-01T00:00:00Z",
        "entities": [
            entry(WREN, "Wren", locked=True, aliases=[alias("Wrenna", "ˈrɛnə")], review_state="needs review"),
            entry(
                "al",
                "Al",
                aliases=[alias("Ally", "ˈæli", stale), alias("Alfie", "", stale), alias("Big Al")],
                occurrences=[stale],
                occurrence_count=3,
                review={"entry": False, "aliases": ["Alfie", "Big Al"]},
                review_state="needs review",
            ),
            entry(PLAIN, "Plain", aliases=[alias("Plainer")]),
            entry("legacy", "Legacy", aliases=["Old One", "old two"]),
            entry("noreview", "No Review", aliases=[alias("NR")], review_state="needs review"),
            entry("kelvin", "Kelvin K", aliases=[alias("k"), alias("K")]),
            entry("zoe", "Zoë", aliases=[alias("Zoe"), alias("ZOË")]),
            entry(guide.entity_id("Taken Name"), "Taken Name"),
            entry("odd-review", "Odd Review", aliases=[alias("Odd")], review="not an object"),
        ],
        "dialogue_cues": [],
        "absorbed_names": {},
    }


def with_types(document: dict) -> dict:
    """A Story Bible whose narrator added the type ``Hero`` and renamed ``Item`` to ``Thing``."""
    types = [dict(row) for row in guide.DEFAULT_TYPES]
    types[4] = {**types[4], "name": "Thing"}
    types.append({"name": "Hero", "colour": "rose", "speaks": True})
    return {**document, "types": types}


def guide_text(kind: str | None) -> str | None:
    match kind:
        case None:
            return None
        case "bible":
            return as_text(bible())
        case "types":
            return as_text(with_types(bible()))
        case "empty":
            return "{}"
        case "null":
            return "null"
        case "bare":
            return as_text({"schema_version": 2, "entities": []})
        case "built":
            return as_text(
                {"schema_version": 2, "source": {"path": "/x", "sha256": "abc"}, "generated_at": "2026-10-01T00:00:00Z", "entities": [], "absorbed_names": {}}
            )
    raise AssertionError(kind)


# ---- steps ---------------------------------------------------------------------------------------------------------------------------


def create_step(name: str, category: str = "Character", aliases: list[str] | None = None, description: str = "", properties: list[dict] | None = None):
    return "create", {"name": name, "category": category, "aliases": aliases or [], "description": description, "properties": properties or []}


def edit_step(entity_id: str, **fields: str):
    return "edit", {"entity_id": entity_id, "fields": fields}


MANY_ALIASES = [f"Alias {n}" for n in range(60)]

# (name, start guide, manuscript, steps). A start guide of None is no file.
CASES = [
    ("a create with aliases", "bible", "small", [create_step("Ann", aliases=["Annie", "Ann the Fair"])]),
    (
        "a create in the real manuscript, name and aliases found",
        "bible",
        "real",
        [create_step("Nicholas", aliases=["Nick", "Nicky"]), create_step("Wren Ashgrove")],
    ),
    (
        "a create with a description and properties",
        "bible",
        "small",
        [create_step("Ann", description="Keeps the gate.", properties=[{"key": "Codename", "value": "Wren"}, {"key": "Eyes", "value": ""}])],
    ),
    (
        "a description the manuscript gives is kept unless the narrator gives one",
        "bible",
        "described",
        [create_step("Wren"), create_step("Nicholas", description="Mine.")],
    ),
    (
        "a name that is another entry's once non-Latin letters are dropped is refused (all such names have the id of the empty name)",
        "bible",
        "real",
        [create_step("דוד"), create_step("محمد"), create_step("Οδυσσευς"), create_step("😀"), create_step("")],
    ),
    *[
        (f"a create of {name!r} in a manuscript that describes people", "bible", "described", [create_step(name)])
        for name in (
            "Wren",
            "Nicholas",
            "Mrs. O'Neil",
            "Zoë",
            "דוד",
            "محمد",
            "İstanbul",
            "Ann",
            "Kelvin K",
            "The Boy",
            "Ana",
            "Ashgrove",
            "Ὀδυσσεύς",
            "STRASSE",
            "Ghost Writer",
        )
    ],
    *[
        (f"a create of {name!r}, found in the real manuscript", "bible", "real", [create_step(name)])
        for name in ("Zoë 😀", "דוד", "محمد", "Οδυσσευς", "\U0001f468\u200d\U0001f469\u200d\U0001f467", "e\u0301cole", "😀", "Mrs. O'Neil", "Kelvin K", "Ana")
    ],
    ("an alias that is another entry's name", "bible", "real", [create_step("Nicholas", aliases=["Wren", "Al"]), create_step("Al Capone", aliases=["Al"])]),
    (
        "aliases that repeat, blank ones and padded ones",
        "bible",
        "small",
        [create_step("Ann", aliases=["Annie", "annie", " Annie ", "", "   ", "Ann", "Zoë 😀x"])],
    ),
    ("an alias with a semicolon is two aliases", "bible", "small", [create_step("Ann", aliases=["Annie;Al", "Ally"])]),
    ("a name padded with whitespace", "bible", "small", [create_step("  Ann \n"), create_step("　Zoë　")]),
    ("an uncategorised create is a Draft", "bible", "small", [create_step("Ann", category=""), create_step("Zed", category="  ")]),
    (
        "every default type",
        "bible",
        "small",
        [create_step(f"Ann {kind}", category=kind) for kind in ("Character", "Place", "Organization", "Lore", "Item", "Event")],
    ),
    (
        "the narrator's own types",
        "types",
        "small",
        [create_step("Ann", category="Hero"), create_step("Annie", category="Thing"), create_step("Anne", category="Item")],
    ),
    (
        "a category that is not a type is refused",
        "bible",
        "small",
        [create_step("Ann", category="Wizard"), create_step("Ann", category="Needs Review"), create_step("Ann", category="draft")],
    ),
    ("a create with no name is refused", "bible", "small", [create_step(""), create_step("   "), create_step("　 ")]),
    (
        "a name that is already an entry is refused",
        "bible",
        "small",
        [create_step("Plain"), create_step("PLAIN"), create_step("p l a i n!"), create_step("Taken Name")],
    ),
    ("a name that normalizes to a locked entry is refused", "bible", "small", [create_step("Wren"), create_step("W-R-E-N"), create_step("wren 2")]),
    ("a name that normalizes to nothing", "bible", "small", [create_step("!!!"), create_step("???")]),
    (
        "a refusal is read in Python's order: type, name, properties, duplicate, then the manuscript",
        "bible",
        "missing",
        [
            create_step("Ann", category="Wizard"),
            create_step("", category="Character"),
            create_step("Ann", properties=[{"key": "A", "value": ""}, {"key": "a", "value": ""}]),
            create_step("Plain"),
            create_step("Ann"),
        ],
    ),
    (
        "properties are checked",
        "bible",
        "small",
        [
            create_step("Ann", properties=[{"key": "Eyes", "value": "green"}, {"key": "EYES", "value": "x"}]),
            create_step("Ann", properties=[{"key": "  ", "value": "x"}]),
            create_step("Ann", properties=[{"key": " Eyes ", "value": "  green "}]),
            create_step("Anne", properties=[{"key": "ß", "value": ""}, {"key": "SS", "value": ""}]),
            create_step("Annie", properties=[{"key": "it's", "value": ""}, {"key": "IT'S", "value": ""}]),
        ],
    ),
    ("a create with no manuscript is refused", "bible", "missing", [create_step("Ann")]),
    ("a create with a manuscript that is not JSON is refused", "bible", "not-json", [create_step("Ann")]),
    ("a create with a manuscript of another schema is refused", "bible", "wrong-schema", [create_step("Ann")]),
    ("a create with nothing to narrate is refused", "bible", "all-reference", [create_step("Ann")]),
    ("a create with no Story Bible starts one", None, "small", [create_step("Ann", aliases=["Annie"]), create_step("Zed")]),
    ("a create with an empty Story Bible starts one", "empty", "small", [create_step("Ann")]),
    ("a create with a null Story Bible starts one", "null", "small", [create_step("Ann")]),
    ("a create in a Story Bible a build left", "built", "small", [create_step("Ann")]),
    ("a create in a Story Bible with no source", "bare", "small", [create_step("Ann")]),
    ("a long name and many aliases", "bible", "small", [create_step("Ann " + "of the long name " * 20, aliases=MANY_ALIASES)]),
    ("a name nothing in the manuscript says", "bible", "real", [create_step("Nobody Here", aliases=["Not A Soul"])]),
    (
        "a name with characters the pattern language treats specially",
        "bible",
        "described",
        [create_step("C++"), create_step("Dr. Who?"), create_step("(Bob)"), create_step("a|b"), create_step("back\\slash")],
    ),
    ("a create twice (rapid double-fire)", "bible", "small", [create_step("Ann"), create_step("Ann"), create_step("ann")]),
    (
        "a create, then an alias edit of what it created",
        "bible",
        "small",
        [create_step("Ann"), edit_step(guide.entity_id("Ann"), aliases="Annie;Ann the Fair"), edit_step(guide.entity_id("Ann"), aliases="Annie")],
    ),
    ("an alias edit adds an alias and keeps the existing ones as they were", "bible", "small", [edit_step("al", aliases="Ally;Alfie;Big Al;Al the Great")]),
    ("an alias already there, in any case, is kept as it was", "bible", "small", [edit_step("al", aliases="ALLY;alfie;BIG AL")]),
    ("an alias edit removes aliases", "bible", "small", [edit_step("al", aliases="Ally"), edit_step("al", aliases="")]),
    ("an alias edit with blanks and repeats", "bible", "small", [edit_step(PLAIN, aliases=";; ;Plainer;plainer; ;New One;new one;")]),
    ("an alias edit on an entry that has review flags", "bible", "small", [edit_step("al", aliases="Ally;Big Al"), edit_step("al", aliases="Ally")]),
    ("an alias edit on an entry whose review is not an object", "bible", "small", [edit_step("odd-review", aliases="Odd;Even")]),
    ("an alias edit on an entry with no review", "bible", "small", [edit_step("noreview", aliases="NR;Number Two")]),
    ("an alias edit on an entry whose aliases are plain text", "bible", "small", [edit_step("legacy", aliases="Old One;New One")]),
    (
        "an alias edit with other fields",
        "bible",
        "small",
        [edit_step(PLAIN, aliases="Plainer;Ann", description="D", context="C", category="Place", personality="-brave", canonical_name="Planer")],
    ),
    ("an alias edit marks the entry reviewed", "bible", "small", [edit_step("noreview", aliases="NR;Ann")]),
    ("an alias edit in the real manuscript", "bible", "real", [edit_step(PLAIN, aliases="Nicholas;Nick;Wren;דוד;محمد;Zoë 😀;Mrs. O'Neil")]),
    ("an alias edit of emoji, right-to-left and combining text", "bible", "real", [edit_step(PLAIN, aliases="😀;👨‍👩‍👧;école;שלום דוד;ال محمد")]),
    ("an alias edit of a locked entry is refused", "bible", "small", [edit_step(WREN, aliases="Wrenna;Ann"), edit_step(WREN, aliases="Wrenna")]),
    ("an alias edit that unlocks and then adds, in two steps", "bible", "small", [edit_step(WREN, locked="false"), edit_step(WREN, aliases="Wrenna;Ann")]),
    ("an alias edit with locked and aliases together is refused", "bible", "small", [edit_step(WREN, aliases="Ann", locked="false")]),
    ("an alias edit of an unknown entry is refused", "bible", "small", [edit_step("nobody", aliases="Ann")]),
    (
        "an alias edit with a bad field after the aliases is refused whole",
        "bible",
        "small",
        [edit_step(PLAIN, aliases="Plainer;Brand New", category="Wizard"), edit_step(PLAIN, aliases="Brand New", properties='[{"key": "A"}]')],
    ),
    (
        "an alias edit with no manuscript is refused",
        "bible",
        "missing",
        [edit_step(PLAIN, aliases="Plainer;Brand New"), edit_step(PLAIN, description="no aliases, no manuscript read")],
    ),
    ("an alias edit with a manuscript that is not JSON is refused", "bible", "not-json", [edit_step(PLAIN, aliases="Plainer")]),
    ("an alias edit with nothing to narrate is refused", "bible", "all-reference", [edit_step(PLAIN, aliases="Plainer")]),
    ("an alias edit where nothing is new asks for no pronunciation", "bible", "small", [edit_step("al", aliases="Ally;Alfie")]),
    (
        "an alias edit in a Story Bible with the narrator's types",
        "types",
        "small",
        [edit_step(PLAIN, aliases="New", category="Hero"), edit_step(PLAIN, aliases="New;Newer", category="Item")],
    ),
    ("an alias edit twice (rapid double-fire)", "bible", "small", [edit_step(PLAIN, aliases="Plainer;New"), edit_step(PLAIN, aliases="Plainer;New")]),
    ("an alias that is another entry's name", "bible", "real", [edit_step(PLAIN, aliases="Wren;Al;Taken Name")]),
]


class Recorder:
    """Stands in for ``pronunciation`` and remembers the names it was asked about."""

    def __init__(self) -> None:
        self.asked: list[str] = []
        self.answers: dict[str, dict] = {}

    def __call__(self, name: str, espeak_library, default_source=None) -> dict:
        self.asked.append(name)
        self.answers[name] = stand_in_value(name)
        return dict(self.answers[name])


def run_step(path: Path, manuscript_path: Path, command: str, arguments: dict, recorder: Recorder) -> dict:
    before = path.read_text(encoding="utf-8") if path.exists() else None
    recorder.asked.clear()
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            run_command(path, manuscript_path, command, arguments)
    except ValueError as exc:
        after = path.read_text(encoding="utf-8") if path.exists() else None
        assert after == before, f"{command} {arguments} refused but wrote"
        return {"command": command, "arguments": arguments, "error": str(exc)}
    after = path.read_text(encoding="utf-8")
    result = {"command": command, "arguments": arguments, "wrote": after != before, "lookups": sorted(set(recorder.asked))}
    result["entity"] = the_entity(json.loads(after), json.loads(before) if before else None, command, arguments)
    return result


def run_command(path: Path, manuscript_path: Path, command: str, arguments: dict) -> None:
    if command == "create":
        guide.create(
            argparse.Namespace(
                guide=str(path),
                manuscript=str(manuscript_path),
                name=arguments["name"],
                category=arguments["category"],
                aliases=";".join(arguments["aliases"]),
                description=arguments["description"],
                properties=json.dumps(arguments["properties"]) if arguments["properties"] else "",
                espeak_library="",
                default_source="",
            )
        )
        return
    fields = sorted(arguments["fields"])
    guide.edit(
        argparse.Namespace(
            guide=str(path),
            entity_id=arguments["entity_id"],
            field=fields,
            value=[arguments["fields"][field] for field in fields],
            manuscript=str(manuscript_path),
            espeak_library="",
            default_source="",
        )
    )


def the_entity(after: dict, before: dict | None, command: str, arguments: dict) -> dict:
    """The entry the step created or changed as the file now holds it. A create adds one entry at the end and an edit changes one entry,
    which this asserts: the rest of the file is as it was, read the way ``load_json`` reads it."""
    normalized_before = before
    if before is not None:
        with tempfile.TemporaryDirectory() as temporary:
            copy_path = Path(temporary) / "manuscript_guide.json"
            copy_path.write_text(json.dumps(before), encoding="utf-8")
            normalized_before = guide.load_json(str(copy_path))
    if command == "create":
        added = after["entities"][-1]
        start = normalized_before or guide.empty_guide()
        assert after["entities"][:-1] == start["entities"], "create changed an existing entry"
        assert {key: value for key, value in after.items() if key != "entities"} == {key: value for key, value in start.items() if key != "entities"}, (
            "create changed more than the entries"
        )
        return added
    entity_id = arguments["entity_id"]

    def rest(document: dict) -> dict:
        return {**document, "entities": [entity for entity in document["entities"] if entity["id"] != entity_id]}

    assert normalized_before is not None
    assert rest(after) == rest(normalized_before), f"edit {entity_id} changed more than the entry"
    return next(entity for entity in after["entities"] if entity["id"] == entity_id)


def record_case(start: str | None, manuscript: str | None, steps: list) -> tuple[list[dict], dict[str, dict]]:
    recorder = Recorder()
    results = []
    with tempfile.TemporaryDirectory() as temporary, patch.object(guide, "pronunciation", recorder):
        path = Path(temporary) / "manuscript_guide.json"
        manuscript_path = Path(temporary) / "manuscript.json"
        if start is not None:
            path.write_text(start, encoding="utf-8")
        if manuscript is not None:
            manuscript_path.write_text(manuscript, encoding="utf-8")
        for command, arguments in steps:
            results.append(run_step(path, manuscript_path, command, copy.deepcopy(arguments), recorder))
    return results, recorder.answers


# (name, text) pairs for direct_description: the sentence is an occurrence's excerpt.
DESCRIPTION_NAMES = [
    "Wren",
    "Nicholas",
    "Mrs. O'Neil",
    "Zoë",
    "דוד",
    "محمد",
    "İstanbul",
    "Ann",
    "Kelvin K",
    "The Boy",
    "Ana",
    "Ashgrove",
    "Ὀδυσσεύς",
    "STRASSE",
    "ﬁne",
    "Ghost Writer",
]


TEMPLATES = [
    "{n} was a courier.",
    "{n}, is the miller of Ashgrove. Then {n} left.",
    "{n} IS AN owl",
    "{n}  was\u00a0a\u2003baker",
    "{n}, was the cook, who came",
    "{n} is the; ghost",
    "{n} was an",
    "{n} wasn't a thief",
    "see {n} was a thing",
    "{n}was a thing",
    "x{n} was a thing",
    "{n} was a \U0001f600 and a bird",
    "{n},was a x",
    " {n} , was a x",
    "{n} ,, was a x",
    "{n} was a   , x",
    "{n} was the end!",
    "Yes! {n} is a person? {n} was the one. {n} is an other.",
    "{n} \u0131s a thing, {n} \u017f the thing",
    "{n}\tis\n\ta\n\nthing",
]


def description_cases() -> list[dict]:
    cases = []
    for name in DESCRIPTION_NAMES:
        last = name.split()[-1]
        corpus = [*DESCRIBED, *(template.format(n=name) for template in TEMPLATES), *(template.format(n=last) for template in TEMPLATES[:6])]
        for text in corpus:
            occurrences = [{"chapter": "C", "chapterId": "c-1", "paragraph": 0, "paragraphId": "p-1", "excerpt": text}]
            cases.append({"name": name, "occurrences": occurrences, "description": guide.direct_description(name, occurrences)})
    # Several occurrences, an occurrence with the whole paragraph as "text", and none.
    pair = [
        {"chapter": "A", "excerpt": "Nothing here. Wren sat."},
        {"chapter": "B", "excerpt": "Then Wren, was a courier. Wren is the other."},
    ]
    cases.append({"name": "Wren", "occurrences": pair, "description": guide.direct_description("Wren", pair)})
    full = [{"chapter": "T", "text": "Wren was a thief.", "excerpt": "Wren is a saint."}]
    cases.append({"name": "Wren", "occurrences": full, "description": guide.direct_description("Wren", full)})
    cases.append({"name": "Wren", "occurrences": [], "description": guide.direct_description("Wren", [])})
    return cases


def create_golden() -> dict:
    cases, pronunciations = [], {}
    for name, start_kind, manuscript_name, steps in CASES:
        results, answers = record_case(guide_text(start_kind), manuscript_text(MANUSCRIPTS[manuscript_name]), steps)
        pronunciations.update(answers)
        cases.append({"name": name, "start": start_kind, "manuscript": manuscript_name, "steps": steps, "results": results})
    kinds = {case[1] for case in CASES}
    return {
        "starts": {kind: guide_text(kind) for kind in sorted(kinds - {None})},
        "manuscripts": MANUSCRIPTS,
        "pronunciations": dict(sorted(pronunciations.items())),
        "cases": cases,
        "descriptions": description_cases(),
    }


class CreateParityTests(unittest.TestCase):
    def test_the_stand_in_uses_every_source(self):
        golden = create_golden()
        sources = {value["source"] for value in golden["pronunciations"].values()}
        self.assertEqual({source for source, _ in ANSWERS}, sources)

    def test_the_cases_create_and_refuse(self):
        golden = create_golden()
        results = [result for case in golden["cases"] for result in case["results"]]
        self.assertGreater(sum(1 for result in results if "error" in result), 25, "refusals")
        self.assertGreater(sum(1 for result in results if result.get("command") == "create" and "entity" in result), 40, "creates")
        self.assertGreater(sum(1 for result in results if result.get("command") == "edit" and "entity" in result), 18, "alias edits")
        described = [case for case in golden["descriptions"] if case["description"]["text"]]
        self.assertGreater(len(described), 200, "descriptions found")
        self.assertGreater(len(golden["descriptions"]) - len(described), 40, "descriptions not found")

    def test_the_committed_file_matches(self):
        contract_files.check("create-parity", create_golden(), TESTDATA)

    def test_a_refusal_asks_for_no_pronunciation(self):
        golden = create_golden()
        for case in golden["cases"]:
            for result in case["results"]:
                if "error" in result:
                    self.assertNotIn("lookups", result)

    def test_the_lookup_command_prints_the_committed_line(self):
        # The line the host parses (guide.Service lookupBatch): the real command over the stand-in, one value for each source.
        by_source: dict[str, str] = {}
        for number in range(100):
            by_source.setdefault(stand_in_value(f"Name {number}")["source"], f"Name {number}")
        names = [*by_source.values(), "Zoë 😀", "דוד"]
        out = io.StringIO()
        with patch.object(guide, "pronunciation", Recorder()), contextlib.redirect_stdout(out):
            guide.pronunciation_lookup(argparse.Namespace(name=names, espeak_library="", default_source=""))
        self.assertEqual({source for source, _ in ANSWERS}, {value["source"] for value in json.loads(out.getvalue())["pronunciations"]})
        contract_files.check("guide-pronunciation-lookup-sidecar", {"names": names, "line": json.loads(out.getvalue())})

    def test_the_stand_in_is_what_create_calls(self):
        # The real command calls the module's own ``pronunciation``; the replacement reaches it, so the recording is of the real create.
        recorder = Recorder()
        with tempfile.TemporaryDirectory() as temporary, patch.object(guide, "pronunciation", recorder):
            guide_path, manuscript_path = Path(temporary) / "g.json", Path(temporary) / "m.json"
            manuscript_path.write_text(MANUSCRIPTS["small"], encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                guide.create(
                    argparse.Namespace(
                        guide=str(guide_path),
                        manuscript=str(manuscript_path),
                        name="Ann",
                        category="",
                        aliases="Annie;Al",
                        description="",
                        properties="",
                        espeak_library="",
                        default_source="",
                    )
                )
        self.assertEqual(["Annie", "Al", "Ann"], recorder.asked)


if __name__ == "__main__":
    unittest.main()
