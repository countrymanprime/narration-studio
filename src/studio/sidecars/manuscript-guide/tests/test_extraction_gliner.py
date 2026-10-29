"""The GLiNER source of the extraction port (SN-X71), proved against a fake model: the real one runs only in the packaged
smoke test on the narrator's machine.

Each test is one of the slice's acceptance tests. The adapter offers candidate names only, with a type from its label
table, the model's own score (or null) and a verbatim quote; it reads nothing but the install folder the host names, and
a missing or damaged install is a sentence.
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
REPO = Path(__file__).parents[5]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, CORE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


guide = sys.modules.get("manuscript_guide") or _load("manuscript_guide")
gliner = _load("extraction_gliner")

from narration_common import brand, contract_files
from narration_common.ports import extraction_conformance
from narration_common.ports.extraction import BUILT_IN, GLINER, KINDS, NotSupportedError

PARAGRAPHS = [
    {"id": "p-000001", "chapterId": "c-0001", "text": "Captain Arelian said the Council of Ash would meet in Dawnspire."},
    {"id": "p-000002", "chapterId": "c-0001", "text": "Later they saw Dawnspire burning. Arelian rode the grey mare alone."},
]
BOOK = {"paragraphs": PARAGRAPHS}


def span(text: str, name: str, label: str, score: float | None, *, at: int = 0) -> dict:
    """A span as GLiNER's ``predict_entities`` gives it: character offsets into the text it was given."""
    start = text.index(name, at)
    found = {"start": start, "end": start + len(name), "text": name, "label": label}
    if score is not None:
        found["score"] = score
    return found


def _write_manuscript(root: Path) -> Path:
    """A canonical manuscript.json holding PARAGRAPHS in one chapter."""
    data = {
        "schemaVersion": guide.canonical_manuscript.SCHEMA_VERSION,
        "documentId": "test-document",
        "importedAt": "2026-01-01T00:00:00+00:00",
        "importer": {"format": "markdown", "version": guide.canonical_manuscript.IMPORTER_VERSION},
        "source": {"fileName": "fixture.md", "sha256": "0" * 64, "storedPath": brand.PROJECT_FOLDER + "/manuscript/sources/fixture.md"},
        "chapters": [{"id": "c-0001", "title": "One", "subtitle": None, "index": 0, "wordCount": 20, "sections": []}],
        "paragraphs": [
            {"id": p["id"], "index": i, "chapterId": p["chapterId"], "chapterTitle": "One", "sectionId": None, "text": p["text"], "sourceIndex": i}
            for i, p in enumerate(PARAGRAPHS)
        ],
    }
    path = guide.canonical_manuscript.manuscript_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


class FakeModel:
    """Stands in for ``GLiNER``: answers each text with the spans ``answer`` gives, and records what it was asked."""

    def __init__(self, answer=None):
        self.answer = answer or (lambda text: [])
        self.calls: list[tuple[str, list[str], float]] = []

    def predict_entities(self, text, labels, threshold=0.5):
        self.calls.append((text, list(labels), threshold))
        return self.answer(text)


def dawnspire(text: str) -> list[dict]:
    spans = []
    for name, label, score in (
        ("Arelian", "character", 0.93),
        ("Council of Ash", "group", 0.81),
        ("Dawnspire", "place", 0.88),
        ("grey mare", "object", 0.62),
    ):
        if name in text:
            spans.append(span(text, name, label, score))
    return spans


def source_with(model, install: Path | None = None) -> "gliner.GlinerSource":
    folder = install or _complete_install(Path(tempfile.mkdtemp()))
    return gliner.GlinerSource(folder, loader=lambda path: model)


