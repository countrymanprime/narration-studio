"""The BookNLP source of the extraction port (SN-X72), proved against a fake model: the real one runs only in the packaged
smoke test on the narrator's machine.

Each test class is one of the slice's acceptance tests. The adapter offers characters with their alias groups, the speaker
of each quoted line and a Gender property per character; a split group becomes a flagged merge suggestion. A speaker's
confidence comes from the module's table, a gender's from the model, and anything the model gives no score for is null.
It reads nothing but the install folder the host names, and a missing or damaged install is a sentence.
"""

import argparse
import contextlib
import importlib.util
import io
import json
import os
import socket
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

CORE = Path(__file__).parents[1] / "core"
REPO = Path(__file__).parents[3]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, CORE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


guide = sys.modules.get("manuscript_guide") or _load("manuscript_guide")
booknlp = _load("extraction_booknlp")

from narration_common import contract_files
from narration_common.ports import extraction_conformance
from narration_common.ports.extraction import BOOKNLP, BUILT_IN, FLAG_DUPLICATE, NotSupportedError

PARAGRAPHS = [
    {"id": "5-2", "chapterId": "5", "text": "“Who are you?” said the Caterpillar."},
    {"id": "5-15", "chapterId": "5", "text": "“Serpent!” cried the Pigeon. Alice looked up; she was not a serpent."},
    {"id": "8-15", "chapterId": "8", "text": "“Can you play croquet?” The Queen was looking at Alice, and Pigeon flew off."},
]
BOOK = {"paragraphs": PARAGRAPHS}
TEXT = "\n\n".join(paragraph["text"] for paragraph in PARAGRAPHS)
ALICE, CATERPILLAR, PIGEON, QUEEN, PIGEON_TOO = 1, 2, 3, 4, 5


def at(text: str, phrase: str, nth: int = 0) -> tuple[int, int]:
    """The character offsets of the ``nth`` occurrence of ``phrase`` in ``text``."""
    start = -1
    for _ in range(nth + 1):
        start = text.index(phrase, start + 1)
    return start, start + len(phrase)


def mention(cluster: int, phrase: str, prop: str = "PROP", nth: int = 0) -> dict:
    start, end = at(TEXT, phrase, nth)
    return {"id": cluster, "start": start, "end": end, "prop": prop}


def quote(phrase: str, speaker: int | None, by: tuple[str, int] | None) -> dict:
    """A quoted line as the model attributes it: its span, the speaker's cluster and the mention it chose, if any."""
    start, end = at(TEXT, phrase)
    found = {"start": start, "end": end, "speaker": speaker, "mentionStart": None, "mentionEnd": None}
    if by is not None:
        found["mentionStart"], found["mentionEnd"] = at(TEXT, by[0], by[1])
    return found


def character(cluster: int, proper: list[str], common: list[str] = (), gender: dict | None = None, count: int = 2) -> dict:
    """A character as BookNLP's ``.book`` file gives it."""
    return {
        "id": cluster,
        "count": count,
        "mentions": {
            "proper": [{"n": name, "c": count} for name in proper],
            "common": [{"n": name, "c": 1} for name in common],
            "pronoun": [],
        },
        "g": gender,
    }


def she(probability: float | None) -> dict:
    found = {"inference": {"he/him/his": 0.04, "she/her": probability or 0.0, "they/them/their": 0.03}, "argmax": "she/her", "total": 4.0}
    if probability is not None:
        found["max"] = probability
    return found


def wonderland() -> dict:
    """The analysis of PARAGRAPHS: four characters, the Pigeon split in two, three quoted lines (one tagged, one implicit,
    one tagged by a verb after the name), and Alice's gender."""
    return {
        "characters": [
            character(ALICE, ["Alice"], gender=she(0.93), count=4),
            character(CATERPILLAR, [], ["the Caterpillar"], gender={"inference": {}, "argmax": "he/him/his", "max": 0.55, "total": 1.0}),
            character(PIGEON, ["the Pigeon"], count=3),
            character(QUEEN, ["The Queen"]),
            character(PIGEON_TOO, ["Pigeon"]),
        ],
        "mentions": [
            mention(CATERPILLAR, "the Caterpillar", "NOM"),
            mention(PIGEON, "the Pigeon"),
            mention(ALICE, "Alice"),
            mention(ALICE, "she", "PRON"),
            mention(QUEEN, "The Queen"),
            mention(ALICE, "Alice", nth=1),
            mention(PIGEON_TOO, "Pigeon", nth=1),
        ],
        "quotes": [
            quote("“Who are you?”", CATERPILLAR, ("the Caterpillar", 0)),
            quote("“Serpent!”", PIGEON, ("the Pigeon", 0)),
            quote("“Can you play croquet?”", QUEEN, ("The Queen", 0)),
        ],
    }


