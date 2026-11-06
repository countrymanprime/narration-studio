"""Prepares a Project Gutenberg plain-text book for the Story Bible benchmark (src/studio/desktop/internal/guide/benchmark_test.go).

Usage: python -I prepare.py <book-id> <gutenberg.txt> <out.txt.gz>

The output is UTF-8 text, gzipped: one line per paragraph, a chapter's title on its own line starting with "# ". The Gutenberg
header and licence, the contents list, illustration markers and _emphasis_ underscores are removed; hard-wrapped lines are joined.
Only the chapters in BOOKS[book-id]["chapters"] are kept (all of them when it is None).
"""

from __future__ import annotations

import gzip
import re
import sys
from pathlib import Path

BOOKS = {
    # heading: a regex over one stripped line that starts a chapter; title_lines: lines after it that belong to the title.
    "alice": {"heading": r"CHAPTER [IVXL]+\.", "title_lines": 1, "chapters": None},
    "wind-in-the-willows": {"heading": r"[IVXL]+\. [A-Z][A-Z' .,-]+", "title_lines": 0, "chapters": None},
    "three-men-in-a-boat": {"heading": r"CHAPTER [IVXL]+\.", "title_lines": 0, "chapters": None},
    "pride-and-prejudice": {"heading": r"Chapter \d+", "title_lines": 0, "chapters": 24},
    # the held-out book: labelled before the confidence rule was run on it, and never used to tune it
    "treasure-island": {"heading": r"\d+", "title_lines": 1, "chapters": 18},
}


def body(raw: str) -> str:
    start = re.search(r"\*\*\* ?START OF[^\n]*\*\*\*", raw)
    end = re.search(r"\*\*\* ?END OF[^\n]*\*\*\*", raw)
    return raw[start.end() if start else 0 : end.start() if end else len(raw)]


def paragraphs(text: str) -> list[str]:
    blocks = re.split(r"\n\s*\n", text.replace("\r\n", "\n"))
    out = []
    for block in blocks:
        joined = " ".join(line.strip() for line in block.split("\n") if line.strip())
        joined = re.sub(r"\[Illustration[^\]]*\]", "", joined)
        joined = re.sub(r"_([^_]+)_", r"\1", joined)
        joined = re.sub(r"\{\d+\}", "", joined).strip()  # Three Men in a Boat's page numbers
        if joined:
            out.append(joined)
    return out


def prepare(book_id: str, raw: str) -> list[str]:
    book = BOOKS[book_id]
    heading = re.compile(book["heading"] + r"$")
    lines: list[str] = []
    started = False
    pending_title = 0
    chapters = 0
    for block in paragraphs(body(raw)):
        # A heading and its title can share a block (CHAPTER I. / Down the Rabbit-Hole on two wrapped lines).
        first = block.split(" ")
        match = heading.match(block) or (book["title_lines"] and heading.match(" ".join(first[:2])))
        if match and len(block) <= 120:
            chapters += 1
            if book["chapters"] is not None and chapters > book["chapters"]:
                break
            started = True
            title = block
            pending_title = book["title_lines"] if heading.match(block) else 0
            lines.append("# " + title)
            continue
        if not started:
            continue
        if pending_title:
            lines[-1] += ": " + block
            pending_title -= 1
            continue
        if block.startswith(("THE END", "End of Project Gutenberg", "End of the Project Gutenberg", "*** END")):
            break
        lines.append(block)
    return lines


def main() -> None:
    book_id, source, out = sys.argv[1:4]
    lines = prepare(book_id, Path(source).read_text(encoding="utf-8-sig"))
    # mtime 0 so the same book always gives the same bytes
    with open(out, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", compresslevel=9, mtime=0) as handle:
        handle.write(("\n".join(lines) + "\n").encode("utf-8"))
    print(f"{book_id}: {sum(1 for line in lines if line.startswith('# '))} chapters, {len(lines)} lines")


if __name__ == "__main__":
    main()