def _complete_install(root: Path) -> Path:
    """An install folder with every file the adapter checks for, and fake ``gliner`` and ``transformers`` packages in their wheel
    folders. The fake GLiNER asks ``AutoConfig`` for its encoder by name, as the real one does."""
    root.mkdir(parents=True, exist_ok=True)
    for name in gliner.REQUIRED_FILES:
        (root / name).write_text("{}", encoding="utf-8")
    package = root / "wheel-gliner" / "gliner"
    package.mkdir(parents=True)
    (package / "__init__.py").write_text(
        textwrap.dedent(
            """
            LOADED = []

            ENCODERS = []

            class GLiNER:
                @classmethod
                def from_pretrained(cls, path, **options):
                    from transformers import AutoConfig

                    LOADED.append((path, options))
                    ENCODERS.append(AutoConfig.from_pretrained("microsoft/deberta-v3-small"))
                    return cls()

                def predict_entities(self, text, labels, threshold=0.5):
                    return []
            """
        ),
        encoding="utf-8",
    )
    transformers = root / "wheel-transformers" / "transformers"
    transformers.mkdir(parents=True)
    (transformers / "__init__.py").write_text(
        textwrap.dedent(
            """
            import os


            class AutoConfig:
                # A name that is not a folder is a Hugging Face repository: the real class would fetch it, so the fake
                # refuses it as the network a test must never reach.
                @classmethod
                def from_pretrained(cls, name, *args, **options):
                    if not os.path.isdir(str(name)):
                        raise OSError(f"would fetch {name} from the Hugging Face hub")
                    return (str(name), options)
            """
        ),
        encoding="utf-8",
    )
    info = root / "wheel-gliner" / "gliner-0.2.29.dist-info"
    info.mkdir()
    (info / "METADATA").write_text("Metadata-Version: 2.1\nName: gliner\nVersion: 0.2.29\n", encoding="utf-8")
    return root


@contextlib.contextmanager
def _forget_gliner():
    """Imports of the fake ``gliner`` package and the ``sys.path`` entries the loader added are undone afterwards."""
    path, modules = list(sys.path), set(sys.modules)
    try:
        yield
    finally:
        sys.path[:] = path
        for name in set(sys.modules) - modules:
            if name in ("gliner", "transformers") or name.startswith(("gliner.", "transformers.")):
                del sys.modules[name]


class CandidateNamesOnlyTests(unittest.TestCase):
    def test_gliner_offers_entry_suggestions_with_a_type_and_a_quote_and_nothing_else(self):
        raws = source_with(FakeModel(dawnspire)).extractor().extract(BOOK)

        self.assertEqual({"entry"}, {raw["payload"]["kind"] for raw in raws})
        by_name = {raw["payload"]["name"]: raw for raw in raws}
        self.assertEqual({"Arelian", "Council of Ash", "Dawnspire", "grey mare"}, set(by_name))
        self.assertEqual("Character", by_name["Arelian"]["payload"]["type"])
        self.assertEqual("Organization", by_name["Council of Ash"]["payload"]["type"])
        self.assertEqual("Place", by_name["Dawnspire"]["payload"]["type"])
        self.assertEqual("Item", by_name["grey mare"]["payload"]["type"])
        for raw in raws:
            self.assertEqual([], raw["payload"]["aliases"], "GLiNER does not group names; aliases are BookNLP's")
            self.assertEqual(1, len(raw["quotes"]))
            self.assertIn(raw["payload"]["name"], raw["quotes"][0]["text"])

    def test_a_name_found_twice_is_offered_once_from_its_first_paragraph(self):
        raws = source_with(FakeModel(dawnspire)).extractor().extract(BOOK)

        dawnspires = [raw for raw in raws if raw["payload"]["name"] == "Dawnspire"]
        self.assertEqual(1, len(dawnspires))
        self.assertEqual("p-000001", dawnspires[0]["quotes"][0]["paragraphId"])
        self.assertEqual("c-0001", dawnspires[0]["chapterId"])

    def test_the_cli_prints_each_suggestion_as_a_json_line_under_its_own_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manuscript = _write_manuscript(root)
            install = _complete_install(root / "gliner")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                gliner.suggest(argparse.Namespace(manuscript=str(manuscript), install=str(install)), loader=lambda path: FakeModel(dawnspire))

        lines = [json.loads(line) for line in out.getvalue().splitlines()]
        self.assertEqual(4, len(lines))
        self.assertEqual({GLINER}, {line["source"] for line in lines})


class LabelsAreDataTests(unittest.TestCase):
    def test_the_labels_the_model_is_asked_for_are_the_tables_keys(self):
        model = FakeModel()
        source_with(model).extractor().extract(BOOK)

        self.assertEqual(list(gliner.LABELS), model.calls[0][1])

    def test_every_label_maps_to_a_story_bible_category(self):
        self.assertEqual({"Character", "Place", "Item", "Organization"}, set(gliner.LABELS.values()))
        self.assertLessEqual(set(gliner.LABELS.values()), guide.VALID_CATEGORIES)

    def test_a_label_outside_the_table_is_dropped(self):
        model = FakeModel(lambda text: [span(text, "Arelian", "person", 0.9)] if "Arelian" in text else [])

        self.assertEqual([], source_with(model).extractor().extract(BOOK))

    def test_the_dispatch_names_the_source_and_nothing_of_the_label_set(self):
        dispatch = (CORE / "manuscript_guide.py").read_text(encoding="utf-8")

        self.assertNotIn('"character"', dispatch)
        self.assertNotIn('Organization": ', dispatch)
        self.assertIn("extraction_gliner", dispatch)


