# 0810. A DAW call answers one result object, and a capability reports whether it is destructive and its mode

**Status:** Accepted (owner ruling 2026-10-11; ADR row A7 in the [ADR register](../prds/studio-next-adr-register.prd.md))
**Date:** 2026-10-11
**Supersedes:** none. It extends the wire shapes of [ADR 0302](0302-dawport-roles-exchange-the-bridges-own-types-through-aliases-and-an-asynchronous-role-is-one-method-per-command.md) and keeps [ADR 0300](0300-every-daw-is-reached-through-one-port-of-small-role-interfaces-and-callers-ask-a-resolver-what-it-supports.md)'s port and resolver.

## Context

The Studio Next mock (`docs/research/mockups/studio-next/src/domain/daw.ts`) answers every DAW call with one `DawResult` (`ok`, `changed`, `message`, `undoSteps` from 0 to 12, optional `refused` and `steps`) and gives a capability two fields the repo's `DawCapabilitySupport` lacks: `destructive` (using it replaces audio that cannot be brought back, so ask first) and `mode` (`native`, `app` or `steps`). The repo has no common result: roles return typed values and errors, and each binding maps them to its own result type. The DAW PRD (`studio-next-daw-ports-and-capabilities.prd.md`, Phase 2) asks for the result object and the two fields on the wire before any command returns them, so the command slices add no wire work.

The mock and the repo differ in two places. The mock's `reason` is a free string and its levels are camel case; the repo's `reason` is an enum beside a whole-sentence `message`, and its levels are snake case. The process default of 2026-10-11 keeps the repo's shapes.

## Decision

1. **One result type.** `dawport.Result` (`apps/desktop/internal/dawport/result.go`) is `{ok, changed, message, undoSteps, refused?, steps?}` on the wire, the mock's `DawResult` key for key. `OK(message, changed)` adds one undo step for a change and none otherwise; `WithUndoSteps` sets another count, held to 0..`MaxUndoSteps` (12); `WithSteps` lists a multi-step change's edits in order. `Refused(reason)` is not ok, changes nothing, adds no undo step and repeats the reason as `message`. `RefusedFrom(err)` maps a `*port.NotSupportedError` (or a `*dawport.NotSupportedError`, which unwraps to one) to `Refused` with the refusal's own sentence, so no caller words a refusal. `refused` is free text, as in the mock: a refusal code such as `stale` is not part of this decision.
2. **Two capability fields.** `port.Support` gains `Destructive bool` and `Mode` (`port.Mode`: `native`, `app`, `steps`). An adapter declares them through the optional `dawport.Describer` interface (`Depth(c) Depth`), as it words refusals through `Explainer`; the resolver copies the declared depth into every `Support` for the capability, available or refused. `DawCapabilities` and `daw_capabilities_changed` (`apps/desktop/bindings_daw.go`) send `destructive` only when true and `mode` only when set.
3. **The wire keeps its shapes.** Levels and reasons stay snake case, `reason` stays an enum beside `message`, and the new fields are optional, so `hostAPIVersion` is not bumped. `apps/ui/src/api/schemas/daw.ts` adds `dawResultSchema` (rejecting `undoSteps` outside 0..12) and the two optional fields; the goldens `daw-result-ok.json`, `daw-result-refused-stale.json` and `daw-result-multi-step.json` are written by `result_test.go`.

## Consequences

- A command slice returns `dawport.Result` from its role and has its schema, goldens and refusal mapping already in place.
- The UI can ask before a destructive capability and show the steps a multi-step change made, from the capability payload and the result alone.
- No adapter declares a depth and no role returns a `Result` yet; until the catalogue and command slices do, the payloads are unchanged. The UI `DawClient` that reads them is separate work.
- Clamping `undoSteps` keeps a payload valid but hides an adapter that over-counts; the count is the adapter's to get right.
- A uniform refusal code (`stale`) would need a new ADR or an extension of this one, since `refused` is free text here.
