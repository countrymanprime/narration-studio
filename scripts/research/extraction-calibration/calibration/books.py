"""The books: fetch a public-domain text, cut the fixed chapters and write the canonical manuscript the sidecar reads.

Texts, the manuscript and the gold stay under the ignored ``data/`` folder; only ``data/books.json`` is committed.
"""

from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

START = re.compile(r"\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*", re.IGNORECASE)
END = re.compile(r"\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK", re.IGNORECASE)
HEADING = re.compile(r"^(?:CHAPTER\s+)?(?P<roman>[IVXLC]+)\.?(?:\s+(?P<title>\S.*))?$")
MAX_BYTES = 20_000_000


def strip_gutenberg(raw: str) -> str:
    """The book between Project Gutenberg's start and end markers."""
    start = START.search(raw)
    end = END.search(raw)
    return raw[start.end() : end.start() if end else len(raw)].strip() if start else raw.strip()


def split_chapters(text: str) -> dict[str, tuple[str, list[str]]]:
    """Chapters by roman numeral, each (title, paragraphs). A heading is a line of capitals that starts with a roman numeral
    (``CHAPTER I.``, ``I. THE RIVER BANK``); the first occurrence of a numeral is the contents list and is overwritten by
    the later one with text under it."""
    chapters: dict[str, tuple[str, list[str]]] = {}
    current: str | None = None
    buffer: list[str] = []

    def close() -> None:
        if current is not None:
            paragraphs = [" ".join(block.split()) for block in re.split(r"\n\s*\n", "\n".join(buffer)) if block.strip()]
            if paragraphs or current not in chapters:
                chapters[current] = (chapters[current][0] if current in chapters else "", paragraphs)

    for line in text.splitlines():
        match = HEADING.match(line.strip())
        if match and (line.strip().isupper() or line.strip().upper().startswith("CHAPTER")):
            close()
            current = match["roman"]
            title = (match["title"] or "").strip()
            chapters.setdefault(current, (title, []))
            if title:
                chapters[current] = (title, chapters[current][1])
            buffer = []
        else:
            buffer.append(line)
    close()
    return chapters


def lock_chapters(folder: Path, chosen: list[str]) -> list[str]:
    """Fix the chapter list on the first run and refuse a different one later (the protocol's rule)."""
    lock = folder / "chapters.lock.json"
    if lock.exists():
        locked = json.loads(lock.read_text(encoding="utf-8"))
        if locked != chosen:
            raise ValueError(f"the chapter list was fixed on the first run as {locked}; {chosen} is not allowed (delete {lock} to start a new study)")
        return locked
    lock.write_text(json.dumps(chosen), encoding="utf-8")
    return chosen


def write_manuscript(folder: Path, book_id: str, chapters: list[tuple[str, list[str]]]) -> Path:
    """The canonical manuscript.json (schema version 1) for ``chapters``, one paragraph id per paragraph."""
    paragraphs, rows, index = [], [], 0
    for number, (title, texts) in enumerate(chapters, start=1):
        chapter_id = f"c-{number:04d}"
        rows.append({"id": chapter_id, "title": title, "subtitle": None, "index": number - 1, "wordCount": sum(len(t.split()) for t in texts), "sections": []})
        for text in texts:
            index += 1
            paragraphs.append(
                {
                    "id": f"p-{index:06d}",
                    "index": index - 1,
                    "chapterId": chapter_id,
                    "chapterTitle": title,
                    "sectionId": None,
                    "text": text,
                    "sourceIndex": index - 1,
                }
            )
    data = {
        "schemaVersion": 1,
        "documentId": book_id,
        "importedAt": datetime.now(UTC).isoformat(),
        "importer": {"format": "text", "version": 1},
        "source": {"fileName": f"{book_id}.txt", "sha256": "0" * 64, "storedPath": f"{book_id}.txt"},
        "chapters": rows,
        "paragraphs": paragraphs,
    }
    path = folder / "manuscript.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def build_manuscript(folder: Path, book: dict[str, Any], raw: str) -> tuple[Path, int]:
    """Cut the book's fixed chapters out of ``raw`` and write manuscript.json; returns it and the word count."""
    chapters = split_chapters(strip_gutenberg(raw))
    chosen = lock_chapters(folder, list(book["chapters"]))
    missing = [numeral for numeral in chosen if not chapters.get(numeral, ("", []))[1]]
    if missing:
        raise ValueError(f"{book['id']}: chapter(s) {missing} not found in the text; check the heading style before the first run")
    picked = [(f"Chapter {numeral}: {chapters[numeral][0]}".rstrip(": "), chapters[numeral][1]) for numeral in chosen]
    path = write_manuscript(folder, book["id"], picked)
    return path, sum(len(p.split()) for _, texts in picked for p in texts)


def fetch(book: dict[str, Any], data_dir: Path, repo: Path, today: str | None = None) -> Path:
    """Download (or, for a repo fixture, copy) the book's text into ``data_dir/<id>/`` and record its URL, date and SHA-256 in
    ``source.json``. The public-domain line of the record page is for the runner to copy in by hand."""
    folder = data_dir / book["id"]
    folder.mkdir(parents=True, exist_ok=True)
    if "file" in book:
        raw_bytes = (repo / book["file"]).read_bytes()
        where = book["file"]
    else:
        request = urllib.request.Request(book["url"], headers={"User-Agent": "narration-utils-calibration"})
        with urllib.request.urlopen(request, timeout=60) as response:
            raw_bytes = response.read(MAX_BYTES + 1)
        if len(raw_bytes) > MAX_BYTES:
            raise ValueError(f"{book['url']} is larger than {MAX_BYTES} bytes")
        where = book["url"]
    (folder / "text.txt").write_bytes(raw_bytes)
    source = {
        "id": book["id"],
        "title": book["title"],
        "from": where,
        "record": book["record"],
        "fetchedOn": today or datetime.now(UTC).date().isoformat(),
        "sha256": hashlib.sha256(raw_bytes).hexdigest(),
        "publicDomainStatement": "",
    }
    (folder / "source.json").write_text(json.dumps(source, indent=2), encoding="utf-8")
    return folder / "text.txt"


def paragraph_texts(manuscript: Path) -> dict[str, str]:
    """paragraph id -> text, for the evidence check."""
    data = json.loads(manuscript.read_text(encoding="utf-8"))
    return {p["id"]: p["text"] for p in data["paragraphs"]}