class ConfidenceIsTheModelsOwnTests(unittest.TestCase):
    def test_the_score_passes_through_unchanged(self):
        model = FakeModel(lambda text: [span(text, "Arelian", "character", 0.7312)] if "Captain" in text else [])

        (raw,) = source_with(model).extractor().extract(BOOK)

        self.assertEqual(0.7312, raw["confidence"])

    def test_a_span_under_the_floor_is_dropped_and_the_floor_is_asked_of_the_model(self):
        below = gliner.SCORE_FLOOR - 0.01
        model = FakeModel(lambda text: [span(text, "Arelian", "character", below)] if "Captain" in text else [])

        self.assertEqual([], source_with(model).extractor().extract(BOOK))
        self.assertEqual(gliner.SCORE_FLOOR, model.calls[0][2])

    def test_the_floor_is_a_constant_with_its_reason(self):
        self.assertTrue(0 < gliner.SCORE_FLOOR < 1)
        source = (CORE / "extraction_gliner.py").read_text(encoding="utf-8")
        line = source.index("SCORE_FLOOR =")
        self.assertIn("#", source[source.rindex("\n\n", 0, line) : line], "the floor needs its reason in a comment above it")

    def test_of_two_spans_of_one_name_the_higher_score_is_kept_with_its_own_quote(self):
        def answer(text):
            if "Captain" in text:
                return [span(text, "Arelian", "character", 0.6)]
            return [span(text, "Arelian", "character", 0.9)]

        (raw,) = source_with(FakeModel(answer)).extractor().extract(BOOK)

        self.assertEqual(0.9, raw["confidence"])
        self.assertEqual("p-000002", raw["quotes"][0]["paragraphId"])


class NilConfidenceStaysNilTests(unittest.TestCase):
    def test_a_span_with_no_score_is_offered_with_null(self):
        model = FakeModel(lambda text: [span(text, "Arelian", "character", None)] if "Captain" in text else [])

        (raw,) = source_with(model).extractor().extract(BOOK)

        self.assertIsNone(raw["confidence"])
        self.assertIn("confidence", raw)


class QuotesAreVerbatimTests(unittest.TestCase):
    def test_every_quote_is_a_substring_of_its_paragraph(self):
        raws = source_with(FakeModel(dawnspire)).extractor().extract(BOOK)
        text = {paragraph["id"]: paragraph["text"] for paragraph in PARAGRAPHS}

        for raw in raws:
            for quote in raw["quotes"]:
                self.assertIn(quote["text"], text[quote["paragraphId"]])

    def test_a_span_whose_text_is_not_at_its_offsets_is_dropped_with_a_log_line(self):
        def answer(text):
            if "Captain" not in text:
                return []
            return [{"start": 0, "end": 7, "text": "Arelian", "label": "character", "score": 0.9}]

        logged: list[str] = []
        source = gliner.GlinerSource(_complete_install(Path(tempfile.mkdtemp())), loader=lambda path: FakeModel(answer), log=logged.append)

        self.assertEqual([], source.extractor().extract(BOOK))
        self.assertEqual(1, len(logged))
        self.assertIn("Arelian", logged[0])

    def test_a_long_paragraph_is_read_in_chunks_whose_offsets_land_in_the_paragraph(self):
        words = ["word"] * (gliner.CHUNK_WORDS * 2) + ["Arelian", "rode", "on."]
        long = {"id": "p-000009", "chapterId": "c-0002", "text": " ".join(words)}
        model = FakeModel(lambda text: [span(text, "Arelian", "character", 0.9)] if "Arelian" in text else [])

        (raw,) = source_with(model).extractor().extract({"paragraphs": [long]})

        self.assertGreater(len(model.calls), 1)
        self.assertIn(raw["quotes"][0]["text"], long["text"])
        self.assertIn("Arelian", raw["quotes"][0]["text"])