class FakeModel:
    """Stands in for BookNLP: answers each text with ``analysis`` and records the texts it was given."""

    def __init__(self, analysis=None, variant: str = "small"):
        self.analysis = analysis if analysis is not None else wonderland()
        self.variant = variant
        self.texts: list[str] = []

    def analyse(self, text: str) -> dict:
        self.texts.append(text)
        return json.loads(json.dumps(self.analysis))


WHEEL_BOOKNLP = textwrap.dedent(
    """
    import torch

    LOADED = []

    class BookNLP:
        def __init__(self, language, params):
            LOADED.append((language, params, torch.load(params["entity_model_path"], map_location="cpu")))

        def process(self, input_file, output_folder, idd):
            raise AssertionError("the loader must not run the model")
    """
)

WHEEL_TORCH = textwrap.dedent(
    """
    CALLS = []

    def load(path, *args, **kwargs):
        CALLS.append((path, kwargs))
        return {"bert.embeddings.position_ids": [0, 1], "bert.embeddings.word_embeddings.weight": [1.0]}
    """
)


def _complete_install(root: Path, variant: str = "small", *, wheels: bool = True) -> Path:
    """An install folder with the weights of ``variant``, and fake ``booknlp`` and ``torch`` packages in their wheel folders."""
    root.mkdir(parents=True, exist_ok=True)
    for name in booknlp.VARIANTS[variant]:
        (root / name).write_text("weights", encoding="utf-8")
    if not wheels:
        return root
    package = root / "wheel-booknlp" / "booknlp"
    package.mkdir(parents=True)
    (package / "__init__.py").write_text("", encoding="utf-8")
    (package / "booknlp.py").write_text(WHEEL_BOOKNLP, encoding="utf-8")
    info = root / "wheel-booknlp" / "booknlp-1.0.8.dist-info"
    info.mkdir()
    (info / "METADATA").write_text("Metadata-Version: 2.1\nName: booknlp\nVersion: 1.0.8\n", encoding="utf-8")
    torch = root / "wheel-torch" / "torch"
    torch.mkdir(parents=True)
    (torch / "__init__.py").write_text(WHEEL_TORCH, encoding="utf-8")
    return root


@contextlib.contextmanager
def _forget_booknlp():
    """Imports of the fake packages and the ``sys.path`` entries the loader added are undone afterwards."""
    path, modules = list(sys.path), set(sys.modules)
    try:
        yield
    finally:
        sys.path[:] = path
        for name in set(sys.modules) - modules:
            if name.split(".")[0] in ("booknlp", "torch"):
                del sys.modules[name]


def source_with(model, install: Path | None = None, log=None) -> "booknlp.BookNlpSource":
    folder = install or _complete_install(Path(tempfile.mkdtemp()), model.variant)
    return booknlp.BookNlpSource(folder, loader=lambda path, variant: model, log=log or (lambda line: None))


def extract(model=None, **options) -> list[dict]:
    return source_with(model or FakeModel(), **options).extractor().extract(BOOK)


def of_kind(raws: list[dict], kind: str) -> list[dict]:
    return [raw for raw in raws if raw["payload"]["kind"] == kind]


def _write_manuscript(root: Path) -> Path:
    """A canonical manuscript.json holding PARAGRAPHS."""
    chapters = sorted({p["chapterId"] for p in PARAGRAPHS})
    data = {
        "schemaVersion": guide.canonical_manuscript.SCHEMA_VERSION,
        "documentId": "test-document",
        "importedAt": "2026-01-01T00:00:00+00:00",
        "importer": {"format": "markdown", "version": guide.canonical_manuscript.IMPORTER_VERSION},
        "source": {"fileName": "fixture.md", "sha256": "0" * 64, "storedPath": "narration-utils/manuscript/sources/fixture.md"},
        "chapters": [{"id": c, "title": c, "subtitle": None, "index": i, "wordCount": 10, "sections": []} for i, c in enumerate(chapters)],
        "paragraphs": [
            {"id": p["id"], "index": i, "chapterId": p["chapterId"], "chapterTitle": p["chapterId"], "sectionId": None, "text": p["text"], "sourceIndex": i}
            for i, p in enumerate(PARAGRAPHS)
        ],
    }
    path = guide.canonical_manuscript.manuscript_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


