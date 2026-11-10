# Lua standards

Scope: `src/studio/integrations/reaper`. The bridge rules are in `.claude/rules/reaper-bridge.md`; ReaScript behaviour is in `reaper-api-facts`.

## Enforced by tools

- StyLua (`stylua.toml`: 160 columns, 2-space indent, single quotes where they fit), run by the quality script.
- The bridge harness (`pnpm exec nx test reaper`): Lua 5.4, a fake `reaper` driven through the file protocol, with mutation checks. A command with no harness test counts as zero-coverage.
- Doc comments: see `docs-style/references/lua.md`.

## Judgement rules

1. **Stay small.** Lua keeps only what a running REAPER knows; thresholds and judgement live in Go (`docs/architecture/principles.md`, principle 10). A rule that does not need REAPER state does not go here.
2. **Locals only.** Declare every variable `local`. Expose a module as one table returned at the end, not as globals. Keep each file one concern, as the `narration_*.lua` modules do.
3. **Guard every REAPER call that can return nil or a newer API.** Guard a call newer than the REAPER version the bridge supports, as `reaper-api-facts` describes, and stay inside Lua 5.4.
4. **Errors.** Return `nil, message` for an expected failure and report it through the bridge reply. Use `pcall` around a REAPER call that can throw and always close an undo block you opened.
5. **Protocol.** Parse every incoming line defensively (a malformed line is counted and skipped, never a crash) and keep replies in the documented format; a change to either goes through `reaper-command-add`.
6. **Naming.** `snake_case` functions and locals, `UPPER_CASE` constants, files `narration_<role>.lua`.
7. **Tests.** Add a harness test for each new or changed command, plus a case for a malformed or missing argument. Verify what the fake cannot prove inside REAPER and record it.
