# 0092. REAPER executable discovery, heartbeat mechanism and script-plus-project launch are resolved

**Status:** Accepted
**Date:** 2026-09-22

## Context

A spike existed to answer three questions before open-project verification and launching the DAW could be scoped: can the app know
REAPER is running and which project is open, where is `reaper.exe`, and can REAPER auto-run a script when the app launches it?
`docs/research/reaper-spike-s6-daw-reachability.md` records the method and evidence in full: two isolated REAPER 7.80 runs
(`-cfgfile` under a temp folder, only a copy of `Challenges_001.rpp`, as the owner decided for REAPER spikes), plus a registry read
on this machine's real REAPER install. The earlier citation of the automation-surface note (`reaper-automation-surface.md:150`,
"a project and a script can be passed together, unverified") is now verified.

## Decision

- **Executable discovery (resolved).** `reaper.exe` is located via the Windows "Uninstall" registry key's `InstallLocation` value (both the native
  and `WOW6432Node` views), matching a `DisplayName` of exactly `REAPER` or `REAPER (<arch>)`; the `.rpp` file-association command
  (`Reaper.Project\shell\open64\command`) is the fallback when no Uninstall entry's location has a `reaper.exe` on disk. Both were
  confirmed against the real install (`REAPER (x64)`, `C:\Program Files\REAPER (x64)`). `apps/desktop/internal/daw` implements
  this (`LocateReaperExecutable`, Windows-only; `locate_other.go` reports "not found" elsewhere) and `Resolve(override, autoDetect)`
  lets a Settings override always win when it names a real file — auto-detect with a manual override, the owner's own
  recommendation. The Settings field and the detached-launch action that calls this were left to the launch work, not landed here.
- **Heartbeat (resolved).** `EnumProjects(-1, '')` returns the active tab's path for a saved project and the exact empty string (never
  `nil`) for an unsaved one — the spike confirms the evidence claim. A file-based heartbeat (one line, rewritten in
  place) is a viable mechanism with no new REAPER capability needed, but the recommended implementation is an
  `events.log` event instead of a second polled file: `apps/desktop/internal/bridge/events.go`'s fan-out already delivers any
  event whose run-ID field is empty to every subscriber regardless of `Owns` (`Subscription.wants`), which is exactly the
  broadcast shape a "REAPER is running, here is the open project" heartbeat needs. This decision does not add the Lua defer loop, the
  wire-table row, or the `daw.Reachable()`/`daw.CurrentProject()` consumer — that is the implementation's work, informed by this
  decision rather than left to guess at a mechanism. (It was built as the `PROJECT_STATUS` event, see `apps/desktop/internal/bridge/wire.go`
  and [ADR 0305](0305-the-daw-heartbeat-carries-the-transport-and-is-sent-at-once-when-it-changes.md).)
- **Script plus project launch (resolved).** `reaper.exe -cfgfile <cfg> "<project.rpp>" "<script.lua>"` runs the script automatically at REAPER startup
  with the project already open (confirmed on REAPER 7.80, both with and without a project argument). This unblocks an
  "auto-start the launcher when the app starts REAPER" flow. As the owner decided, that behavior ships behind a Settings toggle
  defaulting OFF, and only because this spike proved it works — this ADR records the technical proof, not a change to that
  policy gate.

## Consequences

- The launch work can now be scoped from real evidence (a working registry lookup, a named event-fan-out mechanism, a confirmed CLI
  form) instead of "unverified" or "needs a spike", which is what the spike's success signal ("a written decision") asked for.
- `apps/desktop/internal/daw` was new product surface landed ahead of the launch work that would call it end-to-end; it is fully
  unit-tested (`locate_test.go`, pure parsing/selection functions plus a `Resolve` precedence test) and was also run once against
  the real Windows registry on the development machine to confirm the integration, but had no caller yet and no Settings field.
- The `events.log`-event recommendation for the heartbeat is a design choice this ADR states in advance of its implementation; if
  that work finds a reason to prefer the polled-file heartbeat instead (for example, a case where an event cannot reach a subscriber
  that has not subscribed yet), that is a legitimate deviation to record in a new, superseding ADR rather than silently ignoring
  this one.
- Multi-tab REAPER sessions were not separately exercised beyond confirming `EnumProjects` enumerates exactly one tab in both spike
  runs (REAPER's own default); nothing observed suggests different behavior with more tabs open, but it was not directly tested.