class NamesSpeakersAndGenderTests(unittest.TestCase):
    def test_booknlp_offers_characters_with_their_alias_groups(self):
        analysis = wonderland()
        analysis["characters"][0]["mentions"]["proper"] = [{"n": "Alice", "c": 4}, {"n": "Miss Alice", "c": 1}]
        entries = {raw["payload"]["name"]: raw for raw in of_kind(extract(FakeModel(analysis)), "entry")}

        self.assertEqual({"Alice", "the Caterpillar", "the Pigeon", "The Queen"}, set(entries))
        self.assertEqual(["Miss Alice"], entries["Alice"]["payload"]["aliases"])
        self.assertEqual("Character", entries["Alice"]["payload"]["type"])
        self.assertEqual("5", entries["Alice"]["chapterId"])
        self.assertEqual([{"paragraphId": "5-15", "text": "Alice looked up; she was not a serpent."}], entries["Alice"]["quotes"])

    def test_booknlp_offers_the_speaker_of_each_quoted_line_with_the_quote(self):
        speakers = {raw["payload"]["quote"]: raw for raw in of_kind(extract(), "speaker")}

        self.assertEqual(
            {"“Who are you?”": "the Caterpillar", "“Serpent!”": "the Pigeon", "“Can you play croquet?”": "The Queen"},
            {q: raw["payload"]["speaker"] for q, raw in speakers.items()},
        )
        self.assertEqual([{"paragraphId": "5-2", "text": "“Who are you?”"}], speakers["“Who are you?”"]["quotes"])
        self.assertEqual("8", speakers["“Can you play croquet?”"]["chapterId"])

    def test_booknlp_offers_a_gender_property_per_character_it_reports_one_for(self):
        genders = {raw["payload"]["entry"]: raw for raw in of_kind(extract(), "property")}

        self.assertEqual({"Alice", "the Caterpillar"}, set(genders))
        self.assertEqual({"kind": "property", "entry": "Alice", "key": "Gender", "value": "Female"}, genders["Alice"]["payload"])
        self.assertEqual("Male", genders["the Caterpillar"]["payload"]["value"])
        self.assertEqual([{"paragraphId": "5-15", "text": "Alice looked up; she was not a serpent."}], genders["Alice"]["quotes"])

    def test_a_cluster_with_only_pronouns_is_no_character(self):
        analysis = wonderland()
        analysis["characters"].append({"id": 9, "count": 3, "mentions": {"proper": [], "common": [], "pronoun": [{"n": "it", "c": 3}]}, "g": None})

        self.assertEqual(4, len(of_kind(extract(FakeModel(analysis)), "entry")))

    def test_a_pronoun_set_other_than_he_or_she_gives_no_gender(self):
        analysis = wonderland()
        analysis["characters"][0]["g"] = {"inference": {}, "argmax": "they/them/their", "max": 0.8, "total": 3.0}

        self.assertNotIn("Alice", {raw["payload"]["entry"] for raw in of_kind(extract(FakeModel(analysis)), "property")})

    def test_every_suggestion_is_under_the_booknlp_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root)
            install = _complete_install(root / "booknlp")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                booknlp.suggest(argparse.Namespace(manuscript=str(manuscript), install=str(install), spacy_model=""), loader=lambda path, variant: FakeModel())

        lines = [json.loads(line) for line in out.getvalue().splitlines()]
        self.assertEqual(10, len(lines))
        self.assertEqual({BOOKNLP}, {line["source"] for line in lines})

    def test_only_names_speakers_and_gender_are_offered(self):
        self.assertEqual({"entry", "alias", "speaker", "property"}, {raw["payload"]["kind"] for raw in extract()})


