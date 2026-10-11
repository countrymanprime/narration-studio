# 0400. Promoting a REAPER command from Experimental to Supported is a one-line DAW port declaration change

**Status:** Proposed
**Date:** 2026-09-26

## Context

Twelve REAPER bridge commands (`chapter_track_state`, `arm_only`, `record_start`, `record_stop`, `set_active_take`, `list_fx_chains`, `apply_fx_chain`, `list_fx`, `add_take_fx`, `create_regions`, `play_position`, `punch_to`) are built, harness-tested, and gated behind one bool, `DAW.experimental_reaper_actions`, read through `bridge.Actions`' `experimentalCommands` map (`apps/desktop/internal/bridge/actions.go:44-56`). `docs/operations/reaper-verification-pass.md` already describes how a command is verified and taken off that map, command by command, once the owner has run its rows in a real REAPER.

[ADR 0300](0300-every-daw-is-reached-through-one-port-of-small-role-interfaces-and-callers-ask-a-resolver-what-it-supports.md) (Proposed) replaces every direct read of `*bridge.Client`/`*bridge.Actions` with a role obtained from a `Resolver`, which combines an adapter's static `Declares() map[Capability]port.Level` with runtime state and a narrator's per-capability toggle. It intends promotion after the owner's verification pass to be a one-line declaration change, but nothing yet defined what that line is, or how it relates to the older `experimentalCommands` map, which the REAPER adapter's declarations copy exactly at first.

Left unreconciled, the two mechanisms could disagree: a command taken off `experimentalCommands` without its `dawport/reaper` declaration also changing would report `Supported` to some callers and be refused by `bridge.Actions` to others, or the reverse.

## Decision

Promoting a REAPER command from `Experimental` to `Supported` is exactly two edits, made together in one pull request:

1. In `apps/desktop/internal/dawport/reaper`'s adapter, change that capability's entry in `Declares()` from `port.Experimental` to `port.Supported`.
2. Remove the command's key from `bridge.Actions`' `experimentalCommands` map in `apps/desktop/internal/bridge/actions.go`.

No caller of the promoted capability changes, because every caller already reaches it through `dawport.Role[T](resolver, capability)`, never a concrete `bridge.Actions` method or a check of `bridge.Experimental(command)`. The booth actions are promoted one command group at a time (`track_state`, `regions`, `record` and `punch` together, then `silence_trim`/`item_gain`), each new caller gated in `CapabilityGate` ahead of its own promotion so the switch is invisible to the UI.

Until both edits land for a command, it stays `Experimental` in both places and the narrator sees no change from today (a guard test in `dawport/reaper` fails if the two maps' keys diverge). The two maps are retired independently: `bridge.Actions`' `experimentalCommands` empties out and is deleted once every command it ever gated has been promoted (`reaper-verification-pass.md`'s own closing rule); `dawport/reaper`'s per-capability declarations stay, because they also describe capabilities that were never behind that map (for example `review`, `navigate`, which were `Supported` from the start).

## Consequences

- A promotion PR is small, mechanical, and reviewable as "did the verification rows pass, and do these two lines match" — not a UI change, so it carries far less risk than the original feature work.
- The DAW port's hypothesis ("turning on punch alone in Settings enables 'Punch from here' and nothing else") is testable directly: flip the declaration, run the UI, and see only that one control change.
- A future command added to `bridge.Actions`' experimental set (there is no reason to expect one, since the port is now the front door) must add a matching `Experimental` entry to its adapter's `Declares()` in the same PR, or the guard test in `dawport/reaper` fails.
- If ADR 0300's shape changes before it is Accepted, this ADR's two-edit rule changes with it; a new ADR would supersede this one rather than editing it in place.
