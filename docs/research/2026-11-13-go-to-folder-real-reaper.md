# `go_to` on a chapter folder in a real REAPER (2026-11-13)

**What it settles:** `go_to` on a folder track selects the folder and every track inside it and no other track, and `read_place` reads that selection back as the folder (#3427, the Booth moving the DAW to the chapter it goes to).

**Method:** `scripts/ci/real-reaper/run-linux-check.sh` with `NARRATION_CI_ONLY=booth_voices`, REAPER 7.82 on Linux under xvfb, scratch `-cfgfile`. Scenario `go_to_a_folder_selects_its_voices` in `scenarios_booth_voices.py`: a folder "Chapter 3" holding Narrator, Veyra and Drone, then a flat "Chapter 4".

**Findings:**

- After `go_to` on "Chapter 3" with `end`, `I_SELECTED` was 1 on the folder, Narrator, Veyra and Drone and 0 on "Chapter 4".
- `read_place` then answered the folder's GUID with 4 selected.
- `go_to` on "Veyra" with `at` selected only Veyra.

**Pending:** the Booth's own flow against a real REAPER (the owner's pass), nested folders in a real REAPER (the harness covers them), and Windows.