class SureWhenTaggedUnsureWhenImplicitTests(unittest.TestCase):
    def confidences(self, variant: str) -> dict[str, float | None]:
        return {raw["payload"]["quote"]: raw["confidence"] for raw in of_kind(extract(FakeModel(variant=variant)), "speaker")}

    def test_a_tagged_speaker_takes_the_tables_tagged_confidence_and_an_implicit_one_the_lower(self):
        found = self.confidences("small")

        self.assertEqual(booknlp.SPEAKER_CONFIDENCE[("small", "tagged")].confidence, found["“Who are you?”"])
        self.assertEqual(booknlp.SPEAKER_CONFIDENCE[("small", "tagged")].confidence, found["“Serpent!”"])
        self.assertEqual(booknlp.SPEAKER_CONFIDENCE[("small", "implicit")].confidence, found["“Can you play croquet?”"])

    def test_a_tag_before_the_quote_and_a_name_before_the_verb_are_tags_too(self):
        analysis = wonderland()
        text = "\n\n".join(p["text"] for p in PARAGRAPHS)
        analysis["quotes"][0]["mentionStart"], analysis["quotes"][0]["mentionEnd"] = at(text, "Alice")
        self.assertFalse(booknlp.tagged(text, analysis["quotes"][0]), "Alice is in another paragraph: no tag names her")
        line = "Alice said, “Hello.” “Goodbye,” the Queen replied. “Off,” cried she. “Yes,” thought Alice."
        cases = {"“Hello.”": ("Alice", True), "“Goodbye,”": ("the Queen", True), "“Off,”": ("she", True), "“Yes,”": ("Alice", False)}
        for said, (who, expected) in cases.items():
            start, end = at(line, said)
            m_start, m_end = at(line, who, 1 if said == "“Yes,”" else 0)
            found = {"start": start, "end": end, "speaker": 1, "mentionStart": m_start, "mentionEnd": m_end}
            self.assertEqual(expected, booknlp.tagged(line, found), said)

    def test_the_tagged_confidence_is_sure_and_the_implicit_one_is_below_the_75_percent_rule(self):
        for variant in booknlp.VARIANTS:
            self.assertGreaterEqual(booknlp.SPEAKER_CONFIDENCE[(variant, "tagged")].confidence, 0.9)
            self.assertLess(booknlp.SPEAKER_CONFIDENCE[(variant, "implicit")].confidence, 0.75)

    def test_the_large_variant_is_surer_on_the_same_lines_and_keeps_the_same_flags(self):
        small, big = self.confidences("small"), self.confidences("big")

        self.assertEqual(set(small), set(big))
        for line in small:
            self.assertGreater(big[line], small[line], line)
        self.assertLess(big["“Can you play croquet?”"], 0.75, "an implicit speaker still needs verifying on the large weights")
        flags = lambda variant: [(raw["payload"], raw.get("flag")) for raw in extract(FakeModel(variant=variant)) if raw.get("flag")]
        self.assertEqual(flags("small"), flags("big"))

    def test_every_row_of_the_table_gives_its_reason(self):
        self.assertEqual({(v, how) for v in booknlp.VARIANTS for how in ("tagged", "implicit")}, set(booknlp.SPEAKER_CONFIDENCE))
        for row in booknlp.SPEAKER_CONFIDENCE.values():
            self.assertGreater(len(row.why), 40)
            self.assertTrue(0 < row.confidence < 1)


class SplitGroupIsFlaggedDuplicateTests(unittest.TestCase):
    def test_two_clusters_for_one_person_give_a_flagged_merge_suggestion_naming_both(self):
        (merge,) = of_kind(extract(), "alias")

        self.assertEqual({"kind": "alias", "entry": "the Pigeon", "alias": "Pigeon"}, merge["payload"])
        self.assertEqual(FLAG_DUPLICATE, merge["flag"])
        self.assertIn("the Pigeon", merge["note"])
        self.assertIn("Pigeon”", merge["note"])
        self.assertIsNone(merge["confidence"], "a merge needs verifying: BookNLP gives no score for it")
        self.assertEqual([{"paragraphId": "8-15", "text": "The Queen was looking at Alice, and Pigeon flew off."}], merge["quotes"])

    def test_the_smaller_group_is_not_offered_as_a_second_entry(self):
        names = [raw["payload"]["name"] for raw in of_kind(extract(), "entry")]

        self.assertNotIn("Pigeon", names)
        self.assertEqual(1, names.count("the Pigeon"))

    def test_distinct_people_are_not_merged(self):
        self.assertEqual(1, len(of_kind(extract(), "alias")), "Alice, the Caterpillar and the Queen stay apart")


