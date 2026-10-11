"""The extraction port: its descriptor, its one role, the five built-in sources, agreement with Go and its conformance suite."""

import ast
from pathlib import Path

import pytest
from narration_common.ports import Descriptor, Level, NotSupportedError, Registry, conformance, extraction, extraction_conformance
from narration_common.ports.extraction import (
    AVAILABLE,
    BUILT_IN,
    EXTRACT,
    LOCAL_MODEL_REASON,
    SOURCES,
    Availability,
    ExtractionDescriptor,
    SourceRegistry,
)

DOCS = Path(__file__).resolve().parents[3] / "docs" / "architecture" / "provider-ports.md"

# --- the fakes ------------------------------------------------------------------------------------------------------------------


def dodo(confidence=0.91):
    return {
        "payload": {"kind": "entry", "name": "The Dodo", "type": "Character", "aliases": ["Dodo"], "description": "", "appearsIn": []},
        "confidence": confidence,
        "quotes": [{"paragraphId": "3-4", "text": "Then the Dodo solemnly presented the thimble"}],
    }


PIGEON = {
    "payload": {"kind": "alias", "entry": "The Pigeon", "alias": "Pigeon"},
    "confidence": 0.5,
    "quotes": [{"text": "said the Pigeon"}],
    "flag": "duplicate",
    "note": "Possible duplicate of Pigeon.",
}


class FakeExtractor:
    def __init__(self, raws):
        self.raws = raws

    def extract(self, book):
        return [dict(raw) if isinstance(raw, dict) else raw for raw in self.raws]


class FakeSource:
    """A test-only source that implements the port by shape alone: no base class, as a real adapter will."""

    def __init__(self, descriptor: ExtractionDescriptor, raws=None, availability: Availability = AVAILABLE):
        self.descriptor = descriptor
        self.raws = [dodo(), dodo(None), PIGEON] if raws is None else raws
        self.availability = availability

    def available(self) -> Availability:
        return self.availability

    def extractor(self) -> FakeExtractor:
        if not self.availability.ok:
            raise self.descriptor.unavailable(self.availability.reason)
        return FakeExtractor(self.raws)


SCORED = ExtractionDescriptor("fake", "Fake", modes=(EXTRACT,), icon="list")
UNSCORED = ExtractionDescriptor("fake-unscored", "Fake unscored", modes=(EXTRACT,), icon="list", scored=False)


def _fails(source, complaint: str) -> None:
    with pytest.raises(conformance.ConformanceError, match=complaint):
        extraction_conformance.run(source)


# --- the port itself ------------------------------------------------------------------------------------------------------------


def test_the_port_imports_no_model_and_nothing_that_fetches():
    sources = (Path(extraction.__file__).read_text(encoding="utf-8"), Path(extraction_conformance.__file__).read_text(encoding="utf-8"))
    modules = {
        (node.module or "") if isinstance(node, ast.ImportFrom) else alias.name
        for text in sources
        for node in ast.walk(ast.parse(text))
        if isinstance(node, ast.Import | ast.ImportFrom)
        for alias in node.names
    }

    banned = {"gliner", "booknlp", "torch", "transformers", "spacy", "requests", "httpx", "socket", "http", "urllib"}
    assert not {m for m in modules if m.split(".")[0] in banned}


def test_the_sources_registry_speaks_of_extraction_sources_and_starts_empty():
    """The adapters fill it at import; the port itself registers nothing."""
    assert isinstance(SOURCES, SourceRegistry) and isinstance(SOURCES, Registry)
    assert SOURCES.kind == "extraction source" and len(SOURCES) == 0


def test_the_five_sources_are_built_in_in_order_with_rules_the_default():
    rows = [(d.name, d.label, d.icon, d.runs, d.assets) for d in BUILT_IN]

    assert rows == [
        ("rules", "Rules", "auto", True, ()),
        ("imported", "Imported file", "import", False, ()),
        ("local-model", "Local model", "globe", True, ()),
        ("gliner", "GLiNER", "locate", True, ("gliner",)),
        ("booknlp", "BookNLP", "dictionary", True, ("booknlp-small", "booknlp-big")),
    ]
    assert all(d.modes == (EXTRACT,) for d in BUILT_IN)
    sources = SourceRegistry("extraction source")
    for descriptor in BUILT_IN:
        sources.register(FakeSource(descriptor))
    assert sources.default() == "rules"