class ConformanceTests(unittest.TestCase):
    def test_the_gliner_row_passes_the_ports_conformance_suite(self):
        extraction_conformance.run(source_with(FakeModel(lambda text: [span(text, "Alice", "character", 0.9)] if "Alice" in text else [])))

    def test_an_uninstalled_row_passes_it_too(self):
        extraction_conformance.run(gliner.GlinerSource(None))

    def test_the_descriptor_is_the_ports_gliner_row(self):
        self.assertIs(next(row for row in BUILT_IN if row.name == GLINER), gliner.GlinerSource(None).descriptor)
        self.assertEqual(("name",), KINDS["entry"])

    def test_the_suggest_lines_match_the_committed_contract_file(self):
        model = FakeModel(dawnspire)
        lines = [gliner.line(raw) for raw in source_with(model).extractor().extract(BOOK)]
        lines.append(
            gliner.line(
                source_with(FakeModel(lambda text: [span(text, "Arelian", "character", None)] if "Captain" in text else [])).extractor().extract(BOOK)[0]
            )
        )

        testdata = REPO / "src" / "studio" / "desktop" / "internal" / "extractionport" / "gliner" / "testdata"
        contract_files.check("suggest-lines", lines, testdata)


def chapter_book(chapters: int, per_chapter: int, words: int = 40) -> list[dict]:
    """``chapters`` chapters of ``per_chapter`` paragraphs, each ``words`` words ending in a name the fake model finds."""
    out = []
    for c in range(chapters):
        for n in range(per_chapter):
            out.append({"id": f"p-{c:02d}{n:02d}", "chapterId": f"c-{c:04d}", "text": " ".join(["word"] * words) + f" Arelian{c} Zoë Ångström Łukasz."})
    return out


def accented(text: str) -> list[dict]:
    spans = []
    for at, (name, score) in enumerate((("Zoë Ångström", 0.9), ("Łukasz", 0.7))):
        if name in text:
            spans.append(span(text, name, "character", score + (len(text) % 7) / 100))
    for c in range(40):
        name = f"Arelian{c}"
        if name in text:
            spans.append(span(text, name, "character", 0.8))
    return spans


class ChapterPoolTests(unittest.TestCase):
    def pool(self, workers: int):
        from concurrent.futures import ThreadPoolExecutor

        return ThreadPoolExecutor(workers)

    def reader(self, fail: set[str] | None = None):
        extractor = gliner.GlinerExtractor(FakeModel(accented), lambda line: None)

        def read(chunk):
            if fail and chunk[0]["chapterId"] in fail:
                raise RuntimeError("worker died")
            return extractor.extract({"paragraphs": chunk})

        return read

    def test_chunks_are_chapters_and_a_long_chapter_is_cut_between_paragraphs(self):
        book = chapter_book(3, 5, words=400)
        chunks = gliner.chunks_of(book, max_words=1000)
        self.assertEqual(book, [p for chunk in chunks for p in chunk], "no paragraph lost, none reordered")
        self.assertTrue(all(len({p["chapterId"] for p in chunk}) == 1 for chunk in chunks), "a chunk never spans two chapters")
        self.assertEqual([2, 2, 1] * 3, [len(chunk) for chunk in chunks])

    def test_reading_chapters_side_by_side_gives_the_whole_book_result_with_accented_names(self):
        book = chapter_book(6, 4)
        whole = gliner.GlinerExtractor(FakeModel(accented), lambda line: None).extract({"paragraphs": book})
        lines: list[str] = []
        pooled = gliner.read_chunks(book, 3, self.pool, self.reader(), lines.append)
        self.assertEqual(whole, pooled)
        self.assertIn("Zoë Ångström", [raw["payload"]["name"] for raw in pooled])
        self.assertIn("Łukasz", [raw["payload"]["name"] for raw in pooled])
        text = "\n".join(json.dumps(gliner.line(raw), ensure_ascii=False) for raw in pooled)
        self.assertIn("Zoë Ångström", text)

    def test_a_chunk_that_fails_is_reported_and_the_others_are_kept(self):
        book = chapter_book(4, 2)
        lines: list[str] = []
        pooled = gliner.read_chunks(book, 2, self.pool, self.reader(fail={"c-0001"}), lines.append)
        names = {raw["payload"]["name"] for raw in pooled}
        self.assertIn("Arelian0", names)
        self.assertNotIn("Arelian1", names)
        self.assertIn("Arelian3", names)
        last = json.loads(lines[-1])["progress"]
        self.assertEqual({"done": 4, "total": 4, "failed": ["c-0001"]}, last)
        self.assertEqual([1, 2, 3, 4], [json.loads(line)["progress"]["done"] for line in lines])

    def test_when_every_chunk_fails_the_scan_fails_with_the_reason(self):
        book = chapter_book(2, 1)
        with self.assertRaisesRegex(ValueError, "worker died"):
            gliner.read_chunks(book, 2, self.pool, self.reader(fail={"c-0000", "c-0001"}), lambda text: None)

    def test_the_progress_record_is_pinned_by_the_committed_contract_file(self):
        records = [json.loads(gliner.progress_line(1, 3, [])), json.loads(gliner.progress_line(3, 3, ["c-0002"]))]
        testdata = REPO / "src" / "studio" / "desktop" / "internal" / "extractionport" / "gliner" / "testdata"
        contract_files.check("suggest-progress", records, testdata)


