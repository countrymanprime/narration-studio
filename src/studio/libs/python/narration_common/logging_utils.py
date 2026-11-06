"""Shared stderr[+file] logging helper for REAPER package Python backends.

Every call writes one JSON line — {"ts", "level", "run" (when NARRATION_RUN_ID is set by the host,
internal/process.runEnv), "msg", **fields} — to stderr and, when set_log_file was called, to the same mirror file the
`--log` flag has always written. A plain `log("text")` call still works exactly as
before, at level "info". NARRATION_LOG_LEVEL ("info" unless the host set it to "debug", the same variable
internal/process sets) gates the two levels callers use: a "debug" line is dropped before it is even built, so a
caller does not pay to format one nobody will read. Content is never a field's value (threat-model row 7a):
ids, counts, hashes, paths and timings only — never manuscript or transcript text.

`event(name, **fields)` is the typed way to write a record (docs/prds/activity-trace.prd.md): the name must be in EVENTS and each field
must match its kind there, so a sentence, a name or a path has no way in. The host's diagnostics export keeps only these lines from a
sidecar's stderr. An unknown event or field is dropped, never written.
"""

import json
import os
import re
import sys
from datetime import UTC, datetime

_log_file = None

_LEVELS = {"debug": 10, "info": 20, "warn": 30, "error": 40}


def set_log_file(handle):
    global _log_file
    _log_file = handle


def _threshold() -> int:
    return _LEVELS.get(os.environ.get("NARRATION_LOG_LEVEL", "info"), _LEVELS["info"])


def _timestamp() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def log(message: str, level: str = "info", **fields) -> None:
    if _LEVELS.get(level, _LEVELS["info"]) < _threshold():
        return
    record = {"ts": _timestamp(), "level": level, "msg": message}
    run_id = os.environ.get("NARRATION_RUN_ID")
    if run_id:
        record["run"] = run_id
    record.update(fields)
    line = json.dumps(record, sort_keys=True)
    print(line, file=sys.stderr, flush=True)
    if _log_file is not None:
        print(line, file=_log_file, flush=True)


# The kinds a field may have. There is no free-text kind.
#   "int"   a count, or a duration in whole milliseconds (an int or a float, written as an int)
#   "bool"  a flag
#   "id"    an opaque id: lower-case letters, digits and _ . : - (up to 64), such as a chapter id
#   "err"   an exception class name, never its message
#   (a, b)  one of the listed words
_ID = re.compile(r"^[a-z0-9_.:-]{1,64}$")
_ERR = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
_NAME = re.compile(r"^[a-z][a-z0-9_]{0,31}\.[a-z][a-z0-9_]{0,31}$")

EVENTS: dict[str, tuple[str, dict[str, object]]] = {
    "asr.hotwords_used": ("info", {"count": "int"}),
    "gliner.name_dropped": ("info", {"reason": ("not_at_span",)}),
    "gliner.chunk_failed": ("warn", {"chapter": "id", "err": "err"}),
    "gliner.workers_failed": ("warn", {"err": "err"}),
    "compare.item_decoded": ("info", {"item": "int", "start_ms": "int", "length_ms": "int"}),
    "takes.words_written": ("info", {"count": "int"}),
}


def _valid(kind, value) -> bool:
    if kind == "int":
        return isinstance(value, (int, float)) and not isinstance(value, bool) and abs(value) < 1 << 40
    if kind == "bool":
        return isinstance(value, bool)
    if kind == "id":
        return isinstance(value, str) and _ID.match(value) is not None
    if kind == "err":
        return isinstance(value, str) and _ERR.match(value) is not None
    return isinstance(kind, tuple) and value in kind


def event(name: str, **fields) -> bool:
    """Writes one typed record, `{"ts", "level", "event", "run"?, **fields}`; answers whether it was written.

    The event must be in EVENTS and every field must be one it lists with a value of its kind: a field that is not, or a value that does
    not fit, drops the whole record, so a half-checked line never reaches a log. A name outside the registry is dropped too.
    """
    entry = EVENTS.get(name) if _NAME.match(name or "") else None
    if entry is None:
        return False
    level, kinds = entry
    if _LEVELS[level] < _threshold():
        return True
    clean = {}
    for key, value in fields.items():
        if key not in kinds or not _valid(kinds[key], value):
            return False
        clean[key] = int(value) if kinds[key] == "int" else value
    record = {"ts": _timestamp(), "level": level, "event": name}
    run_id = os.environ.get("NARRATION_RUN_ID")
    if run_id:
        record["run"] = run_id
    record.update(clean)
    line = json.dumps(record, sort_keys=True)
    print(line, file=sys.stderr, flush=True)
    if _log_file is not None:
        print(line, file=_log_file, flush=True)
    return True
