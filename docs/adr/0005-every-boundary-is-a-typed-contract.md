# 0005. Every boundary is a typed contract

**Status:** Accepted
**Significance:** An interface between parts and a quality attribute. Go, Python, Lua and the UI exchange data that nothing compiles across; the contract rule is what keeps them in step, and relaxing it lets drift reach narrators silently.
**Date:** 2026-09-21

## Context

Four languages exchange payloads: Wails bindings and events between Go and the UI, JSON between the host and the sidecars, event lines from REAPER's Lua, and files the host reads back. No compiler spans them, and a shape that drifts fails on a narrator's machine, not in the build.

**Considered options:** hand-written types only (drift unnoticed); generating one schema for every language (no single tool covers Go, Python, Lua and TypeScript here); validating nothing and trusting the sender (a wrong shape renders nonsense).

## Decision

- A payload that crosses a boundary has a **schema**, a **golden file** produced by a host or sidecar test and committed under `tests/fixtures/contracts/`, and a **row in the contract table** (`docs/architecture/wire-contracts.md`). Adding or changing a binding, event, persisted file, sidecar output or REAPER event changes all three in the same pull request (`wire-contract-change`).
- The UI validates payloads where they cross, with Zod behind one helper (`parseWire`) in `apps/ui/src/api/`; a wrong shape fails loudly, by payload class, and the error names paths and rules, never values.
- Go validates what Go reads (persisted files, sidecar output, REAPER events) with small checks and a version policy; a file with a newer schema version than the host knows is preserved, never overwritten.
- An event's vocabulary is part of its contract. `hostAPIVersion` changes on a removal, rename, retype or newly required field, not on an additive one.

## Consequences

- A shape change costs a schema, a golden and a table row, and breaks the contract tests when any one is missed.
- Schemas are lenient on unknown inbound keys so a newer sidecar still loads; the contract tests are strict, so drift is caught in both directions.
- Replacing the validation library or the golden-file approach is a new ADR.
