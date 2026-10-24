# REAPER: where its pre-roll lives, and what a punch with it does

**Status: done, 2026-10-24. Observed in REAPER 7.82 on Linux (`linux-x86_64`) under xvfb with the JACK dummy audio device; a different version or platform may differ.** Asked for by item 11 of [#2251](https://github.com/countrymanprime/narration-studio/issues/2251): "Pull the punch value from the DAW (REAPER can set it) so the two never disagree."

## What it settles

| Question | Answer |
| --- | --- |
| Where is REAPER's pre-roll kept? | In two configuration variables. `preroll` is a bit field: 1 is pre-roll on play, 2 is pre-roll on record. `prerollmeas` is the length in measures. A fresh configuration reads `0` and `2.00000000000000` through `get_config_var_string`. |
| Which action is it? | "Pre-roll: Toggle pre-roll on record" is 41819 and "Pre-roll: Toggle pre-roll on play" is 41818, named by `kbd_getTextFromCmd` against `SectionFromUniqueID(0)`. 41819 flips bit 2 of `preroll`, and `GetToggleCommandState(41819)` follows it. Toggling it added no undo point. |
| What does a recording with pre-roll on record do? | `record_start` answered at once with the play state at 5. Playback started before the cursor, and the recorded item began at the cursor. |
| How far before the cursor? | From the bar line at or before (cursor − length). At 120 BPM in 4/4 (a measure is 2 s): 1 measure from 9 s started at 6 s; 1.5 from 10 s at 6 s; 0.5 from 10 s at 8 s; 2 from 9 s at 4 s; 1 from 10 s at 8 s; 0 from 10 s at 10 s. The lead-in is therefore between the length and the length plus one measure. |
| Can a script set them? | `set_config_var_string(name, value, n)` took a third, number argument (it raised an error without one; 0 and 64 both worked), answered 1 and read back as set. The bridge does not use it: changing a REAPER preference is outside what the bridge may do (SECURITY.md). |
| What does the app's own pre-roll do in the Booth? | Nothing. The Booth's punch-in calls `punch_to` with no pre-roll, and a roll records from the current time; only `TeleprompterPunch`, which no page calls, reads `Teleprompter.punch_preroll_seconds`. The lead-in a narrator hears is REAPER's. |

## What the app does with it

`narration_preroll.lua`'s `punch_preroll` reads both variables and the length of one measure at the edit cursor (`TimeMap_GetTimeSigAtTime`). The Booth's Levels menu shows them with a DAW that declares the capability, and says the length and switch are set in REAPER. The app's seconds setting stays for an engine with no pre-roll of its own.

## Method

- REAPER 7.82 Linux tarball, the pin in `scripts/ci/real-reaper/run-linux-check.sh`, run through that script's steps: xvfb, `jackd -r -d dummy`, an isolated `-cfgfile` with `promptendrec=0`, a scratch project, the real bridge.
- One-off probes (not committed) read the variables and the action texts, toggled 41819, set the variables, recorded at six length and cursor pairs, and sampled `GetPlayPosition` after `record_start`.
- The committed scenario `punch pre-roll: reads REAPER's pre-roll and never changes it ...` in `scripts/ci/real-reaper/scenarios_transport.py` passed. It changes the variables only through the test hook, and puts them back afterwards.
- What is recorded is silence. Nothing was played to a speaker or heard.

## Pending

- Windows REAPER and a real audio device: row C19 of [the verification pass](../operations/reaper-verification-pass.md#part-c-the-studio-next-daw-commands-not-scripted-yet), with the owner.
- A tempo or time-signature change inside the pre-roll: the measure length is read at the cursor only.
- Where REAPER's own window shows the length. This was not looked up; the menu names only the verified action text.