class ThreadBudgetTests(unittest.TestCase):
    """Two sources reading at once share the processors: the host names how many torch threads each may use."""

    def threads_set(self, threads: int) -> list[int]:
        import types

        calls: list[int] = []
        saved = sys.modules.get("torch")
        sys.modules["torch"] = types.SimpleNamespace(set_num_threads=calls.append)  # type: ignore[assignment]
        try:
            root = Path(tempfile.mkdtemp())
            args = argparse.Namespace(manuscript=str(_write_manuscript(root)), install=str(_complete_install(root / "install")), workers=1, threads=threads)
            with contextlib.redirect_stdout(io.StringIO()):
                gliner.suggest(args, loader=lambda path: FakeModel(dawnspire))
        finally:
            if saved is None:
                del sys.modules["torch"]
            else:
                sys.modules["torch"] = saved
        return calls

    def test_threads_limit_torch_after_the_model_loads(self):
        self.assertEqual([2], self.threads_set(2))

    def test_no_budget_leaves_torch_alone(self):
        self.assertEqual([], self.threads_set(0))


class NoNetworkAtRunTimeTests(unittest.TestCase):
    def test_the_module_imports_no_http_client_and_no_socket(self):
        text = (CORE / "extraction_gliner.py").read_text(encoding="utf-8")
        for module in ("socket", "http", "urllib", "requests", "httpx", "aiohttp", "huggingface_hub"):
            self.assertNotRegex(text, rf"^\s*(import|from)\s+{module}\b", module)

    def test_loading_and_extracting_open_no_socket(self):
        def refuse(*args, **kwargs):
            raise AssertionError("the adapter opened a socket")

        install = _complete_install(Path(tempfile.mkdtemp()))
        original = socket.socket
        socket.socket = refuse
        try:
            with _forget_gliner():
                gliner.GlinerSource(install).extractor().extract(BOOK)
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
            with _forget_gliner():
                gliner.load_model(install)
                loaded = sys.modules["gliner"].LOADED
        finally:
            watching[0] = False

        self.assertEqual([(str(install), {"local_files_only": True})], loaded)
        self.assertTrue(opened, "the fake package was imported, so something was opened")
        for path in opened:
            self.assertTrue(Path(path).resolve().is_relative_to(install), f"{path} is outside the install folder")

    def test_the_encoder_gliner_names_is_read_from_the_install_folder_and_the_loader_is_put_back(self):
        install = _complete_install(Path(tempfile.mkdtemp()))
        with _forget_gliner():
            gliner.load_model(install)
            encoders = sys.modules["gliner"].ENCODERS
            restored = sys.modules["transformers"].AutoConfig

        self.assertEqual([(str(install), {"local_files_only": True})], encoders)
        with self.assertRaisesRegex(OSError, "hub"):
            restored.from_pretrained(gliner.ENCODER)  # put back once GLiNER is loaded: the encoder name means the hub again

    def test_the_encoder_lookup_reaches_no_hub_and_no_socket(self):
        def refuse(*args, **kwargs):
            raise AssertionError("the adapter opened a socket")

        install = _complete_install(Path(tempfile.mkdtemp()))
        original = socket.socket
        socket.socket = refuse
        try:
            with _forget_gliner():
                gliner.load_model(install)  # the fake GLiNER asks for the encoder by its hub name, which fails if it is not answered locally
        finally:
            socket.socket = original

    def test_the_encoder_files_are_required_under_their_hugging_face_names(self):
        for name in ("config.json", "spm.model", "tokenizer_config.json"):
            self.assertIn(name, gliner.REQUIRED_FILES)
            install = _complete_install(Path(tempfile.mkdtemp()))
            (install / name).unlink()
            self.assertIn(name, gliner.damage(install))

    def test_the_loader_asks_huggingface_to_stay_offline(self):
        with _forget_gliner():
            gliner.load_model(_complete_install(Path(tempfile.mkdtemp())))
        self.assertEqual("1", os.environ.get("HF_HUB_OFFLINE"))
        self.assertEqual("1", os.environ.get("TRANSFORMERS_OFFLINE"))

    def test_a_missing_install_is_a_sentence(self):
        for install in (None, Path(tempfile.mkdtemp()) / "nowhere"):
            availability = gliner.GlinerSource(install).available()
            self.assertFalse(availability.ok)
            self.assertEqual("GLiNER is not downloaded.", availability.reason)
            with self.assertRaises(NotSupportedError) as refused:
                gliner.GlinerSource(install).extractor()
            self.assertEqual("GLiNER is not downloaded.", refused.exception.message)

    def test_a_damaged_install_is_a_sentence_naming_the_missing_file(self):
        install = _complete_install(Path(tempfile.mkdtemp()))
        (install / "pytorch_model.bin").unlink()

        availability = gliner.GlinerSource(install).available()

        self.assertFalse(availability.ok)
        self.assertIn("pytorch_model.bin", availability.reason)
        self.assertTrue(availability.reason.endswith("."))

    def test_a_package_that_will_not_import_is_a_sentence_not_a_traceback(self):
        install = _complete_install(Path(tempfile.mkdtemp()))
        (install / "wheel-gliner" / "gliner" / "__init__.py").write_text("raise ImportError('no torch')\n", encoding="utf-8")

        with _forget_gliner(), self.assertRaises(NotSupportedError) as refused:
            gliner.GlinerSource(install).extractor()

        self.assertIn("GLiNER could not be loaded", refused.exception.message)
        self.assertIn("no torch", refused.exception.message)

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
                    "gliner",
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
                env={**os.environ, "PYTHONPATH": os.pathsep.join([str(REPO / "src" / "studio" / "libs" / "python"), str(CORE)])},
                timeout=120,
            )

        self.assertEqual(1, result.returncode)
        self.assertEqual("", result.stdout)
        self.assertNotIn("Traceback", result.stderr)
        self.assertIn("GLiNER is not downloaded.", result.stderr.strip().splitlines()[-1])


