# `arm_lane` in a real REAPER (2026-11-13)

**What it settles:** the Booth's lane choice while no take runs (`arm_lane`, #3429) arms the chosen voice, disarms the others and leaves the lane armed after a take.

**Method:** `scripts/ci/real-reaper/run-linux-check.sh` with `NARRATION_CI_ONLY=booth_voices`, REAPER 7.82 on Linux under xvfb, JACK dummy device (recorded silence), scratch `-cfgfile`. Scenario `arm_lane_keeps_the_choice` in `scenarios_booth_voices.py`.

**Findings:**

- With "Narrator" armed by hand, `arm_lane` for the voice "Veyra" (a child of a folder) answered `ARMED` for Veyra, and the track list afterwards had only Veyra armed (folder, Narrator, Drone and the next chapter unarmed).
- A second `arm_lane` for the same voice answered `changed` 0.
- After `record_start` and `record_stop` on Veyra, Veyra was still the only armed track. `arm_only` in the same file puts the narrator's earlier arms back at the stop; `arm_lane` does not.

**Pending:** the Booth's own flow against a real REAPER (the owner's pass, row A4b of the [verification pass](../operations/reaper-verification-pass.md)), and Windows.
