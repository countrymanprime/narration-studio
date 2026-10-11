---
paths:
  - "integrations/reaper/**"
---

# REAPER bridge: harness and in-REAPER checks

These are the `integrations/reaper` parts of workflow steps 2 and 4 in `CLAUDE.md`.

- **Impact scan (step 2).** `integrations/reaper` Lua is covered by the bridge harness (`integrations/reaper/tests`, Lua 5.4, [ADR 0066](../../docs/adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md)): find the harness tests for every command a Lua consumer touches, and treat a consumer with none as zero-coverage.
- **Verify (step 4).** When `integrations/reaper` changed, `pnpm check` runs the harness (a fake `reaper` driven through the file protocol, plus mutation checks): add a harness test first for every new or changed command. Manual verification inside REAPER is still needed for what a fake cannot prove (REAPER's own API behaviour): run it scripted on a copy of a project with an isolated `-cfgfile` and record it, and mark anything needing the owner or audio hardware as pending.