class VariantFollowsTheInstallTests(unittest.TestCase):
    def test_the_large_weights_are_used_when_both_are_there(self):
        install = _complete_install(_complete_install(Path(tempfile.mkdtemp()), "small", wheels=False), "big")
        used: list[str] = []
        booknlp.BookNlpSource(install, loader=lambda path, variant: used.append(variant) or FakeModel(variant=variant)).extractor()

        self.assertEqual(["big"], used)

    def test_the_small_weights_are_used_when_only_they_are_there(self):
        self.assertEqual("small", booknlp.variant_of(_complete_install(Path(tempfile.mkdtemp()), "small")))
        self.assertEqual("big", booknlp.variant_of(_complete_install(Path(tempfile.mkdtemp()), "big")))

    def test_neither_is_unavailable(self):
        install = _complete_install(Path(tempfile.mkdtemp()), "small")
        for name in booknlp.VARIANTS["small"]:
            (install / name).unlink()

        self.assertIsNone(booknlp.variant_of(install))
        self.assertFalse(booknlp.BookNlpSource(install).available().ok)

    def test_the_variants_are_the_catalogs_weight_files(self):
        catalog = json.loads((REPO / "config" / "analysis-assets.json").read_text(encoding="utf-8"))
        rows = {row["id"]: row for row in catalog["tools"]}
        for variant, asset in (("small", "booknlp-small"), ("big", "booknlp-big")):
            weights = {f["name"] for f in rows[asset]["files"] if f["name"].endswith(".model")}
            self.assertEqual(weights, set(booknlp.VARIANTS[variant]))
        self.assertEqual(["big", "small"], list(booknlp.VARIANTS), "the large weights are tried first, as the registry ranks them")


class OnlyWhatAVariantReportsTests(unittest.TestCase):
    def test_a_variant_that_reports_no_gender_emits_none(self):
        analysis = wonderland()
        for found in analysis["characters"]:
            del found["g"]

        self.assertEqual([], of_kind(extract(FakeModel(analysis)), "property"))

    def test_a_variant_that_reports_no_speakers_emits_none(self):
        analysis = wonderland()
        del analysis["quotes"]

        raws = extract(FakeModel(analysis))
        self.assertEqual([], of_kind(raws, "speaker"))
        self.assertTrue(of_kind(raws, "entry"))

    def test_a_quote_with_no_speaker_is_not_attributed(self):
        analysis = wonderland()
        analysis["quotes"][0]["speaker"] = None

        self.assertNotIn("“Who are you?”", {raw["payload"]["quote"] for raw in of_kind(extract(FakeModel(analysis)), "speaker")})

    def test_an_empty_analysis_emits_nothing(self):
        self.assertEqual([], extract(FakeModel({})))


class NilConfidenceStaysNilTests(unittest.TestCase):
    def test_a_character_and_a_merge_have_no_score_from_booknlp(self):
        raws = extract()
        for raw in of_kind(raws, "entry") + of_kind(raws, "alias"):
            self.assertIn("confidence", raw)
            self.assertIsNone(raw["confidence"], raw["payload"])

    def test_a_gender_with_no_probability_is_offered_with_null(self):
        analysis = wonderland()
        analysis["characters"][0]["g"] = she(None)

        (alice,) = [raw for raw in of_kind(extract(FakeModel(analysis)), "property") if raw["payload"]["entry"] == "Alice"]
        self.assertIsNone(alice["confidence"])

    def test_a_gender_probability_passes_through_unchanged(self):
        (alice,) = [raw for raw in of_kind(extract(), "property") if raw["payload"]["entry"] == "Alice"]
        self.assertEqual(0.93, alice["confidence"])


class QuotesAreVerbatimTests(unittest.TestCase):
    def test_every_quote_is_a_substring_of_its_paragraph(self):
        text = {paragraph["id"]: paragraph["text"] for paragraph in PARAGRAPHS}
        for raw in extract():
            for found in raw["quotes"]:
                self.assertIn(found["text"], text[found["paragraphId"]])

    def test_the_model_reads_the_paragraphs_joined_by_blank_lines(self):
        model = FakeModel()
        extract(model)
        self.assertEqual([TEXT], model.texts)

    def test_a_span_across_two_paragraphs_or_outside_the_text_is_dropped_with_a_log_line(self):
        analysis = wonderland()
        start, _ = at(TEXT, "cried")
        _, end = at(TEXT, "croquet?”")
        analysis["quotes"][1].update({"start": start, "end": end})
        analysis["quotes"][2].update({"start": len(TEXT) + 5, "end": len(TEXT) + 9})
        logged: list[str] = []

        speakers = of_kind(extract(FakeModel(analysis), log=logged.append), "speaker")

        self.assertEqual(["“Who are you?”"], [raw["payload"]["quote"] for raw in speakers])
        self.assertEqual(2, len(logged))
        self.assertTrue(all("Dropped a BookNLP" in line for line in logged))

    def test_a_carriage_return_is_read_as_a_space_so_offsets_stay_put(self):
        self.assertEqual("a b\n\nc", booknlp.book_text([{"text": "a\rb"}, {"text": "c"}]))


