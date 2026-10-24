# REAPER: the undo point a recording leaves, and undoing a Booth take

**Status: done, 2026-10-23 and 2026-10-24. Observed in REAPER 7.82 on Linux (`linux-x86_64`) under xvfb with the JACK dummy audio device; a different version or platform may differ.** Asked for by item 9 of [#2251](https://github.com/countrymanprime/narration-studio/issues/2251): the app's Undo after a Booth recording said "Nothing to undo" and never reached REAPER.

## What it settles

| Question | Answer |
| --- | --- |
| Does a recording add an undo point, and when? | Yes, one, labelled **"Recorded media"**, as the stop happens. `Undo_CanUndo2(0)` names it and `GetProjectStateChangeCount(0)` has risen by one when `record_stop` reads them in the same call that stopped the recording. While the recording ran, the count did not move and the top label was unchanged. |
| Do arming and putting the arms back add a point? | No. The count after `arm_only` equals the count before it, and the only point after the stop is "Recorded media". |
| Does one Undo take a take away? | Yes. One `Undo_DoUndo2(0)` answered 1 and removed the recorded item; the history was then empty and `Undo_CanRedo2(0)` named "Recorded media". |
| A take recorded over an earlier item | With the default overlap setting, the take split a 0 to 5 s item into three (0 to 2 s; the take as a second take of 2 to 3.66 s; 3.66 to 5 s). One `Undo_DoUndo2` put back the one 5 s item with one take. |
| Does an Undo change the change count? | Yes, it rose by one (8 to 9, then 10 to 11 after the second take's undo). |
| A recording the app did not start | Not settled here: the probe's own recording armed nothing, so REAPER recorded nothing and added no point. The harness models a narrator's recording as another "Recorded media" point. |

## What the bridge does with it

The label is REAPER's own text, and a REAPER language pack may translate it, so the bridge does not fix it in its label table. `narration_transport.lua` reads the change count at `record_start` and, at the stop (`record_stop`, or the narrator's Stop in REAPER), the count and the top label. `RECORD_STOPPED` and `RECORD_ENDED` report the rise as `undoPoints`. `narration_undo.lua`'s `record_take` kind treats the take as REAPER's last action only while both the count and the top label are still what they were right after the stop. It undoes at most the take's points, then forgets the take. The label is never written to `events.log` (threat model row 5f).

## Method

- REAPER 7.82 Linux tarball, SHA-256 `a4aa961534f22ae5ae910e4ec0c200dcb4476c9f7556806fe09a9743cd582563` (the pin in `scripts/ci/real-reaper/run-linux-check.sh`), run through that script's steps: xvfb, `jackd -r -d dummy -r 48000 -p 1024`, `-nosplash -newinst -cfgfile <scratch>/reaper.ini` with `promptendrec=0`, a scratch project, the real bridge loaded by `spikes/ci_real_reaper_launcher.lua`.
- 2026-10-23: a one-off probe scenario (not committed) armed Chapter 1 with `arm_only`, recorded about 1.5 s with `record_start` and `record_stop`, and read `Undo_CanUndo2`, the change count and the item count before arming, after arming, while recording, at the stop and one second later. It then undid, and repeated the take over the earlier item.
- 2026-10-24: the committed scenario `undo last: the take the app recorded is REAPER's last action ...` in `scripts/ci/real-reaper/scenarios_transport.py` passed. It covers `undoPoints` 1 on `record_stop`, `last_action record_take` answering `this`, one `undo_last record_take 12` undoing exactly 1 point and rejoining the split item, a second undo doing nothing, and a narrator's later undo block making `last_action` answer `other` and `undo_last` undo nothing. The whole Linux suite passed with it (60 rows).
- What is recorded is silence. Nothing was played to a speaker or heard.

## Pending

- Windows REAPER and a real audio device: the owner's pass, row C17b of [the verification pass](../operations/reaper-verification-pass.md#part-c-the-studio-next-daw-commands-not-scripted-yet).
- A REAPER with a language pack: whether the label is translated. The bridge does not depend on it, but nobody has run one.
- A take with a roll in real REAPER: the harness models one "Recorded media" point per stop, and the roll's stop as one more. The real-REAPER roll scenarios pass, but none of them undoes a rolled take.
