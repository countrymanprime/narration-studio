# Arming and monitoring in a real REAPER (2026-11-16)

**What it settles:** what REAPER's input-monitoring value (`I_RECMON`) holds and costs, and that `arm_lane` with `monitor` and `monitor_restore` (#3428, the Booth arming its voice on entry) turn monitoring on only where it is off and put back only what they changed.

**Method:** `scripts/ci/real-reaper/run-linux-check.sh` with `NARRATION_CI_ONLY=booth_voices`, REAPER 7.82 on Linux under xvfb, JACK dummy device (recorded silence), scratch `-cfgfile`. Scenario `arm_lane_monitors_and_restores` in `scenarios_booth_voices.py`. Every value below is one the scenario read; nothing is from memory.

**Findings:**

- `I_RECMON` reads back what `SetMediaTrackInfo_Value` set, for 0, 1 and 2 (off, on, and on-but-silent-while-recording, REAPER's "auto").
- A track the CI helper inserted read **1**, not 0. The scenario therefore sets every value before it changes anything, and the Lua never assumes 0.
- Setting `I_RECMON` added no undo point (`Undo_CanUndo2` was empty before and after), left `IsProjectDirty` at 0 and left `GetProjectStateChangeCount` where it was (154 before and after arming with `monitor` and putting back). Editing's re-read, which follows the change count, is not triggered by arming or monitoring.
- `arm_lane` with `monitor` on a lane at 0 answered `ARMED` with `monitored` 1 and only that lane's value changed. On a lane at 2 it answered 0 and left it at 2. Moving the lane put the earlier lane back to 0 and kept the lane the narrator already monitored.
- `monitor_restore` answered `restored` 0 and `kept` 1 for a lane the narrator switched to 2 after the bridge turned it on, and left it at 2. After an ordinary put-back the ledger file in REAPER's resource folder was gone.
- With a take running on the monitored lane, `arm_lane` with `monitor` was refused (`ERROR`, nothing changed), and `monitor_restore` answered `waiting` 1 and touched nothing; the monitoring went back to 0 on the first tick after the stop.

**Pending (owner):** a live microphone and an audio device, to hear that the narrator is monitored when they enter the Booth and that the monitored voice stops sounding after leaving; monitoring while a voice switches during a take (`switch_voice` does not turn monitoring on for the voice it moves to); Windows; the ledger after a real REAPER crash (the harness reads a leftover file, not a killed process).

**Known limits:**

- A narrator who switches a monitored track off and on again by hand leaves it reading 1, the value the bridge set, so it cannot tell that track from its own and puts it back to off when the Booth is left.
- The ledger file and the rows in memory live in REAPER. If the app crashes (not REAPER), the monitoring stays on until the next Booth entry and leave, or until REAPER restarts and the bridge's first tick reads the file.
- A row for a track that was deleted, or is in another project tab, stays on the ledger until REAPER restarts, since the two cannot be told apart.
