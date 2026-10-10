---
name: daw-capabilities
description: Which DAWs (REAPER, Audacity 3, Audacity 4) can do what, and what each capability should return. Load before designing, reviewing or verifying anything that talks to a DAW, adding a capability or an engine, or promoting a command from Experimental to Supported.
---

# daw-capabilities

## Why this exists

DAW knowledge was spread over dated research pages, a hand-kept table and the adapters' code, so a plan or a review had to rediscover what an engine can do and what a call should return. [docs/reference/daw/](../../../docs/reference/daw/README.md) holds it as reference, and a test keeps its matrix equal to the adapters' declarations. This skill says which page answers which question.

## When to use this

- Planning a feature that reads or changes something in a DAW.
- Reviewing a change under `apps/desktop/internal/dawport/`, `internal/bridge/` or `integrations/reaper/`.
- Deciding whether a capability can exist on Audacity.
- Writing or reading a verification-pass row.
- Adding an engine or a new engine version.

Skip it for a change that never reaches a DAW.

## What to do

Load only the page the question needs.

| Question | Read |
| --- | --- |
| Which engine supports X, at what level? | [matrix](../../../docs/reference/daw/matrix.md) |
| What should X return, and when must it refuse? | [capabilities](../../../docs/reference/daw/capabilities.md), the section for X |
| How does REAPER or Audacity actually behave? | [REAPER](../../../docs/reference/daw/reaper.md), [Audacity 3.x](../../../docs/reference/daw/audacity-3.md), [Audacity 4.x](../../../docs/reference/daw/audacity-4.md) |
| Why is a level what it is? | The ADR linked in the capability's section ([ADR 0300](../../../docs/adr/0300-every-daw-is-reached-through-one-port-of-small-role-interfaces-and-callers-ask-a-resolver-what-it-supports.md)) |

### Design a change

1. Find the capability. If one fits, the change is an adapter or bridge change, not a new capability.
2. If none fits, write the DAW-neutral section first: intent, role, the result a conforming engine returns, refusals, undo. Then decide each engine's level from the engine pages. An engine with no equivalent is a recorded gap in the section, not a silent omission.
3. A capability must be expressible without naming an engine. If the section cannot be written without "REAPER" in the result, the shape is wrong: raise it with the owner before building it.
4. Run `solid-design-review` pass 1: the role stays small, defined at the consumer, and callers ask the resolver, never the engine's kind ([DAW integration](../../../docs/architecture/daw-integration.md#the-daw-port)).

### Implement it

1. A new capability is a row in `dawport/capability.go`, a role interface in `roles.go`, a conformance case in `dawporttest`, and a section in `capabilities.md` in catalog order. The reference test fails until the section exists.
2. REAPER commands follow `reaper-command-add`; a changed payload follows `wire-contract-change`.
3. Declare the level honestly: Experimental until the owner's pass. Never Supported on a harness result alone.
4. Regenerate the matrix: `UPDATE_DAW_DOCS=1 go test ./internal/dawport/dawportdoc` from `apps/desktop`. Commit the diff and read it.

### Review a change

Check, per touched capability, that the code does what its section says: the events or return values, the stale and refusal behaviour, the undo rule, the approval rule for the two render capabilities. A difference is a bug in the code or an edit owed to the section; say which.

### Verify

The expected result of a check is in the capability's section and in the verification pass for that engine ([REAPER](../../../docs/operations/reaper-verification-pass.md), [Audacity](../../../docs/operations/audacity-verification-pass.md)). Update the section's "Checked" line with the run, its engine version and its date. A run that could not be made stays "not checked" or "pending with the owner".

## Rules for the reference pages

- Every statement about an engine names its source. Do not add an engine fact from memory; read the published page or run it, then cite it.
- An Audacity 4.x statement is bounded by the research date on [its page](../../../docs/reference/daw/audacity-4.md). Re-check before relying on it for a newer release.
- Follow `docs-style`; run `doc-unslop` on what you edit.

## What this skill is not

It does not decide where logic belongs (Go, a sidecar, Lua or the UI), and it does not run a verification pass. It does not cover providers other than DAWs (TTS, ASR, pronunciation): those have [provider ports](../../../docs/architecture/provider-ports.md) and need the same treatment when they get it.