class PackagedSmokeCheckTests(unittest.TestCase):
    def test_self_check_reports_the_package_version_when_installed(self):
        install = _complete_install(Path(tempfile.mkdtemp()))

        result = gliner.self_check(install)

        self.assertEqual({"name": "gliner", "ok": True, "detail": "gliner 0.2.29"}, result)

    def test_self_check_reports_not_installed_and_passes_without_an_install(self):
        for install in (None, Path(tempfile.mkdtemp()) / "nowhere"):
            self.assertEqual({"name": "gliner", "ok": True, "detail": "not installed"}, gliner.self_check(install))

    def test_self_check_fails_a_damaged_install(self):
        install = _complete_install(Path(tempfile.mkdtemp()))
        (install / "gliner_config.json").unlink()

        result = gliner.self_check(install)

        self.assertFalse(result["ok"])
        self.assertIn("gliner_config.json", result["detail"])

    def test_the_sidecars_self_check_reports_the_folder_it_is_given_and_passes_when_nothing_is_there(self):
        results = guide.run_self_check(gliner_install=str(Path(tempfile.mkdtemp()) / "nowhere"))
        line = next(entry for entry in results if entry["name"] == "gliner")
        self.assertEqual({"name": "gliner", "ok": True, "detail": "not installed"}, line)

    def test_the_cli_passes_the_install_folder_to_the_self_check(self):
        install = _complete_install(Path(tempfile.mkdtemp()))
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.suppress(SystemExit):
            guide.self_check(argparse.Namespace(piper_model="", gliner_install=str(install)))
        report = json.loads(out.getvalue())
        self.assertIn({"name": "gliner", "ok": True, "detail": "gliner 0.2.29"}, report["checks"])


if __name__ == "__main__":
    unittest.main()
