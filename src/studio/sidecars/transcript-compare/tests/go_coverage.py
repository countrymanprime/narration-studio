"""The host's recording-coverage alignment, for this sidecar's test tooling.

The sidecar only transcribes: the host aligns the chapter to the words and writes the results
(`src/studio/desktop/internal/recordingcoverage`). The coverage harness, the calibration and the
alignment spike measure that Go code through `src/studio/desktop/cmd/proof-align`, built once per
process with the repository's Go toolchain and kept running as a line-per-request server. Nothing
here ships.
"""

from __future__ import annotations

import atexit
import json
import os
import subprocess
import tempfile
import threading
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

DESKTOP = Path(__file__).resolve().parents[3] / "desktop"
HEADING = -1
"""The paragraph index of a title or subtitle token: optional, outside the denominator."""

READ = "read"
MISREAD = "misread"
HEADING_STATUS = "heading"
REGION_KINDS = ("head", "tail", "skip", "short_read", "different_text")


class AlignError(RuntimeError):
    """The Go aligner refused a request; the message is its own."""


@dataclass(frozen=True)
class AlignmentParams:
    """The parameters that decide which tokens count as read; the defaults are the shipped ones."""

    max_misread_run: int = 8
    min_anchor_run: int = 3


SHIPPED_PARAMS = AlignmentParams()


@dataclass(frozen=True)
class Thresholds:
    """The narrator's pass/fail settings, applied on read; the defaults are the shipped ones."""

    min_paragraph_present: float = 0.8
    max_missing_run: int = 3