class ReadingBookNlpsOwnFilesTests(unittest.TestCase):
    """The real model writes ``.tokens``, ``.entities``, ``.quotes`` and ``.book`` files; ``read_output`` turns them into the
    analysis the extractor reads, with token ids made character offsets."""

    def write(self, folder: Path) -> None:
        text = "“Hi,” said Ada."
        tokens = [("“", 0), ("Hi", 1), (",", 3), ("”", 4), ("said", 6), ("Ada", 11), (".", 14)]
        header = "paragraph_ID\tsentence_ID\ttoken_ID_within_sentence\ttoken_ID_within_document\tword\tlemma\tbyte_onset\tbyte_offset\tPOS_tag\tfine_POS_tag\tdependency_relation\tsyntactic_head_ID\tevent"
        rows = [f"0\t0\t{i}\t{i}\t{word}\t{word}\t{start}\t{start + len(word)}\tX\tX\tdep\t0\tO" for i, (word, start) in enumerate(tokens)]
        (folder / "b.tokens").write_text("\n".join([header, *rows]) + "\n", encoding="utf-8")
        (folder / "b.entities").write_text("COREF\tstart_token\tend_token\tprop\tcat\ttext\n7\t5\t5\tPROP\tPER\tAda\n8\t1\t1\tNOM\tLOC\tHi\n", encoding="utf-8")
        (folder / "b.quotes").write_text(
            "quote_start\tquote_end\tmention_start\tmention_end\tmention_phrase\tchar_id\tquote\n0\t3\t5\t5\tAda\t7\t“ Hi , ”\n4\t4\tNone\tNone\tNone\tNone\tsaid\n",
            encoding="utf-8",
        )
        book = {
            "characters": [
                {"id": 7, "count": 2, "g": None, "mentions": {"proper": [{"n": "Ada", "c": 2}], "common": [], "pronoun": []}, "agent": [{"w": "said", "i": 4}]}
            ]
        }
        (folder / "b.book").write_text(json.dumps(book), encoding="utf-8")
        assert text[0:5] == "“Hi,”"

    def test_token_spans_become_character_offsets_and_only_people_are_kept(self):
        with tempfile.TemporaryDirectory() as temporary:
            self.write(Path(temporary))
            analysis = booknlp.read_output(Path(temporary), "b")

        self.assertEqual([{"id": 7, "start": 11, "end": 14, "prop": "PROP"}], analysis["mentions"])
        self.assertEqual(
            [
                {"start": 0, "end": 5, "speaker": 7, "mentionStart": 11, "mentionEnd": 14},
                {"start": 6, "end": 10, "speaker": None, "mentionStart": None, "mentionEnd": None},
            ],
            analysis["quotes"],
        )

    def test_only_names_and_gender_are_read_from_a_character(self):
        with tempfile.TemporaryDirectory() as temporary:
            self.write(Path(temporary))
            analysis = booknlp.read_output(Path(temporary), "b")

        self.assertEqual(
            [{"id": 7, "count": 2, "g": None, "mentions": {"proper": [{"n": "Ada", "c": 2}], "common": [], "pronoun": []}}], analysis["characters"]
        )


class ConformanceTests(unittest.TestCase):
    def test_the_booknlp_row_passes_the_ports_conformance_suite(self):
        sample = extraction_conformance.SAMPLE["paragraphs"][0]["text"]
        start, end = at(sample, "Alice")
        analysis = {
            "characters": [character(1, ["Alice"], gender=she(0.9))],
            "mentions": [
                {"id": 1, "start": start, "end": end, "prop": "PROP"},
                {"id": 1, "start": sample.index("her"), "end": sample.index("her") + 3, "prop": "PRON"},
            ],
            "quotes": [],
        }
        extraction_conformance.run(source_with(FakeModel(analysis)))

    def test_an_uninstalled_row_passes_it_too(self):
        extraction_conformance.run(booknlp.BookNlpSource(None))

    def test_the_descriptor_is_the_ports_booknlp_row(self):
        self.assertIs(next(row for row in BUILT_IN if row.name == BOOKNLP), booknlp.BookNlpSource(None).descriptor)

    def test_the_suggest_lines_match_the_committed_contract_file(self):
        lines = [booknlp.line(raw) for raw in extract()]
        testdata = REPO / "apps" / "desktop" / "internal" / "extractionport" / "booknlp" / "testdata"
        contract_files.check("suggest-lines", lines, testdata)


