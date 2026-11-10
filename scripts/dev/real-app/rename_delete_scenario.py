"""The owner's rename and delete scenario (#3269) against a real host and a real REAPER: a track renamed or deleted in REAPER and not saved must show in the app.

Run after `rig.sh up <work> --layout voices2 --items 3` with the rig's env sourced and the system Python that has pyatspi:

    . <work>/env.sh && /usr/bin/python3.12 scripts/dev/real-app/rename_delete_scenario.py <rename|delete|renamenarrator|none> <tag>

`voices2` seeds Chapter One (linked) as a folder holding Narrator (with takes) and Alice, with the layout left Flat. The mode sends REAPER an unsaved
change (`ns_rename` / `ns_delete` in real_app_rig_launcher.lua: Alice to Bob, Alice deleted, or Narrator to Lead), waits for the app's next read of the tracks,
then opens the Booth's voice control and the Engine panel and saves a screenshot of each to /tmp/evr_<tag>_booth_popup.png and /tmp/evr_<tag>_engine.png.
AT-SPI cannot read the voice popup or the Engine track list, so the screenshots are the evidence; read them against the expected result:

- rename: the voice list and the Engine panel say Bob, and the chapter is still linked to its folder;
- delete: both lack Alice; the Booth still records on Narrator;
- renamenarrator: the list still has the renamed track on key 0, and no other voice's key moved.
"""

import os
import re
import subprocess
import sys
import time
from pathlib import Path

import real_app as r

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ci" / "real-reaper"))
from drive import Session

mode, tag = sys.argv[1], sys.argv[2]
session = Session(Path(os.environ["NS_SESSION"]))


def guid(n):
    """The seeded track n's GUID (seed.py numbers them from 1)."""
    return f"{{A0000000-0000-4000-8000-0000000000{n:02d}}}"


def press(name, timeout=3.0):
    try:
        r.click(r.find("push button", name, timeout=timeout))
        return True
    except LookupError:
        return False


def shot(name):
    xvfb = next(
        line for line in subprocess.run(["pgrep", "-fa", "Xvfb"], capture_output=True, text=True, check=False).stdout.splitlines() if "1440x900" in line
    )
    display = re.search(r"Xvfb (:\d+)", xvfb).group(1)
    auth = re.search(r"-auth (\S+)", xvfb).group(1)
    subprocess.run(["import", "-display", display, "-window", "root", f"/tmp/evr_{tag}_{name}.png"], env={**os.environ, "XAUTHORITY": auth}, check=True)


r.find("push button", "NOT NOW", timeout=90)
for _ in range(3):
    press("DON’T ASK FOR THIS PROJECT")
    time.sleep(1.5)
    press("NOT NOW")
    time.sleep(1.5)

if mode == "rename":
    print(session.ask("ns_rename", guid(3), "Bob", until={"NS_RENAMED"})[-1])
elif mode == "delete":
    print(session.ask("ns_delete", guid(3), until={"NS_DELETED"})[-1])
elif mode == "renamenarrator":
    print(session.ask("ns_rename", guid(2), "Lead", until={"NS_RENAMED"})[-1])
time.sleep(9)  # the app reads REAPER's tracks every 5 seconds

r.click(r.find("push button", "BOOTH", timeout=30))
time.sleep(3)
press("Close")
r.click(r.find("push button", "Next chapter"))
time.sleep(5)
voice = [n for n in r.find_all("combo box") if "oice" in (n.name or "")]
print("voice control:", [n.name for n in voice])
r.click(voice[0])
time.sleep(2)
shot("booth_popup")
chip = next(n for _, n in r.walk(r.app()) if n.getRoleName() == "push button" and n.name and "REAPER" in n.name)
r.click(chip)
time.sleep(6)
shot("engine")
print(f"screenshots: /tmp/evr_{tag}_booth_popup.png /tmp/evr_{tag}_engine.png")
