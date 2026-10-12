"""``extraction.Fingerprint`` (apps/desktop/internal/extraction/fingerprint.go) in Python, so a gold item and an emitted
suggestion match by what they say, not by spelling, case or typographic quotes."""

from __future__ import annotations

from typing import Any

_FOLD = str.maketrans(
    {
        "‘": "'",
        "’": "'",
        "‛": "'",
        "“": '"',
        "”": '"',
        "‟": '"',
        " ": " ",
        " ": " ",
        " ": " ",
    }
)

# The payload fields each kind's fingerprint is made of, in the Go order.
_FIELDS = {
    "entry": ("name",),
    "alias": ("entry", "alias"),
    "property": ("entry", "key", "value"),
    "relationship": ("entry", "relation", "to"),
    "claim": ("entry", "claim", "text"),
    "speaker": ("quote", "speaker"),
}

# A kind whose answer is a statement about the text needs a quote that is in it (the protocol's evidence check).
QUOTE_KINDS = frozenset({"property", "relationship", "claim", "speaker"})
KINDS = tuple(_FIELDS)


def fold(text: str) -> str:
    """Typographic quotes and odd spaces to their plain forms."""
    return text.translate(_FOLD)


def norm(text: Any) -> str:
    return " ".join(fold(str(text or "")).lower().split())


def fingerprint(payload: dict[str, Any]) -> str:
    """The identity of what ``payload`` says, or the empty string for an unknown kind."""
    fields = _FIELDS.get(payload.get("kind", ""))
    if fields is None:
        return ""
    parts = [payload["kind"]]
    for field in fields:
        # The claim kind (talk, act, know) is compared as written; the Go side does not fold it either.
        parts.append(str(payload.get(field) or "") if field == "claim" else norm(payload.get(field)))
    return "|".join(parts)
