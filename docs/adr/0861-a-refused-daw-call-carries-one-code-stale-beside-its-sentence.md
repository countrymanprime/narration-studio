# 0861. A refused DAW call carries one code, `stale`, beside its sentence

**Status:** Proposed
**Date:** 2026-10-11
**Supersedes:** none. It extends point 1 of [ADR 0810](0810-a-daw-call-answers-one-result-object-and-a-capability-reports-whether-it-is-destructive-and-its-mode.md), which left a refusal code open.

## Context

[ADR 0810](0810-a-daw-call-answers-one-result-object-and-a-capability-reports-whether-it-is-destructive-and-its-mode.md) made `refused` free text and said a uniform code such as `stale` would need a new decision. The Editing and Booth pages must tell "the DAW changed since the app read it" apart from every other refusal, so they can read the project again and say so. Today they could only match the sentence, and each host feature words its own: a take, a finding and a recording track each answer `reason: "stale"` (or `track_missing`) with a different sentence. The Studio Next mock (`docs/research/mockups/studio-next/src/domain/daw.ts`) gives a refusal a `code` for this, and the DAW PRD (`studio-next-daw-ports-and-capabilities.prd.md`, "Stale ids refuse") asks for one refusal code `stale` across features.

## Decision

1. **An optional `code`.** `dawport.Result` (`apps/desktop/internal/dawport/result.go`) and `DawResult` (`apps/ui/src/api/contracts/daw.ts`) gain `code`, sent only on a refusal the page branches on. `stale` is the only value (`dawport.CodeStale`, `DAW_REFUSAL_CODES`); `dawResultSchema` rejects any other, and a further value needs its own ADR.
2. **The sentence stays the narrator's.** `refused` and `message` keep the host's own sentence, unchanged; the code sits beside it and the UI never words a refusal from it. A page branches on `code: "stale"` to read the project again and offer "run the check again".
3. **Where it is set.** `RefusedStale(sentence)` is `Refused` with the code. `RefusedFrom` maps capability refusals only and never sets a code. The UI host adapter (`apps/ui/src/ports/daw.ts`) maps the existing host results whose `reason` is `stale` (`useTake`, `addMarker`) and a record start's `track_missing` to the code, leaving the host bindings and their sentences as they are. The mock answers its stale take and missing track the same; it has no stale finding to answer.
4. **Additive.** The key is optional, so `hostAPIVersion` is not bumped (ADR 0810 point 3).

## Consequences

- The Editing and Booth pages can react to a stale id without matching a sentence, and every DAW refuses it the same way.
- A refusal that should also be branched on (for example "recording") needs a new ADR to add a value; until then it carries no code.
- The mapping from host `reason` to code lives in the UI adapter until the host bindings return `dawport.Result` themselves; a binding that does so then answers `RefusedStale` instead.