def test_the_fallback_order_is_every_source_the_narrator_can_start_in_registration_order():
    sources = SourceRegistry("extraction source")
    for descriptor in BUILT_IN:
        sources.register(FakeSource(descriptor))
    sources.register(FakeSource(ExtractionDescriptor("win", "Windows only", platforms=("windows",), modes=(EXTRACT,), icon="list")))

    assert sources.fallback_order() == ["rules", "local-model", "gliner", "booknlp", "win"]
    assert sources.fallback_order("linux") == ["rules", "local-model", "gliner", "booknlp"]


def _docs_rows() -> list[list[str]]:
    _, _, section = DOCS.read_text(encoding="utf-8").partition("\n## Extraction sources\n")
    section, _, _ = section.partition("\n## ")
    return [[cell.strip() for cell in line.split("|")[1:6]] for line in section.splitlines() if line.startswith("| `")]


def test_the_built_in_sources_match_the_docs_table_the_go_registry_is_checked_against():
    """Half of the Go-Python agreement: internal/extractionport's test reads the same table."""
    code = [[f"`{d.name}`", d.label, f"`{d.icon}`", "yes" if d.runs else "no", ", ".join(f"`{a}`" for a in d.assets) or "none"] for d in BUILT_IN]

    assert _docs_rows() == code


# --- the descriptor -------------------------------------------------------------------------------------------------------------


def test_extraction_descriptor_is_a_descriptor_with_an_icon_runs_assets_and_scored():
    gliner = BUILT_IN[3]

    assert isinstance(gliner, Descriptor)
    assert (gliner.icon, gliner.runs, gliner.assets, gliner.scored) == ("locate", True, ("gliner",), True)
    assert ExtractionDescriptor("x", "X", modes=[EXTRACT], icon="list", assets=["a"]).assets == ("a",)


@pytest.mark.parametrize(
    ("kwargs", "complaint"),
    [
        ({"modes": ()}, "must declare extract"),
        ({"modes": (EXTRACT, "progress")}, "'progress' is not one of extract"),
        ({"modes": (EXTRACT,), "icon": " "}, "needs an icon"),
        ({"modes": (EXTRACT,), "icon": "list", "assets": ("",)}, "blank asset"),
        ({"modes": (EXTRACT,), "icon": "list", "assets": ("gliner", "gliner")}, "'gliner' twice"),
    ],
)
def test_extraction_descriptor_refuses_a_malformed_row(kwargs, complaint):
    with pytest.raises(ValueError, match=complaint):
        ExtractionDescriptor("x", "X", **kwargs)


def test_refuse_and_unavailable_name_the_source_in_a_sentence():
    refusal = SCORED.refuse(EXTRACT)
    assert isinstance(refusal, NotSupportedError)
    assert (refusal.name, refusal.level, str(refusal)) == ("fake", Level.Unsupported, "Fake cannot look for suggestions.")

    local = BUILT_IN[2].unavailable(LOCAL_MODEL_REASON)
    assert (local.name, local.level, str(local)) == ("local-model", Level.NotYetAvailable, "No local model is installed.")


def test_availability_is_ok_with_no_reason_or_not_ok_with_one():
    assert AVAILABLE.ok and AVAILABLE.reason == ""
    with pytest.raises(ValueError, match="no reason"):
        Availability(True, "Ready.")
    with pytest.raises(ValueError, match="needs a reason"):
        Availability(False, " ")


# --- the conformance suite: sources that pass -----------------------------------------------------------------------------------


def test_a_scored_source_passes_with_and_without_a_score_on_an_item():
    extraction_conformance.run(FakeSource(SCORED))


def test_a_source_with_no_score_passes_by_giving_none():
    extraction_conformance.run(FakeSource(UNSCORED, raws=[dodo(None)]))


def test_the_local_model_passes_by_refusing_with_its_reason_and_starting_nothing():
    extraction_conformance.run(FakeSource(BUILT_IN[2], availability=Availability(False, LOCAL_MODEL_REASON)))


