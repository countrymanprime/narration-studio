"""A raw mod-script-pipe client for the real-Audacity 3 edit tests.

It speaks the pipe protocol directly (one command per write, a reply that ends at `BatchCommand finished: ...` and an empty line) and
shares no code with the Go client, so a test here can show what Audacity did even when the Go client or its fake is wrong. Standard
library only. Linux uses the FIFOs in /tmp, Windows the named pipes \\\\.\\pipe\\ToSrvPipe and FromSrvPipe.
"""

import errno
import json
import os
import queue
import re
import sys
import threading
import time

WINDOWS = sys.platform == "win32"
FINISHED = re.compile(r"BatchCommand finished: (?P<status>[^\r\n]*)\r?\n\r?\n\Z")  # Windows may write CRLF line ends; Linux wrote LF


class PipeError(Exception):
    pass


class NotReachable(PipeError):
    """The pipe does not exist or nobody holds its other end."""


class Timeout(PipeError):
    """No complete reply in time: a modal dialog may be open."""


class NoProject(PipeError):
    """A lone empty line: Audacity runs but has no project window."""


class Reply:
    def __init__(self, command, raw, seconds):
        self.command, self.raw, self.seconds = command, raw, seconds
        m = FINISHED.search(raw)
        self.ok = bool(m) and m.group("status").strip() == "OK"
        self.status = m.group("status").strip() if m else ""
        self.body = raw[: m.start()] if m else raw

    def json(self):
        try:
            return json.loads(self.body, strict=False)  # control characters inside a string are accepted: a localised command id can hold a raw newline
        except ValueError as exc:
            # Audacity escapes only the double quote in a string, so a backslash or a control character in a name comes out raw. Say where.
            pos = getattr(exc, "pos", 0)
            raise ValueError(f"{self.command!r}: {exc}; near {self.body[max(0, pos - 60) : pos + 60]!r}") from exc

    def __repr__(self):
        return f"Reply({self.command!r}, ok={self.ok}, {self.seconds * 1000:.0f} ms, body={self.body[:80]!r})"


def q(value):
    """Quote a string parameter. Audacity's parser takes `Name="value"`; a double quote cannot be escaped, so refuse it."""
    s = str(value)
    if '"' in s or "\n" in s or "\r" in s:
        raise ValueError(f"cannot quote {s!r}")
    return f'"{s}"'


class Pipe:
    def __init__(self, timeout=20.0):
        self.timeout = timeout
        self.line_end = "\r\n\0" if WINDOWS else "\n"
        self._w = self._r = None
        self._chunks = queue.Queue()
        self.log = []  # (command, seconds, ok|status) for every call

    # -- connection ---------------------------------------------------------------------------------------------------------------
    def paths(self):
        if WINDOWS:
            return r"\\.\pipe\ToSrvPipe", r"\\.\pipe\FromSrvPipe"
        uid = os.getuid()
        return f"/tmp/audacity_script_pipe.to.{uid}", f"/tmp/audacity_script_pipe.from.{uid}"

    def connect(self, deadline=15.0):
        self.close()
        to, frm = self.paths()
        end = time.time() + deadline
        if WINDOWS:
            while True:
                try:
                    self._w = open(to, "wb", buffering=0)  # noqa: SIM115 - held open for the connection
                    self._r = open(frm, "rb", buffering=0)  # noqa: SIM115
                    break
                except OSError as exc:
                    if time.time() > end:
                        raise NotReachable(f"{to}: {exc}") from exc
                    time.sleep(0.2)
        else:
            if not os.path.exists(to):
                raise NotReachable(f"{to} does not exist")
            while True:
                try:  # a write-open with no reader fails at once (ENXIO) instead of blocking
                    fd = os.open(to, os.O_WRONLY | os.O_NONBLOCK)
                    os.set_blocking(fd, True)
                    self._w = os.fdopen(fd, "wb", buffering=0)
                    break
                except OSError as exc:
                    if exc.errno not in (errno.ENXIO, errno.ENOENT) or time.time() > end:
                        raise NotReachable(f"{to}: {exc}") from exc
                    time.sleep(0.1)
            fd = os.open(frm, os.O_RDONLY | os.O_NONBLOCK)  # opens at once; Audacity's blocking open of its end completes now
            os.set_blocking(fd, True)
            self._r = os.fdopen(fd, "rb", buffering=0)
        self._chunks = queue.Queue()
        threading.Thread(target=self._pump, args=(self._r, self._chunks), daemon=True).start()

    @staticmethod
    def _pump(f, out):
        try:
            while True:
                b = f.read(65536)
                if not b:
                    time.sleep(0.01)  # a FIFO with no writer reads as EOF; keep waiting for Audacity to write
                    if f.closed:
                        return
                    continue
                out.put(b)
        except (OSError, ValueError):
            return

    def close(self):
        for f in (self._w, self._r):
            try:
                if f:
                    f.close()
            except OSError:
                pass
        self._w = self._r = None

    # -- requests -----------------------------------------------------------------------------------------------------------------
    def do(self, command, timeout=None, expect_ok=True):
        """Send one command and return its Reply. Raises Timeout (and drops the connection), NoProject, or PipeError on `Failed!`."""
        if self._w is None:
            self.connect()
        timeout = timeout or self.timeout
        while not self._chunks.empty():  # a late reply to an earlier timed-out command must not answer this one
            self._chunks.get_nowait()
        start = time.time()
        try:
            self._w.write((command + self.line_end).encode("utf-8"))
        except OSError as exc:
            self.close()
            raise NotReachable(str(exc)) from exc
        raw = ""
        while True:
            left = start + timeout - time.time()
            if left <= 0:
                self.close()
                self.log.append((command, time.time() - start, "timeout"))
                raise Timeout(f"no reply to {command!r} in {timeout:.0f} s")
            try:
                raw += self._chunks.get(timeout=min(left, 0.25)).decode("utf-8", "replace")
            except queue.Empty:
                if raw in ("\n", "\r\n") and time.time() - start > 0.5:
                    self.log.append((command, time.time() - start, "no-project"))
                    raise NoProject(command)
                continue
            if FINISHED.search(raw):
                break
        reply = Reply(command, raw, time.time() - start)
        self.log.append((command, reply.seconds, reply.status))
        if expect_ok and not reply.ok:
            raise PipeError(f"{command!r} failed: {raw!r}")
        return reply

    # -- conveniences -------------------------------------------------------------------------------------------------------------
    def info(self, kind):
        return self.do(f"GetInfo: Type={kind} Format=JSON").json()

    def tracks(self):
        return self.info("Tracks")

    def clips(self):
        return self.info("Clips")

    def labels(self):
        """Every label as (track index, start, end, text), flattened from GetInfo's nested [[track, [[s, e, text], ...]], ...]."""
        out = []
        for entry in self.info("Labels"):
            for s, e, text in entry[1]:
                out.append((entry[0], s, e, text))
        return out

    def selection(self):
        return self.info("Selection")

    def select_time(self, start, end=None):
        end = start if end is None else end
        self.do(f"SelectTime: Start={start!r} End={end!r} RelativeTo=ProjectStart")

    def select_tracks(self, first, count=1, mode="Set"):
        self.do(f"SelectTracks: Track={first} TrackCount={count} Mode={mode}")

    def select_none(self):
        self.do("SelectNone")

    def wait_for_project(self, limit=60.0):
        end = time.time() + limit
        last = None
        while time.time() < end:
            try:
                self.tracks()
                return
            except (NoProject, Timeout, NotReachable) as exc:
                last = exc
                time.sleep(0.5)
        raise PipeError(f"no project window after {limit:.0f} s: {last}")