class _Server:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._process: subprocess.Popen | None = None

    def _start(self) -> subprocess.Popen:
        folder = Path(tempfile.mkdtemp(prefix="proof-align-"))
        binary = folder / ("proof-align.exe" if os.name == "nt" else "proof-align")
        env = dict(os.environ, CGO_ENABLED="0")
        built = subprocess.run(["go", "build", "-o", str(binary), "./cmd/proof-align"], cwd=DESKTOP, env=env, capture_output=True, text=True, check=False)
        if built.returncode != 0:
            raise AlignError(f"could not build cmd/proof-align with the Go toolchain: {built.stderr.strip()}")
        process = subprocess.Popen([str(binary)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1)
        atexit.register(process.kill)
        return process

    def request(self, payload: Mapping) -> dict:
        with self._lock:
            if self._process is None or self._process.poll() is not None:
                self._process = self._start()
            assert self._process.stdin and self._process.stdout
            self._process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
            self._process.stdin.flush()
            reply = json.loads(self._process.stdout.readline())
        if "error" in reply:
            raise AlignError(reply["error"])
        return reply


_SERVER = _Server()


def results(
    manifest: Path,
    words_dir: Path,
    manuscript: Path,
    chapter_id: str,
    out: Path,
    model: str,
    params: AlignmentParams = SHIPPED_PARAMS,
    language: str | None = None,
    words_report: Path | None = None,
    checked_by: str | None = None,
) -> None:
    """Write a run's results file as the host does: from a words report after a transcribing run, or align-only."""
    _SERVER.request(
        {
            "op": "results",
            "manifest": str(manifest),
            "wordsDir": str(words_dir),
            "manuscript": str(manuscript),
            "chapterId": chapter_id,
            "out": str(out),
            "wordsReport": str(words_report) if words_report else "",
            "model": model,
            "checkedBy": checked_by or "",
            "language": language,
            "maxMisreadRun": params.max_misread_run,
            "minAnchorRun": params.min_anchor_run,
        }
    )


@dataclass(frozen=True)
class AlignedChapter:
    """`recordingcoverage.AlignedChapter`: the chapter's merged tokens, the manuscript word and paragraph of each, and the opcodes over
    them and the transcript's tokens."""

    doc_tokens: tuple[str, ...]
    doc_words: tuple[str, ...]
    token_paragraph: tuple[int, ...]
    paragraph_ids: tuple[str, ...]
    audio_tokens: tuple[str, ...]
    opcodes: tuple[tuple[str, int, int, int, int], ...]


@dataclass(frozen=True)
class Alignment:
    """A chapter aligned to transcript words: the aligned chapter, and each audio token's transcript word."""

    aligned: AlignedChapter
    index_map: tuple[int, ...]


def _aligned(raw: Mapping) -> AlignedChapter:
    return AlignedChapter(
        tuple(raw["docTokens"]),
        tuple(raw["docWords"]),
        tuple(raw["tokenParagraph"]),
        tuple(raw["paragraphIds"]),
        tuple(raw["audioTokens"]),
        tuple(tuple(op) for op in raw["opcodes"]),
    )


def align(heading: str, paragraphs: Sequence[str], paragraph_ids: Sequence[str], words: Sequence[tuple[str, float, float]]) -> Alignment:
    """The chapter aligned to transcript words by the host's own tokenizing and `SequenceMatcher` port."""
    reply = _SERVER.request(
        {"op": "align", "heading": heading, "paragraphs": list(paragraphs), "paragraphIds": list(paragraph_ids), "words": [list(w) for w in words]}
    )
    return Alignment(_aligned(reply["aligned"]), tuple(reply["indexMap"]))


@dataclass(frozen=True)
class Region:
    kind: str
    paragraph_ids: tuple[str, ...]
    token_count: int
    first_word: str
    last_word: str
    doc_start: int
    doc_end: int
    audio_index: int
    audio_before: int | None
    audio_after: int | None
    position: Mapping | None = None
    """Where the missing text would sit in the audio (`measure` only): itemIndex, itemGuid and sourceTime."""


@dataclass(frozen=True)
class Paragraph:
    id: str
    tokens: int
    present: int
    longest_missing_run: int

    @property
    def present_fraction(self) -> float:
        return self.present / self.tokens if self.tokens else 1.0

    def passes(self, thresholds: Thresholds) -> bool:
        return self.present_fraction >= thresholds.min_paragraph_present and self.longest_missing_run <= thresholds.max_missing_run


@dataclass(frozen=True)
class Coverage:
    """`recordingcoverage.ChapterCoverage`, with the token statuses, extra runs and repeats of the same alignment."""

    body_tokens: int
    present_tokens: int
    missing_tokens: int
    extra_tokens: int
    longest_missing_run: int
    paragraphs: tuple[Paragraph, ...]
    regions: tuple[Region, ...]
    tokens: tuple[tuple[str, int | None], ...]
    extras: tuple[tuple[int, int], ...]
    repeats: tuple[Mapping | None, ...]

    @property
    def by_id(self) -> dict[str, Paragraph]:
        return {paragraph.id: paragraph for paragraph in self.paragraphs}

    @property
    def present_fraction(self) -> float:
        return self.present_tokens / self.body_tokens if self.body_tokens else 1.0

    def text_complete(self, thresholds: Thresholds) -> bool:
        return self.longest_missing_run <= thresholds.max_missing_run and all(p.passes(thresholds) for p in self.paragraphs)


def coverage(aligned: AlignedChapter, params: AlignmentParams = SHIPPED_PARAMS) -> Coverage:
    """The host's coverage of one alignment, as `recordingcoverage.AlignedChapter.ComputeCoverage` computes it."""
    reply = _SERVER.request(
        {
            "op": "coverage",
            "aligned": {
                "docTokens": list(aligned.doc_tokens),
                "docWords": list(aligned.doc_words),
                "tokenParagraph": list(aligned.token_paragraph),
                "paragraphIds": list(aligned.paragraph_ids),
                "audioTokens": list(aligned.audio_tokens),
                "opcodes": [list(op) for op in aligned.opcodes],
            },
            "maxMisreadRun": params.max_misread_run,
            "minAnchorRun": params.min_anchor_run,
        }
    )
    return _coverage(reply)


def _coverage(reply: Mapping) -> Coverage:
    raw = reply["coverage"]
    return Coverage(
        raw["bodyTokens"],
        raw["presentTokens"],
        raw["missingTokens"],
        raw["extraTokens"],
        raw["longestMissingRun"],
        tuple(Paragraph(p["id"], p["tokens"], p["present"], p["longestMissingRun"]) for p in raw["paragraphs"]),
        tuple(
            Region(
                r["kind"],
                tuple(r["paragraphIds"]),
                r["tokenCount"],
                r["firstWord"],
                r["lastWord"],
                r["docStart"],
                r["docEnd"],
                r["audioIndex"],
                r["audioBefore"],
                r["audioAfter"],
                r.get("position"),
            )
            for r in raw["regions"]
        ),
        tuple((token["status"], token["audio"]) for token in reply["tokens"]),
        tuple(tuple(extra) for extra in reply["extras"]),
        tuple(reply["repeats"]),
    )


@dataclass(frozen=True)
class Measured:
    """A manuscript chapter measured against items' words as a run measures it: the coverage (each region with its position), the
    opcodes, and each audio token's joined transcript word."""

    coverage: Coverage
    opcodes: tuple[tuple[str, int, int, int, int], ...]
    index_map: tuple[int, ...]


def measure(manuscript: Path, chapter_id: str, items: Sequence[Mapping], params: AlignmentParams = SHIPPED_PARAMS) -> Measured:
    """`items` are manifest items in play order (index, itemGuid, startOffset, length, muted) with their `words` in source seconds."""
    reply = _SERVER.request(
        {
            "op": "measure",
            "manuscript": str(manuscript),
            "chapterId": chapter_id,
            "items": [dict(item, words=[list(word) for word in item.get("words", ())]) for item in items],
            "maxMisreadRun": params.max_misread_run,
            "minAnchorRun": params.min_anchor_run,
        }
    )
    return Measured(_coverage(reply), tuple(tuple(op) for op in reply["opcodes"]), tuple(reply["indexMap"]))