def test_the_suite_runs_over_a_registry_of_fakes_without_editing_a_call_site():
    sources = SourceRegistry("extraction source")
    for descriptor in (*BUILT_IN, SCORED):
        sources.register(FakeSource(descriptor, raws=[dodo(None)]))

    conformance.run_over_registry(sources, extraction_conformance.run)


# --- the conformance suite: sources that fail -----------------------------------------------------------------------------------


def test_a_plain_descriptor_is_not_enough():
    _fails(FakeSource(Descriptor("plain", "Plain", modes=(EXTRACT,))), "ExtractionDescriptor")  # type: ignore[arg-type]


def test_a_source_with_no_score_that_makes_one_up_fails():
    _fails(FakeSource(UNSCORED, raws=[dodo(0.8)]), "made-up number 0.8")


@pytest.mark.parametrize(
    ("raw", "complaint"),
    [
        ("Dodo", "not a dict"),
        ({**dodo(), "start": 4, "end": 9}, "sets end, start"),
        ({**dodo(), "status": "accepted-auto"}, "sets status"),
        ({**dodo(), "payload": {"kind": "theme"}}, "kind 'theme'"),
        ({**dodo(), "payload": {"kind": "entry", "name": " "}}, "entry payload needs name"),
        ({**PIGEON, "payload": {"kind": "alias", "entry": "The Pigeon"}}, "alias payload needs alias"),
        ({**dodo(), "payload": {"kind": "claim", "entry": "Alice", "claim": "feel", "text": "x"}}, "claim 'feel'"),
        ({**dodo(), "payload": {"kind": "speaker", "speaker": "Alice"}}, "speaker payload needs quote"),
        ({"payload": dodo()["payload"], "quotes": []}, "no confidence key"),
        (dodo(1.2), "not a number within 0..1"),
        (dodo(float("nan")), "not a number within 0..1"),
        (dodo(True), "not a number within 0..1"),
        (dodo("high"), "not a number within 0..1"),
        ({**dodo(), "quotes": "the Dodo"}, "not a list"),
        ({**dodo(), "quotes": [{"text": " "}]}, "quote 0 has no text"),
        ({**dodo(), "quotes": [{"text": "x", "start": 3}]}, "quote 0 has keys"),
        ({**dodo(), "flag": "maybe"}, "flag 'maybe'"),
        ({**dodo(), "note": 3}, "note is a int"),
    ],
)
def test_a_malformed_raw_suggestion_fails(raw, complaint):
    _fails(FakeSource(SCORED, raws=[raw]), complaint)


def test_an_unavailable_source_must_say_why_in_a_sentence():
    class Vague(FakeSource):
        def available(self):
            return Availability(False, "not downloaded")

    _fails(Vague(SCORED), "not a sentence")


def test_an_unavailable_source_that_starts_anyway_fails():
    class Eager(FakeSource):
        def extractor(self):
            return FakeExtractor(self.raws)

    _fails(Eager(SCORED, availability=Availability(False, "GLiNER is not downloaded.")), "instead of refusing")


def test_an_unavailable_source_must_refuse_with_its_own_reason():
    class Other(FakeSource):
        def extractor(self):
            raise self.descriptor.unavailable("Something else.")

    _fails(Other(SCORED, availability=Availability(False, "GLiNER is not downloaded.")), "its refusal was")


def test_a_source_whose_availability_changes_between_calls_fails():
    class Flipping(FakeSource):
        calls = 0

        def available(self):
            self.calls += 1
            return AVAILABLE if self.calls % 2 else Availability(False, "Gone.")

    _fails(Flipping(SCORED), "not static")


def test_a_source_that_raises_instead_of_extracting_fails():
    class Broken(FakeSource):
        def extractor(self):
            raise RuntimeError("model missing")

    _fails(Broken(SCORED), "declares extract, but it raised RuntimeError")


def test_an_extractor_that_gives_the_same_list_twice_fails():
    shared = [dodo()]

    class Sticky(FakeExtractor):
        def extract(self, book):
            return shared

    class Source(FakeSource):
        def extractor(self):
            return Sticky(shared)

    _fails(Source(SCORED), "same list twice")
