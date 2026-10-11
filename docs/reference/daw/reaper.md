# REAPER: what the app relies on

Engine facts the REAPER adapter depends on, as of 2026-10-10. The last version a scripted run was made on is REAPER 7.80 ([spike S6](../../research/reaper-spike-s6-daw-reachability.md)). Each fact names where it was found. A fact with no run behind it says so.

## How the app reaches REAPER

- **A file protocol, not a server.** The Lua bridge polls a `commands/` folder from a `reaper.defer` loop and appends results to `events.log`. There is no loopback port ([the bridge](../../architecture/reaper-bridge.md#the-file-protocol), [ADR 0031](../../adr/0031-reaper-integration-is-a-lua-file-bridge-verified-by-hand.md)).
- **One action starts everything.** The narrator imports `NarrationUtils_Launcher.lua` into REAPER's action list. It starts the app with the session folder, project and `--daw REAPER` ([DAW integration](../../architecture/daw-integration.md#reaper-rules)).
- **The Lua can be older or newer than the app.** The narrator imports it, so a request the older script cannot serve comes back to the narrator as the host's `script_outdated` refusal, and `ping` reports whether the script knows the navigation commands ([going to and looping a finding](../../architecture/reaper-navigation.md)).
- **The saved project needs no running REAPER.** The Go `tracks` package parses the `.rpp` directly ([Tracks](../../utilities/tracks.md)).
- **The app can find and start REAPER.** It reads the Windows Uninstall registry key and falls back to the `.rpp` file association. REAPER 6.80 and later run a script given as a startup argument with the project already open, confirmed on REAPER 7.80 ([ADR 0092](../../adr/0092-reaper-executable-discovery-heartbeat-mechanism-and-script-plus-project-launch-are-resolved.md)).

## Behaviour that a fake cannot prove

The harness runs the bridge against a fake `reaper` table under Lua 5.4 ([ADR 0066](../../adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md)). These facts come from runs in REAPER:

| Fact | Where it was found |
| --- | --- |
| Item extension data written under a namespaced key survives save and reload; what it does on split and copy is recorded there | [Spike S0](../../research/reaper-spike-s0-item-extension-data.md) |
| Render settings keys, the predicted render targets, and what a render needs to run | [Spike S5](../../research/reaper-spike-s5-render-details.md) |
| Which launch paths reach a running REAPER, and the heartbeat mechanism | [Spike S6](../../research/reaper-spike-s6-daw-reachability.md) |
| Fixed-lane semantics: which lane plays, and the exclusive, with-others and silent modes | [Spike S7](../../research/reaper-spike-s7-fixed-lanes.md) |

## Documentation and research, not run in REAPER

| Subject | Page |
| --- | --- |
| How far the play position the narrator hears trails the position REAPER processes: what the scripting community knows, to be measured by row A9b of the verification pass | [Transport timing](../../research/reaper-transport-timing.md) |
| The ReaScript calls behind each planned command, from the documentation and cross-checked against five third-party REAPER MCP servers read for approach only | [ReaScript calls](../../research/reaper-api-for-planned-commands.md) |
| A survey of the wider automation surface | [Automation surface](../../research/reaper-automation-surface.md) |

## Not yet available

`cut_range`, `fx_range`, `stack_takes` and `backups` are in the catalogue but not yet available with REAPER: the bridge has no command for them. Each command slice flips its own row to Experimental ([capabilities](capabilities.md#cut_range)).

## Version rules

- **Lua 5.4 subset.** No `goto`, no integer division, no bit operators: the code must run in REAPER 7's Lua and in the harness ([reaper-command-add](../../../.claude/skills/reaper-command-add/SKILL.md)).
- **An older REAPER may lack a function.** The fake can remove a function (`remove_api`) to model it; a command that needs a newer call must check that the function exists.
- **Versions tested.** Only REAPER 7.x has been run. Whether the bridge works on another major version has not been checked.

## Checking a capability in REAPER

[The REAPER verification pass](../../operations/reaper-verification-pass.md) is the procedure: Part A runs unattended on a copy of a project with an isolated `-cfgfile`, Part B needs the owner and an audio device. A command moves from Experimental to Supported only after the owner's pass ([ADR 0400](../../adr/0400-promoting-a-reaper-command-from-experimental-to-supported-is-a-one-line-daw-port-declaration-change.md)). The expected result of each row is in [capabilities](capabilities.md) and in the pass's own table.
