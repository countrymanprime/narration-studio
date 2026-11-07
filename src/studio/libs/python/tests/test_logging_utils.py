import io
import json
import os
import sys
import unittest
import unittest.mock
from contextlib import redirect_stderr
from pathlib import Path

PYTHON_ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(PYTHON_ROOT))

from narration_common import logging_utils


class LoggingUtilsTests(unittest.TestCase):
    def setUp(self):
        logging_utils.set_log_file(None)
        self._env = {key: os.environ.pop(key, None) for key in ("NARRATION_RUN_ID", "NARRATION_LOG_LEVEL")}

    def tearDown(self):
        logging_utils.set_log_file(None)
        for key, value in self._env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def _one_line(self, call):
        buffer = io.StringIO()
        with redirect_stderr(buffer):
            call()
        lines = [line for line in buffer.getvalue().splitlines() if line]
        self.assertEqual(1, len(lines), f"expected exactly one line, got {lines!r}")
        return json.loads(lines[0])

    def test_a_plain_call_stays_valid_and_writes_an_info_line_with_ts_level_and_msg(self):
        record = self._one_line(lambda: logging_utils.log("Loading canonical manuscript..."))
        self.assertEqual("info", record["level"])
        self.assertEqual("Loading canonical manuscript...", record["msg"])
        self.assertRegex(record["ts"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
        self.assertNotIn("run", record)

    def test_a_debug_line_is_dropped_when_the_level_is_info(self):
        buffer = io.StringIO()
        with redirect_stderr(buffer):
            logging_utils.log("a decision", level="debug")
        self.assertEqual("", buffer.getvalue())

    def test_a_debug_line_is_kept_when_narration_log_level_is_debug(self):
        os.environ["NARRATION_LOG_LEVEL"] = "debug"
        record = self._one_line(lambda: logging_utils.log("a decision", level="debug", count=3))
        self.assertEqual("debug", record["level"])
        self.assertEqual(3, record["count"])

    def test_the_run_id_is_carried_from_the_environment_when_set(self):
        os.environ["NARRATION_RUN_ID"] = "run-123"
        record = self._one_line(lambda: logging_utils.log("hello"))
        self.assertEqual("run-123", record["run"])

    def test_fields_are_merged_into_the_record(self):
        record = self._one_line(lambda: logging_utils.log("cache", level="info", hit=True, key="abc123"))
        self.assertEqual(True, record["hit"])
        self.assertEqual("abc123", record["key"])

    def test_set_log_file_mirrors_the_same_line_the_log_flag_has_always_written(self):
        mirror = io.StringIO()
        logging_utils.set_log_file(mirror)
        buffer = io.StringIO()
        with redirect_stderr(buffer):
            logging_utils.log("mirrored")
        self.assertEqual(buffer.getvalue(), mirror.getvalue())
        record = json.loads(mirror.getvalue().strip())
        self.assertEqual("mirrored", record["msg"])


class EventTests(unittest.TestCase):
    def _lines(self, call):
        buffer = io.StringIO()
        with redirect_stderr(buffer):
            result = call()
        return result, [json.loads(line) for line in buffer.getvalue().splitlines()]

    def test_a_registered_event_with_typed_fields_is_written(self):
        written, lines = self._lines(lambda: logging_utils.event("asr.hotwords_used", count=3))
        self.assertTrue(written)
        self.assertEqual(1, len(lines))
        self.assertEqual({"event": "asr.hotwords_used", "count": 3, "level": "info"}, {k: lines[0][k] for k in ("event", "count", "level")})
        self.assertNotIn("msg", lines[0])

    def test_an_unknown_event_or_field_or_value_is_dropped_whole(self):
        canary = "CANARY Arelian Brightwater"
        for call in (
            lambda: logging_utils.event("asr.not_registered", count=1),
            lambda: logging_utils.event("asr.hotwords_used", count=1, text=canary),
            lambda: logging_utils.event("asr.hotwords_used", count=canary),
            lambda: logging_utils.event("gliner.name_dropped", reason=canary),
            lambda: logging_utils.event("gliner.chunk_failed", chapter=canary, err="ValueError"),
            lambda: logging_utils.event("gliner.chunk_failed", chapter="ch-1", err=f"ValueError: {canary}"),
            lambda: logging_utils.event("asr.hotwords_used", count=True),
            lambda: logging_utils.event("not a name", count=1),
        ):
            written, lines = self._lines(call)
            self.assertFalse(written)
            self.assertEqual([], lines)

    def test_every_registered_event_name_and_field_is_well_formed(self):
        for name, (level, fields) in logging_utils.EVENTS.items():
            self.assertRegex(name, r"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$")
            self.assertIn(level, ("debug", "info", "warn", "error"))
            for key, kind in fields.items():
                self.assertRegex(key, r"^[a-z][a-z0-9_]{0,31}$")
                self.assertTrue(kind in ("int", "bool", "id", "err") or isinstance(kind, tuple), (name, key))

    def test_a_debug_threshold_still_gates_the_event(self):
        with unittest.mock.patch.dict(os.environ, {"NARRATION_LOG_LEVEL": "error"}):
            _, lines = self._lines(lambda: logging_utils.event("asr.hotwords_used", count=1))
        self.assertEqual([], lines)


if __name__ == "__main__":
    unittest.main()
