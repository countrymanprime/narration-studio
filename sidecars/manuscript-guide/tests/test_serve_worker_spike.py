"""The spike's stdio worker (spikes/serve_worker.py) answers each request line with what a spawned process would have produced."""

import importlib.util
import io
import json
import time
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "spikes" / "serve_worker.py"
SPEC = importlib.util.spec_from_file_location("serve_worker", MODULE_PATH)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(worker)


def answers(lines: list[str], idle_seconds: float = 5.0) -> list[dict]:
    stdout = io.StringIO()
    worker.serve(io.StringIO("".join(line + "\n" for line in lines)), stdout, idle_seconds)
    return [json.loads(line) for line in stdout.getvalue().splitlines()]


def test_a_command_answers_with_its_code_and_streams_in_order(tmp_path):
    missing = str(tmp_path / "manuscript_guide.json")
    replies = answers(
        [
            json.dumps({"id": 1, "argv": ["capabilities"]}),
            json.dumps({"id": 2, "argv": ["edit", "--guide", missing, "--entity-id", "x", "--field", "description", "--value=y"]}),
            "",
        ]
    )
    assert [reply["id"] for reply in replies] == [1, 2]
    assert replies[0]["code"] == 0 and json.loads(replies[0]["stdout"])["type"] == "capabilities"
    assert replies[1]["code"] == 1 and "build it first" in replies[1]["stderr"]


def test_long_jobs_and_bad_lines_are_refused_without_ending_the_worker():
    replies = answers([json.dumps({"id": 1, "argv": ["build", "--manuscript", "m", "--out", "o"]}), "not json", json.dumps({"id": 3, "argv": []})])
    assert [reply["code"] for reply in replies] == [2, 2, 2]
    assert "spawn it" in replies[0]["stderr"] and "bad request" in replies[1]["stderr"]


def test_the_worker_exits_when_idle():
    class Silent(io.StringIO):
        def __iter__(self):
            time.sleep(10)
            return iter(())

    started = time.monotonic()
    worker.serve(Silent(), io.StringIO(), idle_seconds=0.2)
    assert time.monotonic() - started < 5
