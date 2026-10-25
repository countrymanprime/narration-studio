import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

CORE = Path(__file__).resolve().parents[1] / "core"
COMPARE_PATH = CORE / "compare.py"
SPEC = importlib.util.spec_from_file_location("transcript_compare", COMPARE_PATH)
compare = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(compare)


def test_reference_sections_are_not_available_for_transcript_matching(tmp_path):
    manuscript = tmp_path / "manuscript.json"
    manuscript.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "documentId": "test-document",
                "chapters": [
                    {"id": "chapter-1", "title": "Chapter 1", "contentKind": "narration"},
                    {"id": "characters", "title": "Characters", "contentKind": "reference"},
                ],
                "paragraphs": [
                    {"id": "p-1", "chapterId": "chapter-1", "index": 0, "text": "Ada enters the room."},
                    {"id": "p-2", "chapterId": "characters", "index": 1, "text": "Ada Finch is the narrator."},
                ],
            }
        ),
        encoding="utf-8",
    )

    chapters = compare.load_manuscript_chapters(manuscript)

    assert [chapter["title"] for chapter in chapters] == ["Chapter 1"]
    assert chapters[0]["paragraphs"] == ["Ada enters the room."]


# --- the command line (compare.py --capabilities) -------------------------------------------------------------------------
# --manuscript is required by argparse for every invocation (see compare.py's module docstring) but unused here.
# PYTHONUNBUFFERED is stripped from the subprocess's environment: dev shells often set it, which forces line-by-line
# flushing and would mask a real bug this test exists to catch - a real (frozen or plain `python`) process's stdout is
# a pipe, not a tty, so it is fully buffered by default, and os._exit() (used below main()'s exit) skips the normal
# interpreter shutdown that would otherwise flush it.


def test_the_cli_prints_the_capabilities_report_and_exits_0(tmp_path):
    env = {key: value for key, value in os.environ.items() if key != "PYTHONUNBUFFERED"}
    completed = subprocess.run(
        [sys.executable, str(COMPARE_PATH), "--capabilities", "--manuscript", str(tmp_path / "unused.json")],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
        env=env,
    )

    assert completed.returncode == 0, completed.stderr
    report = json.loads(completed.stdout)
    assert report["type"] == "capabilities"
    assert "whisper" in report["asr"]
    assert report["asr"]["whisper"]["modes"] == ["batch"]
