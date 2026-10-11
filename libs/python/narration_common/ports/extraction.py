"""The extraction port (ADR 0301): what every Story Bible extraction source is to its callers.

A source has one role, ``extract``: ``extractor()`` gives an object whose ``extract(book)`` looks at the manuscript (and, for
an imported file, its text) and offers ``RawSuggestion``s: a payload, a confidence or ``None``, the quotes behind it, and an
optional ``duplicate`` flag with a note. A raw suggestion has no key for an offset, a status or a fingerprint; the host
computes those from the manuscript. A source whose descriptor is not ``scored`` gives ``None`` for every confidence.

``available()`` says whether the source can run now, with a sentence for the narrator when it cannot; an unavailable source's
``extractor()`` raises ``descriptor.unavailable(reason)`` and starts nothing. A source raises ``descriptor.refuse(mode)`` for a
role it does not declare. Callers look a source up in ``SOURCES`` by the name a suggestion stores and never compare names; a
scan runs ``SOURCES.fallback_order()``.

``BUILT_IN`` are the five sources' descriptors, in the host's order (``internal/extractionport``); the adapters register under
them. Nothing here imports a model.
"""

from dataclasses import dataclass, field
from typing import NotRequired, Protocol, TypedDict

from .registry import Descriptor, Level, NotSupportedError, Registry

EXTRACT = "extract"
MODES = (EXTRACT,)

RULES = "rules"
IMPORTED = "imported"
LOCAL_MODEL = "local-model"
GLINER = "gliner"
BOOKNLP = "booknlp"

# What a payload offers, and the keys each kind needs filled in (the mock's Payload union).
KINDS = {
    "entry": ("name",),
    "alias": ("entry", "alias"),
    "property": ("entry", "key", "value"),
    "relationship": ("entry", "to", "relation"),
    "claim": ("entry", "claim", "text"),
    "speaker": ("quote", "speaker"),
}
CLAIMS = ("talk", "act", "know")
FLAG_DUPLICATE = "duplicate"

LOCAL_MODEL_REASON = "No local model is installed."

_ROLE_SENTENCES = {EXTRACT: "look for suggestions"}


class Quote(TypedDict):
    """A stretch of the manuscript behind a suggestion. ``paragraphId`` is a hint; ``text`` is what is searched for."""

    paragraphId: NotRequired[str]
    text: str


class RawSuggestion(TypedDict):
    """What a source offers: no id, no offsets, no status. ``confidence`` is 0..1, or ``None`` when the source gave none."""

    payload: dict
    confidence: float | None
    quotes: list[Quote]
    chapterId: NotRequired[str]
    flag: NotRequired[str]
    note: NotRequired[str]


class Paragraph(TypedDict):
    """One paragraph of the manuscript as a source reads it."""

    id: str
    chapterId: str
    text: str


class Book(TypedDict):
    """What a source looks at: the paragraphs and, for an imported file, its text."""

    paragraphs: list[Paragraph]
    text: NotRequired[str]


@dataclass(frozen=True)
class Availability:
    """Whether a source can run now; ``reason`` is a sentence for the narrator when it cannot."""

    ok: bool
    reason: str = ""

    def __post_init__(self) -> None:
        if self.ok and self.reason:
            raise ValueError("an available source gives no reason")
        if not self.ok and not self.reason.strip():
            raise ValueError("an unavailable source needs a reason for the narrator")


AVAILABLE = Availability(True)


@dataclass(frozen=True)
class ExtractionDescriptor(Descriptor):
    """An extraction source's row: its icon, whether the narrator can start it from the Story Bible (``runs``), the asset
    ids it runs from (any one is enough), and whether it gives a confidence at all (``scored``)."""

    icon: str = ""
    runs: bool = True
    assets: tuple[str, ...] = field(default=())
    scored: bool = True

    def __post_init__(self) -> None:
        super().__post_init__()
        object.__setattr__(self, "assets", tuple(self.assets))
        if EXTRACT not in self.modes:
            raise ValueError(f"extraction source {self.name!r} must declare {EXTRACT}")
        for mode in self.modes:
            if mode not in MODES:
                raise ValueError(f"extraction source {self.name!r}: {mode!r} is not one of {', '.join(MODES)}")
        if not self.icon.strip():
            raise ValueError(f"extraction source {self.name!r} needs an icon")
        for asset in self.assets:
            if not asset.strip():
                raise ValueError(f"extraction source {self.name!r} lists a blank asset id")
            if self.assets.count(asset) > 1:
                raise ValueError(f"extraction source {self.name!r} lists the asset {asset!r} twice")

    def refuse(self, mode: str) -> NotSupportedError:
        """The refusal a source raises when asked for a role it does not declare."""
        return NotSupportedError(self.name, Level.Unsupported, f"{self.label} cannot {_ROLE_SENTENCES.get(mode, mode)}.")

    def unavailable(self, reason: str) -> NotSupportedError:
        """The refusal an unavailable source's ``extractor()`` raises, carrying its ``available()`` reason."""
        return NotSupportedError(self.name, Level.NotYetAvailable, reason)


class Extractor(Protocol):
    """The extract role. ``extract`` never writes the Story Bible and returns a new list each call."""

    def extract(self, book: Book) -> list[RawSuggestion]:
        """The raw suggestions the source finds in ``book``."""
        ...


class ExtractionSource(Protocol):
    """One extraction source."""

    descriptor: ExtractionDescriptor

    def available(self) -> Availability:
        """Whether the source can run now, with its reason when it cannot. It starts nothing."""
        ...

    def extractor(self) -> Extractor:
        """The extract role; raises ``descriptor.unavailable(reason)`` when the source cannot run."""
        ...


class SourceRegistry(Registry[ExtractionSource]):
    """The extraction sources, with the order a scan runs them in."""

    def fallback_order(self, platform: str | None = None) -> list[str]:
        """Every source the narrator can start from the Story Bible (and runs on ``platform``), in registration order."""
        return [name for name in self.names(platform, EXTRACT) if self.lookup(name).descriptor.runs]


BUILT_IN = (
    ExtractionDescriptor(RULES, "Rules", modes=(EXTRACT,), icon="auto"),
    ExtractionDescriptor(IMPORTED, "Imported file", modes=(EXTRACT,), icon="import", runs=False),
    ExtractionDescriptor(LOCAL_MODEL, "Local model", modes=(EXTRACT,), icon="globe", scored=False),
    ExtractionDescriptor(GLINER, "GLiNER", modes=(EXTRACT,), icon="locate", assets=("gliner",)),
    ExtractionDescriptor(BOOKNLP, "BookNLP", modes=(EXTRACT,), icon="dictionary", assets=("booknlp-small", "booknlp-big")),
)

# Filled by the adapters when they are imported, rules first: the first registered is the default.
SOURCES = SourceRegistry("extraction source")
