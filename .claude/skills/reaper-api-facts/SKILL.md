---
name: reaper-api-facts
description: Writing or reviewing Lua that calls the ReaScript API in integrations/reaper, or deciding what REAPER does for a call? Where the behaviours this repo recorded from a real REAPER 7.80 are written down (item GUIDs and pointers, P_EXT, undo, markers and regions, fixed lanes, render keys, transport reads, in docs/reference/daw/reaper.md), how to guard a newer call, and how to check a new one in an isolated REAPER run. Load before using a ReaScript call the bridge does not use yet, or before changing a fake in integrations/reaper/tests.
---

# reaper-api-facts

## Why this exists

The bridge harness runs against a fake `reaper` table under `lupa` Lua 5.4 ([ADR 0066](../../../docs/adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md)). The fake proves the bridge's logic, not REAPER, and an agent that guesses a ReaScript return value writes a fake that agrees with the guess. `reaper-command-add` gives the steps for a command; this skill says how to look up and record what REAPER does, so a call is not guessed twice.

## When to use this

- A bridge command needs a ReaScript call that no `integrations/reaper/*.lua` file uses yet.
- A fake in `integrations/reaper/tests/fake_reaper.lua` or a `fake_fidelity_test.lua` case changes.
- You are about to write "REAPER does X" in a comment, doc or PR.

## Recorded behaviour

What REAPER was seen to do (item GUIDs and stale pointers, `P_EXT`, undo, markers and regions, fixed lanes, render keys, transport, the active project, startup) is in [the REAPER reference](../../../docs/reference/daw/reaper.md#what-reaper-was-seen-to-do), with the REAPER version, the method and the source note of each row. The fake must agree with it (`fake_fidelity_test.lua`).

## What to do

1. **Look in [the recorded behaviour](../../../docs/reference/daw/reaper.md#what-reaper-was-seen-to-do), then in its sources, before you write the call.** `docs/research/reaper-api-for-planned-commands.md` lists the reference text for the calls behind the planned commands. It is desk research (REAPER 7.38 reference through the Ultraschall copy, since `reaper.fm` is not reachable from a cloud session) and nothing in it has been run.
2. **Mark what you did not see.** A call not in the recorded behaviour is "pending" in your comment, test and PR, with who owns the check. Never write that something "works in REAPER" unless a recorded run says so (`docs-style` rule 9).
3. **Guard anything newer than REAPER 6** with `reaper.APIExists('Name')` and an error event ([version rules](../../../docs/reference/daw/reaper.md#version-rules)).
4. **Stay on the shared Lua subset** ([version rules](../../../docs/reference/daw/reaper.md#version-rules), [ADR 0066](../../../docs/adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md)).
5. **Check a new behaviour in an isolated run, and record it.** Follow [the verification pass](../../../docs/operations/reaper-verification-pass.md) rules and the spikes in `integrations/reaper/spikes/` (README there, driver `run-reaper.ps1`):
   - Open only a **copy** of a project, with `reaper.exe -cfgfile <temp>\reaper.ini -nosplash -newinst -noactivate`, so the owner's settings and projects are never read or written.
   - Call `reaper.Audio_Quit()` first and assert `Audio_IsRunning() == 0`; assert that `GetResourcePath()` is the scratch folder before anything else runs.
   - Name each action by ID **and** expected text (`kbd_getTextFromCmd` against `SectionFromUniqueID(0)`) and stop if the text differs, so a renumbered action cannot run something else.
   - Write the report after every stage, so a later step that hangs on a dialog does not lose the earlier findings.
   - Never arm, record or play. Anything that needs an audio device, a mouse-driven action or the owner's ears is pending and goes on the owner's list.
6. **Write the result down, then correct the fake.** Add a dated `docs/research/` note (the S0, S5 and S7 notes are the model: what it settles, method, findings, pending), add its row to [the recorded behaviour](../../../docs/reference/daw/reaper.md#what-reaper-was-seen-to-do), add a case to `fake_fidelity_test.lua` that pins the observed value, and only then change `fake_reaper.lua`.
7. `reaper-command-add` for the command itself, `lua-reviewer` for the review, then `full-verification-gate`.

## What this skill is not

It is not the ReaScript reference: read REAPER's own help (Help, ReaScript documentation) for a signature. It does not replace the harness, the owner's verification pass or the recorded in-REAPER checks. It does not promote a command from Experimental; only the owner's pass does.
