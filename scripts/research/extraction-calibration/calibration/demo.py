"""Two tiny invented books with hand-made gold and a fake source, so the harness runs end to end with no model, no network
and no download. Nothing here is a measurement; the report says so wherever a fake appears."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .books import write_manuscript
from .fingerprint import fingerprint
from .sources import SourceRun

BOOKS = {
    "demo-one": [
        ("Chapter I", ['"Come in," said Mole to Ratty.', 'Toad laughed. "Never!" said Toad.', "Ratty rowed the boat down the river."]),
    ],
    "demo-two": [
        ("Chapter I", ['"Good day," said Alma to Bert.', 'Bert nodded. "Indeed," said Bert.', "Alma walked to the market."]),
    ],
}

GOLD = {
    "demo-one": [
        ("entry", {"name": "Mole"}, 0, "Mole"),
        ("entry", {"name": "Ratty"}, 0, "Ratty"),
        ("entry", {"name": "Toad"}, 1, "Toad"),
        ("speaker", {"quote": "Come in,", "speaker": "Mole"}, 0, "said Mole to Ratty."),
        ("speaker", {"quote": "Never!", "speaker": "Toad"}, 1, "said Toad."),
    ],
    "demo-two": [
        ("entry", {"name": "Alma"}, 0, "Alma"),
        ("entry", {"name": "Bert"}, 0, "Bert"),
        ("speaker", {"quote": "Good day,", "speaker": "Alma"}, 0, "said Alma to Bert."),
        ("speaker", {"quote": "Indeed,", "speaker": "Bert"}, 1, "said Bert."),
    ],
}

# What the fake offers per gold item: (confidence, correct?). The wrong ones are decoys with a confident score.
_DECOYS = [("entry", {"name": "Boat"}, 0.9), ("speaker", {"quote": "Come in,", "speaker": "Ratty"}, 0.8), ("entry", {"name": "River"}, 0.55)]


def write_demo(data_dir: Path) -> list[str]:
    """Write the demo books and their gold into ``data_dir``; returns the book ids."""
    for book_id, chapters in BOOKS.items():
        folder = data_dir / book_id
        folder.mkdir(parents=True, exist_ok=True)
        manuscript = write_manuscript(folder, book_id, chapters)
        paragraphs = json.loads(manuscript.read_text(encoding="utf-8"))["paragraphs"]
        rows = []
        for number, (kind, payload, index, _quote) in enumerate(GOLD[book_id], start=1):
            rows.append(
                {
                    "id": f"{book_id}-{number:04d}",
                    "kind": kind,
                    "payload": payload,
                    "evidence": [{"paragraphId": paragraphs[index]["id"], "start": 0, "end": 1, "text": paragraphs[index]["text"][:20]}],
                    "checkedBy": ["fake"],
                    "note": "invented demo item",
                }
            )
        decoys = [{"fp": fingerprint({"kind": k, **v}), "valid": False} for k, v, _ in _DECOYS]
        (folder / "adjudicated.jsonl").write_text("\n".join(json.dumps(d) for d in decoys) + "\n", encoding="utf-8")
        (folder / "gold.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    return list(BOOKS)


def fake_run(manuscript: Path, gold_rows: list[dict[str, Any]]) -> SourceRun:
    """A fake source: every gold item at 0.95, plus the decoys. The quotes are slices of the paragraphs."""
    paragraphs = json.loads(manuscript.read_text(encoding="utf-8"))["paragraphs"]
    items = []
    for row in gold_rows:
        paragraph = paragraphs[0]
        index = next((p for p in paragraphs if p["id"] == row["evidence"][0]["paragraphId"]), paragraph)
        items.append({"payload": {"kind": row["kind"], **row["payload"]}, "confidence": 0.95, "quotes": [{"paragraphId": index["id"], "text": index["text"]}]})
    for kind, payload, confidence in _DECOYS:
        items.append(
            {"payload": {"kind": kind, **payload}, "confidence": confidence, "quotes": [{"paragraphId": paragraphs[0]["id"], "text": paragraphs[0]["text"]}]}
        )
    return SourceRun("fake", "fake", items=items, versions={"fake": "demo"}, command="fake")
