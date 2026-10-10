# Lua comments (REAPER)

Source: [LuaLS annotations](https://luals.github.io/wiki/annotations/).

- Each file opens with a header comment saying what it does, which bridge commands it adds, who loads it, and the doc that holds the contract (`docs/architecture/reaper-bridge.md`). `integrations/reaper/narration_pickups.lua` is the model.
- Use LuaLS annotations on functions other files call: `---@param name type`, `---@return type`, `---@class`, `---@alias`. Mark optional values with `?`.
- A comment says why, not what: the REAPER API quirk, the undo behaviour, the stale rule. Name the REAPER call and what it does in practice.
- A REAPER behaviour you verified by hand goes in `docs/operations/reaper-verification-pass.md` or `docs/architecture/reaper-navigation.md`, not only in a comment. Mark anything not yet verified inside REAPER as pending.
- A new or changed bridge command also updates the command table in `docs/architecture/reaper-bridge.md` and `apps/desktop/internal/bridge/wire.go`, and needs a harness test first (ADR 0066).
- Checks today: StyLua and the bridge harness. No annotation check (`lua-language-server --check`) runs yet.
