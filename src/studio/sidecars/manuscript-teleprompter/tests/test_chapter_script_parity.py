"""What chapter_script.py answers for the host's port (src/studio/desktop/internal/scripttrack, chapter.go).

`tests/fixtures/booth-parity/chapter-scripts.jsonl` holds the chapter_script.py calls the teleprompter suite made when it
was recorded (2026-10-25), with the manuscript or text file each read, and seeded synthetic ones: titles with a
line-break subtitle, separators, Unicode case and space, every kind of paragraph index, broken manuscripts, and credits
text with each line ending. A case that names `manuscriptPath` (the coverage manuscript, 4.6 MB) is answered with a
digest. `chapter-scripts.golden.jsonl` holds, one line per input line, the script (tokens, heading, text and `script`
event), the ChapterError (message and candidates) or the name of any other exception it raised; `scripttrack`'s
`chapter_parity_test.go` must agree with it. chapter_script.py stays in the sidecar (it checks the chapter and is the
engine's context), so this pins the two copies to each other. Regenerate with `UPDATE_CONTRACTS=1` only when the script
changes on purpose, and say why in the PR.

The tracker, flags and placement goldens beside it (tracker-sessions, tracker-cases, flag-sessions, placement-cases)
were written the same way by script_tracker.py, flags.py, locate.py and align_word.py before those were deleted
(2026-10-25); they are frozen, and only Go reads them.
"""

import base64
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

CORE = Path(__file__).resolve().parents[1] / "core"
sys.path.insert(0, str(CORE))
import chapter_script

ROOT = Path(__file__).resolve().parents[5]
FIXTURES = ROOT / "tests" / "fixtures" / "booth-parity"


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def check(name, render):
    inputs = [json.loads(line) for line in (FIXTURES / f"{name}.jsonl").read_text(encoding="utf-8").split("\n") if line]
    text = "".join(dump(render(item)) + "\n" for item in inputs)
    golden = FIXTURES / f"{name}.golden.jsonl"
    if os.environ.get("UPDATE_CONTRACTS"):
        golden.write_text(text, encoding="utf-8", newline="\n")
    assert golden.is_file(), f"no {golden}: run with UPDATE_CONTRACTS=1 and commit it"
    assert text == golden.read_text(encoding="utf-8")
    return inputs


def _written(case, key, folder):
    """The file a chapter-script case reads: its text (or bytes) written out, or a path that does not exist."""
    path = Path(folder) / "input"
    if case.get(key + "Base64") is not None:
        path.write_bytes(base64.b64decode(case[key + "Base64"]))
    elif case.get(key) is not None:
        path.write_bytes(case[key].encode("utf-8"))
    return path


def script_answer(case):
    with tempfile.TemporaryDirectory() as folder:
        try:
            if case["k"] == "text":
                script = chapter_script.text_script(case["text"], case["id"], case["title"])
            elif case["k"] == "textfile":
                script = chapter_script.load_text_script(_written(case, "text", folder), case["id"], case["title"])
            else:
                path = ROOT / case["manuscriptPath"] if "manuscriptPath" in case else _written(case, "manuscript", folder)
                script = chapter_script.load_chapter_script(path, case["chapter"])
        except chapter_script.ChapterError as error:
            message = str(error)
            if case["k"] == "textfile" and message.startswith("Could not read"):
                message = message.split(":")[0]  # the rest is the OSError's own text
            return {"error": message, "candidates": error.candidates}
        except Exception as error:  # noqa: BLE001 - the case pins that this input fails, not how
            return {"crash": type(error).__name__}
    answer = {"tokens": script.tokens, "heading": script.heading, "text": script.text, "event": chapter_script.script_event(script)}
    if "manuscriptPath" in case:
        return {"tokenCount": len(script.tokens), "sha256": hashlib.sha256(dump(answer).encode("utf-8")).hexdigest()}
    return answer


def test_every_chapter_script_gives_the_pinned_script_or_error():
    cases = check("chapter-scripts", script_answer)
    assert {case["k"] for case in cases} == {"chapter", "text", "textfile"}