class NoNetworkAtRunTimeTests(unittest.TestCase):
    def test_the_module_imports_no_http_client_and_no_socket(self):
        text = (CORE / "extraction_booknlp.py").read_text(encoding="utf-8")
        for module in ("socket", "http", "urllib", "requests", "httpx", "aiohttp", "huggingface_hub"):
            self.assertNotRegex(text, rf"(?m)^\s*(import|from)\s+{module}\b", module)

    def test_loading_and_extracting_open_no_socket(self):
        def refuse(*args, **kwargs):
            raise AssertionError("the adapter opened a socket")

        install = _complete_install(Path(tempfile.mkdtemp()))
        original = socket.socket
        socket.socket = refuse
        try:
            with _forget_booknlp():
                booknlp.load_model(install, "small")
            source_with(FakeModel()).extractor().extract(BOOK)
        finally:
            socket.socket = original

    def test_the_install_folder_is_the_only_path_loading_reads(self):
        install = _complete_install(Path(tempfile.mkdtemp())).resolve()
        opened: list[str] = []
        watching = [True]

        def audit(event, args):
            if watching[0] and event == "open" and isinstance(args[0], str | bytes | os.PathLike):
                opened.append(os.fsdecode(args[0]))

        sys.addaudithook(audit)
        try:
            with _forget_booknlp():
                booknlp.load_model(install, "small")
                loaded = sys.modules["booknlp.booknlp"].LOADED
        finally:
            watching[0] = False

        self.assertTrue(opened, "the fake package was imported, so something was opened")
        for path in opened:
            self.assertTrue(Path(path).resolve().is_relative_to(install), f"{path} is outside the install folder")
        ((language, params, _),) = loaded
        self.assertEqual("en", language)
        self.assertEqual("custom", params["model"])
        self.assertEqual(str(install), params["model_path"], "BookNLP makes its model folder; it must be the install folder, not the home folder")
        for key, name in zip(("entity_model_path", "coref_model_path", "quote_attribution_model_path"), booknlp.VARIANTS["small"], strict=True):
            self.assertEqual(str(install / name), params[key])

    def test_the_pipeline_is_names_quotes_and_groups_only(self):
        with _forget_booknlp():
            booknlp.load_model(_complete_install(Path(tempfile.mkdtemp())), "small")
            ((_, params, _),) = sys.modules["booknlp.booknlp"].LOADED
        self.assertEqual({"entity", "quote", "coref"}, set(params["pipeline"].split(",")), "events and supersenses are never used (SNX-Q3)")

    def test_weights_are_unpickled_as_tensors_only_without_the_stale_position_ids(self):
        with _forget_booknlp():
            booknlp.load_model(_complete_install(Path(tempfile.mkdtemp())), "small")
            ((_, _, state),) = sys.modules["booknlp.booknlp"].LOADED
            ((_, options),) = sys.modules["torch"].CALLS
            restored = sys.modules["torch"].load
        self.assertTrue(options.get("weights_only"))
        self.assertEqual({"bert.embeddings.word_embeddings.weight": [1.0]}, dict(state))
        self.assertEqual("load", restored.__name__)
        self.assertEqual("torch", restored.__module__, "torch.load is put back once the model is loaded")

    def test_the_loader_asks_huggingface_to_stay_offline(self):
        with _forget_booknlp():
            booknlp.load_model(_complete_install(Path(tempfile.mkdtemp())), "small")
        self.assertEqual("1", os.environ.get("HF_HUB_OFFLINE"))
        self.assertEqual("1", os.environ.get("TRANSFORMERS_OFFLINE"))

    def test_a_missing_install_is_a_sentence(self):
        for install in (None, Path(tempfile.mkdtemp()) / "nowhere"):
            availability = booknlp.BookNlpSource(install).available()
            self.assertFalse(availability.ok)
            self.assertEqual("BookNLP is not downloaded.", availability.reason)
            with self.assertRaises(NotSupportedError) as refused:
                booknlp.BookNlpSource(install).extractor()
            self.assertEqual("BookNLP is not downloaded.", refused.exception.message)

    def test_a_damaged_install_is_a_sentence_naming_the_missing_file(self):
        install = _complete_install(Path(tempfile.mkdtemp()))
        (install / booknlp.VARIANTS["small"][2]).unlink()

        availability = booknlp.BookNlpSource(install).available()

        self.assertFalse(availability.ok)
        self.assertIn(booknlp.VARIANTS["small"][2], availability.reason)
        self.assertTrue(availability.reason.endswith("."))

    def test_an_install_without_the_package_is_damaged(self):
        install = _complete_install(Path(tempfile.mkdtemp()), wheels=False)
        self.assertIn("wheel-booknlp", booknlp.BookNlpSource(install).available().reason)

    def test_a_package_that_will_not_import_is_a_sentence_not_a_traceback(self):
        install = _complete_install(Path(tempfile.mkdtemp()))
        (install / "wheel-booknlp" / "booknlp" / "booknlp.py").write_text("raise ImportError('no transformers')\n", encoding="utf-8")

        with _forget_booknlp(), self.assertRaises(NotSupportedError) as refused:
            booknlp.BookNlpSource(install).extractor()

        self.assertIn("BookNLP could not be loaded", refused.exception.message)
        self.assertIn("no transformers", refused.exception.message)

    def test_a_model_that_fails_on_the_book_is_a_sentence(self):
        class Broken(FakeModel):
            def analyse(self, text):
                raise RuntimeError("CUDA out of memory")

        with self.assertRaises(ValueError) as failed:
            extract(Broken())
        self.assertIn("BookNLP could not read the book: CUDA out of memory", str(failed.exception))

    def test_the_cli_reports_a_missing_install_as_one_line_on_stderr(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root)
            result = subprocess.run(
                [
                    sys.executable,
                    str(CORE / "manuscript_guide.py"),
                    "suggest",
                    "--source",
                    "booknlp",
                    "--manuscript",
                    str(manuscript),
                    "--guide",
                    str(root / "g.json"),
                    "--install",
                    str(root / "absent"),
                ],
                capture_output=True,
                check=False,
                text=True,
                env={**os.environ, "PYTHONPATH": os.pathsep.join([str(REPO / "libs" / "python"), str(CORE)])},
                timeout=120,
            )

        self.assertEqual(1, result.returncode)
        self.assertEqual("", result.stdout)
        self.assertNotIn("Traceback", result.stderr)
        self.assertIn("BookNLP is not downloaded.", result.stderr.strip().splitlines()[-1])


