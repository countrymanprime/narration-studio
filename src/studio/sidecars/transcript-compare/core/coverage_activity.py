"""What a recording check is doing right now, for the dialog's activity panel: the structured counterpart of the progress file's one line.

The progress file (`STAGE|pct|message`) says how far along a run is. This file says what the run is made of and what it is doing: how
many transcriptions it may run at once and how many are running, how many chunks the first pass has and how many are done, and
how much the larger model has been asked to re-check and how much of that is done. The host reads it beside the progress file
(`<progress>.activity.json`, `internal/coverage/activity.go`) and sends it with the run's state. It is best-effort, like the
progress file: a run never fails because it could not be written, and a host that cannot read it shows the percent alone.

Everything here is a count of work the sidecar really did or really has queued; nothing is estimated.
"""

from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass, field

SCHEMA_VERSION = 1
"""The file's version; `internal/coverage/activity.go` (`activitySchemaVersion`) and `tests/fixtures/contracts/coverage-activity.json` name the same number."""

MIN_WRITE_SECONDS = 0.25
"""A change is written at most this often; the last one is always written (`flush`)."""

REASON_LOW_CONFIDENCE = "low_confidence"
"""Whisper gave a word of the passage a probability below the run's score line."""
REASON_WIDESPREAD = "widespread"
"""So much of the chapter was in doubt that the larger model redoes whole items."""


@dataclass
class _Pass:
    """One model's share of the run."""

    model: str
    workers: int
    busy: dict[object, int] = field(default_factory=dict)
    total: int = 0
    done: int = 0
    final: bool = False
    """Whether `total` is all the work there will be: the first pass knows it at the start, the re-check once the first pass is through."""

    def snapshot(self) -> dict:
        return {
            "model": self.model,
            "workers": self.workers,
            "busy": min(self.workers, sum(self.busy.values())),
            "total": self.total,
            "done": self.done,
            "final": self.final,
        }


class ActivityLog:
    """Counts of a run's work, written to `path` as JSON as they change. Safe to call from every worker thread.

    A *unit* is the piece of audio one transcription takes: an item that is not chunked, or one chunk of an item that is. The first pass
    knows its units at the start (the manifest and the chunk plan give them); the re-check's units are the windows the larger model is
    asked for, which grow as items finish and are final when the first pass is."""

    def __init__(self, path: str | os.PathLike | None, *, model: str, workers: int, units: int, items: int = 0):
        self._path = None if path is None else str(path)
        self._lock = threading.RLock()
        self._first = _Pass(model, max(1, workers), total=max(0, units), final=True)
        self._recheck: _Pass | None = None
        self._reason: str | None = None
        self._items = items
        self._items_done = 0
        self._last_write = 0.0
        self._write(force=True)

    def set_workers(self, workers: int) -> None:
        """The first pass's real count of transcriptions at once, known once the run has planned its pool. There are never more at once
        than there are units to transcribe: one short item is one transcription, whatever was asked for."""
        with self._lock:
            self._first.workers = max(1, min(workers, self._first.total or 1))
            self._write(force=True)

    # --- the re-check -------------------------------------------------------------------------------------------------------------------

    def expect_recheck(self, model: str, workers: int) -> None:
        """The run will hand doubtful passages to `model`, `workers` of them at once; the count of passages is not known yet."""
        with self._lock:
            self._recheck = _Pass(model, max(1, workers))
            self._write(force=True)

    def recheck_queued(self, windows: int, reason: str) -> None:
        """`windows` more passages were handed to the larger model, for `reason`."""
        with self._lock:
            if self._recheck is None:
                return
            self._recheck.total += max(0, windows)
            if self._reason != REASON_WIDESPREAD:
                self._reason = reason
            self._write()

    def first_pass_ended(self) -> None:
        """The first pass has handed over every item: the re-check's total is now all there will be."""
        with self._lock:
            if self._recheck is not None:
                self._recheck.final = True
            self._write(force=True)

    # --- both passes --------------------------------------------------------------------------------------------------------------------

    def _pass(self, recheck: bool) -> _Pass:
        return self._recheck if recheck and self._recheck is not None else self._first

    def working(self, key: object, slots: int = 1, *, recheck: bool = False) -> None:
        """`slots` transcriptions of `key` (an item, or a chunk's item) are running now; 0 ends them."""
        with self._lock:
            busy = self._pass(recheck).busy
            if slots > 0:
                busy[key] = slots
            else:
                busy.pop(key, None)
            self._write()

    def unit_done(self, count: int = 1, *, recheck: bool = False) -> None:
        """`count` units finished."""
        with self._lock:
            target = self._pass(recheck)
            target.done += count
            if target.final:
                target.done = min(target.done, target.total)
            self._write()

    def item_done(self) -> None:
        """One item's words are final."""
        with self._lock:
            self._items_done += 1
            self._write()

    # --- the file -----------------------------------------------------------------------------------------------------------------------

    def snapshot(self) -> dict:
        """The counts as the file holds them (the host's `activityFile`)."""
        with self._lock:
            body: dict = {
                "schemaVersion": SCHEMA_VERSION,
                "items": {"total": self._items, "done": min(self._items_done, self._items)},
                "firstPass": self._first.snapshot(),
            }
            if self._recheck is not None:
                body["recheck"] = {**self._recheck.snapshot(), "reason": self._reason}
            return body

    def flush(self) -> None:
        """Write the counts now, however recently they were last written."""
        with self._lock:
            self._write(force=True)

    def _write(self, force: bool = False) -> None:
        if not self._path:
            return
        now = time.monotonic()
        if not force and now - self._last_write < MIN_WRITE_SECONDS:
            return
        self._last_write = now
        tmp = self._path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as handle:
                json.dump(self.snapshot(), handle, separators=(",", ":"))
            os.replace(tmp, self._path)
        except OSError:
            pass  # best-effort, like the progress file: the percent still moves


def path_for(progress_path: str | os.PathLike | None) -> str | None:
    """Where a run's activity file sits: beside its progress file."""
    return None if not progress_path else str(progress_path) + ".activity.json"
