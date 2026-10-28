"""Builds the benchmark's manuscripts from public-domain books: one canonical ``manuscript.json`` per book, split into chapters.

The texts are Project Gutenberg books as the PG-19 corpus (``emozilla/pg19`` on Hugging Face, books published before 1919)
carries them, so the same text reaches every machine from one host. ``--parquet`` reads a copy already downloaded. The book ids
are Gutenberg ebook numbers; ``BOOKS`` is the list the research doc reports.

Usage: ``python prepare_books.py --out DIR [--parquet FILE]``. It writes ``DIR/<id>.manuscript.json`` and ``DIR/books.json``.
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path

PARQUET_URL = "https://huggingface.co/datasets/emozilla/pg19/resolve/main/data/test-00000-of-00001-29a571947c0b5ccc.parquet"

# (Gutenberg ebook number, what the book is for in the benchmark)
BOOKS = (
    ("56410", "short novel, curly quotes and accents in the source"),
    ("34467", "few characters, much dialogue"),
    ("53345", "mid novel, dialogue-heavy, large cast"),
    ("9931", "about 90k words, the size the earlier trial extrapolated to"),
    ("6941", "long novel, Scots dialect"),
)

HEADING = re.compile(r"^\s*(CHAPTER|Chapter)\s+([IVXLCDM]+|\d+)\b[^\n]*$", re.MULTILINE)
SCHEMA_VERSION = 1


def load_texts(parquet: Path | None, cache: Path) -> dict[str, dict[str, str]]:
    """The corpus' books by Gutenberg number: ``title`` and ``text``."""
    import pyarrow.parquet as pq

    if parquet is None:
        parquet = cache / "pg19_test.parquet"
        if not parquet.is_file():
            cache.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(PARQUET_URL) as reply, parquet.open("wb") as file:
                while block := reply.read(1 << 20):
                    file.write(block)
    rows = pq.read_table(parquet).to_pylist()
    return {row["url"].rsplit("/", 1)[-1]: {"title": row["short_book_title"], "text": row["text"]} for row in rows}


def paragraphs_of(block: str) -> list[str]:
    """The paragraphs of a block of hard-wrapped text: blank-line separated, lines joined by a space, illustrations dropped."""
    out = []
    for raw in re.split(r"\n\s*\n", block):
        text = " ".join(line.strip() for line in raw.strip().splitlines())
        if text and not text.startswith("[Illustration") and not re.fullmatch(r"[\W_]*", text):
            out.append(text)
    return out


def manuscript_of(number: str, title: str, text: str) -> dict:
    """The canonical manuscript of ``text``: one chapter per heading, the front matter before the first heading dropped."""
    text = text.replace("\r\n", "\n")
    marks = list(HEADING.finditer(text))
    if len(marks) < 2:
        raise SystemExit(f"{number}: found {len(marks)} chapter headings, so the book cannot be split")
    chapters, paragraphs = [], []
    for index, mark in enumerate(marks):
        end = marks[index + 1].start() if index + 1 < len(marks) else len(text)
        body = paragraphs_of(text[mark.end() : end])
        if not body:
            continue
        chapter_id = f"ch{len(chapters) + 1:03d}"
        chapter_title = mark.group(0).strip()
        chapters.append({"id": chapter_id, "title": chapter_title, "contentKind": "narration"})
        for paragraph in body:
            paragraphs.append({"id": f"p{len(paragraphs) + 1:05d}", "chapterId": chapter_id, "chapterTitle": chapter_title, "text": paragraph})
    return {"schemaVersion": SCHEMA_VERSION, "documentId": f"pg{number}", "title": title, "chapters": chapters, "paragraphs": paragraphs}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--parquet", type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    texts = load_texts(args.parquet, args.out / "cache")
    summary = []
    for number, purpose in BOOKS:
        book = texts[number]
        manuscript = manuscript_of(number, book["title"], book["text"])
        (args.out / f"{number}.manuscript.json").write_text(json.dumps(manuscript, ensure_ascii=False), encoding="utf-8")
        words = sum(len(p["text"].split()) for p in manuscript["paragraphs"])
        quotes = sum(p["text"].count(mark) for p in manuscript["paragraphs"] for mark in ('"', "“"))
        per_chapter = sorted(sum(len(p["text"].split()) for p in manuscript["paragraphs"] if p["chapterId"] == c["id"]) for c in manuscript["chapters"])
        summary.append(
            {
                "id": number,
                "title": book["title"],
                "purpose": purpose,
                "words": words,
                "chapters": len(manuscript["chapters"]),
                "paragraphs": len(manuscript["paragraphs"]),
                "quoteMarksPer100Words": round(quotes / words * 100, 1),
                "nonAsciiCharacters": sum(1 for p in manuscript["paragraphs"] for c in p["text"] if ord(c) > 127),
                "chapterWordsMedian": per_chapter[len(per_chapter) // 2],
                "chapterWordsMax": per_chapter[-1],
            }
        )
        print(f"{number} {book['title'][:50]}: {words} words, {len(manuscript['chapters'])} chapters")
    (args.out / "books.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