class PackagedSmokeCheckTests(unittest.TestCase):
    def test_self_check_reports_the_package_version_and_the_weights_when_installed(self):
        install = _complete_install(Path(tempfile.mkdtemp()), "big")

        self.assertEqual({"name": "booknlp", "ok": True, "detail": "booknlp 1.0.8, large weights"}, booknlp.self_check([install]))

    def test_self_check_reports_the_folder_the_host_would_use(self):
        small = _complete_install(Path(tempfile.mkdtemp()), "small")
        missing = Path(tempfile.mkdtemp()) / "nowhere"

        self.assertEqual("booknlp 1.0.8, small weights", booknlp.self_check([missing, small])["detail"])

    def test_self_check_reports_not_installed_and_passes_without_an_install(self):
        for installs in ([], [Path(tempfile.mkdtemp()) / "nowhere"], [None]):
            self.assertEqual({"name": "booknlp", "ok": True, "detail": "not installed"}, booknlp.self_check(installs))

    def test_self_check_fails_a_damaged_install(self):
        install = _complete_install(Path(tempfile.mkdtemp()))
        (install / booknlp.VARIANTS["small"][0]).unlink()

        result = booknlp.self_check([install])

        self.assertFalse(result["ok"])
        self.assertIn(booknlp.VARIANTS["small"][0], result["detail"])

    def test_the_sidecars_self_check_passes_when_nothing_is_there(self):
        results = guide.run_self_check(booknlp_installs=[str(Path(tempfile.mkdtemp()) / "nowhere")])
        self.assertIn({"name": "booknlp", "ok": True, "detail": "not installed"}, results)

    def test_the_cli_passes_every_install_folder_to_the_self_check(self):
        install = _complete_install(Path(tempfile.mkdtemp()), "small")
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.suppress(SystemExit):
            guide.self_check(argparse.Namespace(piper_model="", gliner_install="", booknlp_install=[str(Path(tempfile.mkdtemp()) / "big"), str(install)]))
        report = json.loads(out.getvalue())
        self.assertIn({"name": "booknlp", "ok": True, "detail": "booknlp 1.0.8, small weights"}, report["checks"])


class DispatchTests(unittest.TestCase):
    def test_the_dispatch_names_the_source_and_nothing_of_its_tables(self):
        dispatch = (CORE / "manuscript_guide.py").read_text(encoding="utf-8")

        self.assertIn("extraction_booknlp", dispatch)
        self.assertNotIn("SPEAKER_CONFIDENCE", dispatch)
        self.assertNotIn('"Gender"', dispatch)


if __name__ == "__main__":
    unittest.main()
