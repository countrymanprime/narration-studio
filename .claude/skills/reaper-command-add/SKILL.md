---
name: reaper-command-add
description: Adding or changing a REAPER bridge command or event in integrations/reaper? Harness test first, then Lua, the Go side, the event table, and a recorded in-REAPER check for what the fake cannot prove.
---

# reaper-command-add

## Why this exists

The Lua is imported into REAPER by the narrator, so it can be older or newer than the app. The bridge harness ([ADR 0066](../../../docs/adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md)) pins behaviour against a fake `reaper`, but a command that changes only one half, or whose fake is wrong, passes CI and fails in REAPER.

## When to use this

Adding, changing or removing a command in `integrations/reaper/*.lua` or the Go code that sends it (`apps/desktop/internal/bridge/`), or a new `events.log` event.

## What to do

1. `change-impact-scan`: find the harness test for every command a Lua consumer touches. A consumer with none is zero-coverage; say so.
2. Write the harness test first in `integrations/reaper/tests/<feature>_test.lua` (happy, error, stale, conflict and idempotent paths). Extend `fake_reaper.lua` only to match behaviour observed in REAPER.
3. Implement the command in its own feature file: it returns `function(registry)` and calls `registry.register(name, handler)`. Add the file to `FEATURE_FILES` in `narration_ui_bridge.lua` and to the shipped file list in `scripts/release/reaper-files.mjs`. A duplicate name is an error by design.
4. Update the name list pinned in `registry_test.lua`. Add lines to `tests/mutations.json` whose removal must fail the suite (stale GUID, overwrite without asking, undo point with nothing changed).
5. Go side: the sender and parser in `internal/bridge/`, with a test. A new event goes in the table in `internal/bridge/wire.go` with `wire_test.go` pinning the exact line the Lua harness pins (`wire-contract-change`).
6. Stay on the Lua that REAPER 7 and the harness share (Lua 5.4; no `goto`, integer division or bit operators). `stylua` formats it.
7. `pnpm check` runs the harness and the mutation check. What a fake cannot prove (what `P_EXT` does on save, split and copy, real return values, undo, render keys) is checked in a scripted REAPER run on a copy of a project with an isolated `-cfgfile`, recorded under `docs/research/` per `docs/operations/reaper-verification-pass.md`. Mark anything needing the owner or audio hardware as pending, and fix the fake if it was wrong.
8. A command that reaches the project or files is a trust boundary: re-read its row in `docs/architecture/threat-model.md`.

## What this skill is not

It does not replace the manual REAPER check, and it does not change the file-bridge decision (ADR 0031).
