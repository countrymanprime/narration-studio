"""Smoke test for rig.sh: the real host reads a seeded project through a real REAPER, Editing finds the chapter's audio, and a Record press in the Booth reaches REAPER.

Run after `rig.sh up <work> --items 3` (flat layout, three takes on the chapter's track) with the rig's env sourced and the system Python that has pyatspi:

    . <work>/env.sh && /usr/bin/python3.12 scripts/dev/real-app/rig_smoke.py

Steps: dismiss the first-run dialogs; Editing > Jump to > Chapters > Chapter One, where the no-audio banner (its **Read again** button) must not show
because the seeded track holds takes; Booth > Next chapter > Record, where REAPER's events.log must show ARMED then RECORD_STARTED for the chapter's
track. The Booth drops the take at once when no speech model is installed (docs/operations/real-app-driver.md); the press reaching REAPER is what this checks.
"""

import os
import time
from pathlib import Path

import real_app as r

events = Path(os.environ["NS_SESSION"]) / "events.log"


def press(name, role="push button", timeout=3.0):
    try:
        r.click(r.find(role, name, timeout=timeout))
        return True
    except LookupError:
        return False


def dismiss_dialogs():
    for _ in range(3):
        press("DON’T ASK FOR THIS PROJECT")
        time.sleep(1.5)
        press("NOT NOW")
        time.sleep(1.5)


# The first-run dialogs hide the navigation until they are dismissed.
r.find("push button", "NOT NOW", timeout=60)
dismiss_dialogs()
r.find("push button", "BOOTH", timeout=30)

# Editing, Chapter One (the Jump menu is the way to a chapter on this page).
r.click(r.find("push button", "EDITING"))
time.sleep(4)
press("Close")
r.click(r.find("push button", "Jump to or run…, Ctrl K"))
time.sleep(1.5)
r.click(r.find("list item", "Chapters 4 ›"))
time.sleep(1.5)
r.click(r.find("list item", "Chapter One"))
r.find("entry", "Script with what was heard", timeout=20)
time.sleep(5)
assert not r.find_all("push button", "READ AGAIN"), "Editing shows the no-audio banner for a chapter whose track holds takes"

# Booth: a Record press reaches REAPER.
before = events.stat().st_size
r.click(r.find("push button", "BOOTH"))
time.sleep(3)
press("Close")
r.click(r.find("push button", "Next chapter"))
time.sleep(3)
r.click(r.find("push button", "RECORD"))
deadline = time.time() + 15
tags = []
while time.time() < deadline:
    tags = [line.split("|")[0] for line in events.read_bytes()[before:].decode().splitlines()]
    if "RECORD_STARTED" in tags:
        break
    time.sleep(0.3)
assert "ARMED" in tags and "RECORD_STARTED" in tags, f"the Record press did not reach REAPER: {tags[-8:]}"
print("rig smoke: ok (Editing found the audio; Record press reached REAPER)")
