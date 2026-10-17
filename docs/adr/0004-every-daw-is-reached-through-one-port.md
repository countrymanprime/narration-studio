# 0004. Every DAW is reached through one port

**Status:** Accepted
**Significance:** An interface between parts. The review, recording, marker and region workflows are written against one DAW port; changing it, or letting callers name an engine, touches every workflow and every engine adapter.
**Date:** 2026-09-19

## Context

The narrator works in REAPER or Audacity. REAPER is scriptable only from inside itself (ReaScript, Lua); Audacity only through its scripting pipe. Workflows (review, punch-and-roll, regions, recording) must not care which engine is running, and unverified behaviour must be able to ship switched off.

**Considered options:** REAPER's web or OSC interfaces, or a native extension (a loopback surface or a binary to ship and trust); a DAW-specific code path per workflow (every workflow forks per engine).

## Decision

- `apps/desktop/internal/dawport` is the only way the host reaches an audio engine. An adapter declares a level per capability (`Unsupported`, `NotYetAvailable`, `Experimental`, `Supported`) and implements one small role interface per capability it has. `dawport.Resolver` alone decides what is available, from the declaration, runtime state and the per-capability setting. Callers ask the resolver for a role and handle a not-supported answer; they do not branch on a DAW's kind.
- **REAPER** is a Lua ReaScript bridge over a file protocol: the host writes atomic command files and reads an event log; the Lua polls from a `reaper.defer` loop. There is no loopback server, REST endpoint, OSC socket or native extension. Lua keeps only what a running REAPER alone knows (selection, cursor, take markers, item extension data, regions, undo); anything derivable from the saved `.rpp` stays in Go.
- **Audacity** is its own adapter over `mod-script-pipe`, built from the published spec.
- The Lua bridge is tested by a harness against a fake `reaper` under Lua 5.4; what only REAPER can prove is checked in a scripted REAPER run and the fake is corrected to match.
- A command built before the owner's verification pass is refused by the host while the experimental switch is off.

## Consequences

- A new capability is a role interface, an adapter method per engine and a level declaration; a new engine is an adapter.
- REAPER-only services with no Audacity equivalent keep using the bridge client directly; that exception is deliberate.
- Moving REAPER to OSC, web or an extension, or letting a workflow bypass the port, needs a new ADR.
