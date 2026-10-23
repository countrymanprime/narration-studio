"""Test registry, step recording and artifacts for the real-Audacity 3 edit tests (A3-T14 to T23, T30, T32, T33).

A test is a function `fn(t)` registered with @test. `t.step(name, status, detail, **data)` records one line; `t.check(name, ok, detail)`
records pass or fail; `t.note(name, detail, **data)` records an observation that is neither (a measurement, a limitation). The
runner writes one JSON file per test into $NU_AUDACITY_OUT/results and `summarize.py` merges them for the CI job summary.
"""

import json
import os
import platform
import subprocess
import sys
import time
import traceback
from pathlib import Path

from pipe import Pipe, PipeError

REGISTRY = {}


def test(test_id, title, group="edits"):
    def deco(fn):
        REGISTRY[test_id] = {"id": test_id, "title": title, "fn": fn, "group": group}
        return fn

    return deco


class Ctx:
    def __init__(self, test_id, title, out_dir, work_dir):
        self.id, self.title = test_id, title
        self.out = Path(out_dir)
        self.work = Path(work_dir)
        self.steps = []
        self.pipe = Pipe()
        self.started = time.time()
        self.out.mkdir(parents=True, exist_ok=True)
        self.work.mkdir(parents=True, exist_ok=True)

    # -- recording ----------------------------------------------------------------------------------------------------------------
    def step(self, name, status, detail="", **data):
        assert status in ("PASS", "FAIL", "SKIP", "INFO"), status
        self.steps.append({"step": name, "status": status, "detail": str(detail), "data": data})
        print(f"[{self.id}] {status:4} {name}: {detail}", flush=True)

    def check(self, name, ok, detail="", **data):
        self.step(name, "PASS" if ok else "FAIL", detail, **data)
        return bool(ok)

    def note(self, name, detail="", **data):
        self.step(name, "INFO", detail, **data)

    def skip(self, name, reason):
        self.step(name, "SKIP", reason)

    # -- the environment ----------------------------------------------------------------------------------------------------------
    def screenshot(self, name):
        if sys.platform == "win32":
            return None
        path = self.out / f"{self.id}-{name}.png"
        subprocess.run(["import", "-window", "root", str(path)], capture_output=True, timeout=30, check=False)
        return path if path.exists() else None

    def _x11(self, *argv):
        return subprocess.run(argv, capture_output=True, text=True, timeout=10, check=False).stdout

    def window_list(self):
        """[(id, title, x, y, width, height)] of the visible windows of the Audacity class; a dialog with no title is listed as '(untitled)'."""
        if sys.platform == "win32":
            return []
        out = []
        try:
            for wid in self._x11("xdotool", "search", "--onlyvisible", "--class", "audacity").split():
                title = self._x11("xdotool", "getwindowname", wid).strip() or "(untitled)"
                geo = dict(line.split("=") for line in self._x11("xdotool", "getwindowgeometry", "--shell", wid).split() if "=" in line)
                out.append((wid, title, int(geo["X"]), int(geo["Y"]), int(geo["WIDTH"]), int(geo["HEIGHT"])))
        except (OSError, subprocess.TimeoutExpired, KeyError, ValueError):
            pass
        return out

    def windows(self):
        """Titles of the visible Audacity windows, to name a dialog (Linux only); the project window is first."""
        return [f"{title} ({w}x{h})" if title == "(untitled)" else title for _, title, _, _, w, h in self.window_list()]

    def dialogs(self):
        """The visible windows that are not the project window: any window much smaller than the largest one."""
        wl = self.window_list()
        if not wl:
            return []
        biggest = max(w * h for _, _, _, _, w, h in wl)
        return [x for x in wl if x[4] * x[5] < biggest * 0.6]

    def click_dialog(self, x_frac=0.88, y_frac=0.77, title_part=None):
        """Click the OK button of the dialogs on screen (or of the one whose title contains title_part): lower right of the box, where the default
        button of Audacity's message boxes sits. Never `Return`: it presses the focused control, which can be a details toggle. An error
        box can sit over a progress window, so every dialog is clicked, topmost last drawn first. Returns True when a click was made."""
        clicked = False
        for _, title, x, y, w, h in reversed(self.dialogs()):
            if title_part and title_part not in title:
                continue
            subprocess.run(["xdotool", "mousemove", str(x + int(w * x_frac)), str(y + int(h * y_frac)), "click", "1"], timeout=10, check=False)
            clicked = True
            time.sleep(0.3)
        return clicked

    def click_window_button(self, title_part, x_frac=0.5, y_frac=0.85):
        return self.click_dialog(x_frac, y_frac, title_part)

    def run(self, *argv, timeout=120):
        return subprocess.run([str(a) for a in argv], capture_output=True, text=True, timeout=timeout, check=False)

    def finish(self):
        failed = [s for s in self.steps if s["status"] == "FAIL"]
        result = {
            "id": self.id,
            "title": self.title,
            "status": "FAIL" if failed else ("SKIP" if self.steps and all(s["status"] == "SKIP" for s in self.steps) else "PASS"),
            "seconds": round(time.time() - self.started, 1),
            "audacity": os.environ.get("NU_AUDACITY_VERSION", "unknown"),
            "runner": os.environ.get("NU_RUNNER_IMAGE") or platform.platform(),
            "platform": sys.platform,
            "steps": self.steps,
            "commands": [{"cmd": c, "ms": round(s * 1000), "status": st} for c, s, st in self.pipe.log[-400:]],
        }
        results = self.out / "results"
        results.mkdir(parents=True, exist_ok=True)
        (results / f"{self.id}.json").write_text(json.dumps(result, indent=1, default=str))
        self.pipe.close()
        return result


def run_one(test_id, out_dir, work_dir):
    entry = REGISTRY[test_id]
    t = Ctx(test_id, entry["title"], out_dir, Path(work_dir) / test_id)
    try:
        entry["fn"](t)
    except PipeError as exc:
        t.step("pipe", "FAIL", f"{type(exc).__name__}: {exc}")
        t.screenshot("failure")
        t.step("windows", "INFO", "; ".join(t.windows()) or "none listed")
    except Exception:  # noqa: BLE001 - a test bug or an unexpected Audacity answer is a failed row, not a crashed run
        t.step("exception", "FAIL", traceback.format_exc(limit=6))
        t.screenshot("failure")
    return t.finish()
