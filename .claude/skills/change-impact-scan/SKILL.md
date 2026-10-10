---
name: change-impact-scan
description: Before changing a file shared across tools (narration_common, integrations/reaper, apps/ui components), find every consumer and its existing test coverage so the change doesn't silently break something else.
---

# change-impact-scan

## Why this exists

This repo shares code across independent tools: `libs/python/narration_common` is imported by multiple `sidecars/*` packages, `integrations/reaper` Lua is loaded by the Reaper UI bridge, and `apps/ui/src` components are reused across pages. A change made in service of one feature routinely breaks a caller nobody thought to check, because nothing forces a look at who else depends on the file before it's edited. This skill is that look.

## When to use this

Before implementing a change that touches:
- `libs/python/narration_common/**`
- `integrations/reaper/**`
- `apps/ui/src/components/**` or any module imported by more than one page
- Any file whose name or location suggests it's a shared or common module rather than something owned by a single tool

Skip it for changes fully contained inside one tool's own directory (e.g. `sidecars/transcript-compare/core/` internals) with no shared exports touched.

## What to do

1. Identify the exact files, functions, and exported symbols the planned change will touch.
2. Grep the **whole repo**, not just the immediate package, for consumers:
   - Python: `from narration_common...` / `import narration_common...`, plus direct references to the changed symbol names.
   - Lua: references to the changed function/module across `integrations/reaper/**` and anything that shells out to it.
   - UI: import statements referencing the changed component/hook/util across `apps/ui/src/**`.
   - Go: importers of the changed package across `apps/desktop`, every `bindings_*.go` that exposes it, and the `*_contract_test.go` files.
   - Sidecars: callers in the host (`apps/desktop/internal`) that launch the sidecar or read its output.
   - Payloads: if the change touches the shape of anything that crosses a boundary, follow `wire-contract-change`.
3. For each consumer found, check whether an existing test actually exercises it:
   - Python consumers → look for a corresponding test in `libs/python/tests/` or the sidecar's own `tests/`.
   - UI consumers → look for a vitest unit test or a Playwright spec under `apps/ui/tests/`.
   - Go consumers → look for a `_test.go` in the same package or a contract test.
   - Lua consumers → the bridge harness in `integrations/reaper/tests` covers bridge commands ([ADR 0066](../../../docs/adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md)). Find the harness tests for every command the consumer touches; a consumer with none is **zero coverage**. REAPER's own API behaviour is never covered by the fake.
4. Report the impact before writing code: list each consumer, whether it has coverage, and which consumers have none. Don't proceed silently past a zero-coverage consumer — say so explicitly and ask whether to add a regression test first or accept manual verification later (via `full-verification-gate`). If the change widens an interface or adds a dependency across a package or port, run `solid-design-review` pass 1 on the plan.
5. If the consumer list turns out to be empty (change is genuinely isolated), say that too — it's a valid finding, not a reason to skip the scan.

## What this skill is not

It doesn't write the tests or fix the code — it produces the map of blast radius and coverage gaps that `full-verification-gate` and the implementation itself should act on.
