"""Gold sets and adjudications: one JSON object per line, in the protocol's format."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from .fingerprint import KINDS, fingerprint

# The protocol's minimum gold items per scored book and kind.
MINIMUMS = {"entry": 40, "alias": 40, "speaker": 100, "property": 30, "claim": 30}


def read_lines(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if line.strip():
            try:
                rows.append(json.loads(line))
            except ValueError as error:
                raise ValueError(f"{path}:{number}: not JSON ({error})") from error
    return rows


def load_gold(path: Path) -> dict[str, set[str]]:
    """Gold fingerprints by kind. A row with an unknown kind or no payload is an error, not skipped."""
    by_kind: dict[str, set[str]] = defaultdict(set)
    for row in read_lines(path):
        fp = fingerprint(row.get("payload", {}) | {"kind": row.get("kind")})
        if not fp:
            raise ValueError(f"{path}: gold item {row.get('id')!r} has kind {row.get('kind')!r}; the kinds are {', '.join(KINDS)}")
        by_kind[row["kind"]].add(fp)
    return dict(by_kind)


def load_adjudicated(path: Path) -> dict[str, bool]:
    """fingerprint -> valid, from the checker's adjudication file (``{"fp": ..., "valid": true}``)."""
    return {row["fp"]: bool(row["valid"]) for row in read_lines(path)}


def shortfalls(gold: dict[str, set[str]]) -> dict[str, tuple[int, int]]:
    """kind -> (have, need) for each kind under the protocol's minimum."""
    return {kind: (len(gold.get(kind, ())), need) for kind, need in MINIMUMS.items() if len(gold.get(kind, ())) < need}
