"""The extraction port's conformance suite (ADR 0301, Liskov): what every ``ExtractionSource`` must do, checked the same way.

``run(source)`` checks the descriptor and asks for the one role. An unavailable source must say why in a sentence, the same
each time, and its ``extractor()`` must refuse with that sentence. An available source's extractor must give a new list of
well-formed ``RawSuggestion``s for ``SAMPLE``: a known payload kind with the keys it needs, a confidence that is ``None`` or a
number within 0..1 (always ``None`` from a source that is not ``scored``), quotes with text, no flag but ``duplicate``, and no
key a source may not set (an offset, a status, a fingerprint). Real sources run it with their model faked where CI lacks it;
``conformance.run_over_registry(SOURCES, run)`` runs it over every row.
"""

import math
from typing import Any

from . import conformance
from .conformance import ConformanceError
from .extraction import CLAIMS, EXTRACT, FLAG_DUPLICATE, KINDS, Availability, Book, ExtractionDescriptor
from .registry import NotSupportedError

SAMPLE: Book = {"paragraphs": [{"id": "1-1", "chapterId": "1", "text": "Alice was beginning to get very tired of sitting by her sister on the bank."}]}

_RAW_KEYS = {"payload", "confidence", "quotes", "chapterId", "flag", "note"}
_QUOTE_KEYS = {"paragraphId", "text"}


def _filled(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def check_raw(raw: Any, *, scored: bool, where: str) -> None:
    """``raw`` is a well-formed ``RawSuggestion``; a source that is not ``scored`` gives no confidence."""
    if not isinstance(raw, dict):
        raise ConformanceError(f"{where} is a {type(raw).__name__}, not a dict")
    extra = set(raw) - _RAW_KEYS
    if extra:
        raise ConformanceError(f"{where} sets {', '.join(sorted(extra))}, which only the host computes or the port does not know")
    payload = raw.get("payload")
    if not isinstance(payload, dict) or payload.get("kind") not in KINDS:
        kind = payload.get("kind") if isinstance(payload, dict) else payload
        raise ConformanceError(f"{where} has the payload kind {kind!r}, not one of {', '.join(KINDS)}")
    for key in KINDS[payload["kind"]]:
        if not _filled(payload.get(key)):
            raise ConformanceError(f"{where}: a {payload['kind']} payload needs {key}")
    if payload["kind"] == "claim" and payload["claim"] not in CLAIMS:
        raise ConformanceError(f"{where}: the claim {payload['claim']!r} is not one of {', '.join(CLAIMS)}")

    if "confidence" not in raw:
        raise ConformanceError(f"{where} has no confidence key; a source with no score gives None")
    confidence = raw["confidence"]
    if confidence is not None:
        if not scored:
            raise ConformanceError(f"{where}: the source gives no confidence, but this one has the made-up number {confidence!r}")
        if isinstance(confidence, bool) or not isinstance(confidence, int | float) or math.isnan(confidence) or not 0 <= confidence <= 1:
            raise ConformanceError(f"{where}: the confidence {confidence!r} is not a number within 0..1")

    quotes = raw.get("quotes")
    if not isinstance(quotes, list):
        raise ConformanceError(f"{where}: quotes is a {type(quotes).__name__}, not a list")
    for index, quote in enumerate(quotes):
        if not isinstance(quote, dict) or not _filled(quote.get("text")):
            raise ConformanceError(f"{where}: quote {index} has no text")
        if set(quote) - _QUOTE_KEYS or not isinstance(quote.get("paragraphId", ""), str):
            raise ConformanceError(f"{where}: quote {index} has keys other than a paragraphId hint and its text: {quote!r}")
    if raw.get("flag", FLAG_DUPLICATE) != FLAG_DUPLICATE:
        raise ConformanceError(f"{where}: the flag {raw['flag']!r} is not {FLAG_DUPLICATE!r}")
    for key in ("chapterId", "note"):
        if key in raw and not isinstance(raw[key], str):
            raise ConformanceError(f"{where}: {key} is a {type(raw[key]).__name__}, not a string")


def run(source: Any) -> None:
    """Checks one source."""
    descriptor = conformance.check_descriptor(source)
    if not isinstance(descriptor, ExtractionDescriptor):
        raise ConformanceError(f'"{descriptor.name}" has a {type(descriptor).__name__}, not an ExtractionDescriptor')
    name = descriptor.name

    availability = source.available()
    if not isinstance(availability, Availability):
        raise ConformanceError(f'"{name}" answered available() with a {type(availability).__name__}, not an Availability')
    if source.available() != availability:
        raise ConformanceError(f'"{name}" is not static: two available() answers differed')

    if not availability.ok:
        reason = availability.reason.strip()
        if not (reason[0].isupper() or reason[0].isdigit()) or not reason.endswith("."):
            raise ConformanceError(f'"{name}" is unavailable, and {availability.reason!r} is not a sentence saying why')
        try:
            role = source.extractor()
        except NotSupportedError as refusal:
            if refusal.name != name or refusal.message != availability.reason or refusal.level.usable:
                raise ConformanceError(f'"{name}" is unavailable, but its refusal was {refusal.name!r} at {refusal.level.name}: {refusal}') from refusal
            return
        except Exception as exc:
            raise ConformanceError(f'"{name}" is unavailable, and raised {type(exc).__name__} instead of NotSupportedError') from exc
        raise ConformanceError(f'"{name}" is unavailable, but extractor() gave {role!r} instead of refusing')

    roles: dict[str, Any] = {}

    def ask(port: Any) -> Any:
        roles[EXTRACT] = port.extractor()
        return roles[EXTRACT]

    conformance.check_roles(source, {EXTRACT: ask})
    extractor = roles[EXTRACT]
    first = extractor.extract(SAMPLE)
    if not isinstance(first, list):
        raise ConformanceError(f'"{name}" extracted a {type(first).__name__}, not a list')
    for index, raw in enumerate(first):
        check_raw(raw, scored=descriptor.scored, where=f'"{name}" suggestion {index}')
    if extractor.extract(SAMPLE) is first:
        raise ConformanceError(f'"{name}" gave the same list twice; the caller ingests it, so each call needs a new one')
