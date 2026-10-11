# Studio Next Domain, State and Wire Contracts: A Typed Store with Undo, Selectors, Schemas and a Mock-versus-Real Parity Kit

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); the mock's `studio-next/src/state/`, `studio-next/src/selectors/`, `studio-next/src/domain/` and `studio-next/src/fixtures/`; the owner's rulings of 2026-10-11 (see Decisions).

**Builds on:** [ADR 0069](../adr/0069-payloads-are-validated-with-zod-behind-parsewire-and-a-wrong-shape-fails-loudly.md) (Zod behind `parseWire`), [wire contracts](../architecture/wire-contracts.md), [ADR 0041](../adr/0041-host-bindings-read-project-services-through-one-snapshot-accessor.md) (host bindings read services through one accessor), the `NarrationApi` split into per-domain interfaces (`apps/ui/src/types.ts`) and the mock host (`apps/ui/src/api/mockApi.ts`), [ADR 0067](../adr/0067-bridge-commands-are-registered-by-name-and-each-feature-lives-in-its-own-lua-file.md).

**Status (2026-10-11):** draft; the owner's rulings of 2026-10-11 are applied. The store is a read-model cache plus a command journal (SN0-Q3); A5 and A6 record that and the undo rules, and are the first slices.

## Problem Statement

The mock has one place where every change goes (`act`), one history of undoable changes, selectors that derive every number a page shows, and fixtures that hold every sample value. The real app has none of that on the UI side: pages hold their own state, derive numbers inline, and undo is whatever each feature built (a toast button, a host undo block, a REAPER undo step). The owner's rulings need things only a shared model gives: one undo history across pages (with refusals that name why), numbers computed once (the same "decided and cleared" on Proof, Production and the rail), and mock data that cannot drift from the host. The mock defines how the UI behaves, not who owns the data: holding the whole book in the browser and patching it with immer would give the app a second source of truth next to the Go host.

## Evidence

- **Mock store.** `studio-next/src/state/store.ts`: `update(fn)`, `act(label, fn, {daw, restoreUi})` records inverse patches for the book (`data`) and for listed UI paths, `undoEntry` refuses when a later entry touches the same paths or when a DAW entry is no longer last, `setChangeGuard` for leave guards, `useStudio(selector)` over `useSyncExternalStore`, history capped at 40.
- **Mock domain.** `studio-next/src/domain/schemas.ts` (767 lines of Zod: chapters, paragraphs, notes, pickups, marks, bible, bookmarks, milestones, contract, stage decisions, cuts, word FX, backups), `studio-next/src/domain/daw.ts`, `studio-next/src/domain/extraction.ts`, `studio-next/src/domain/components.ts`.
- **Mock selectors and fixtures.** 30 modules in `studio-next/src/selectors/` (pure functions of the book); `studio-next/src/fixtures/` holds all sample data and `makeBook({headingStyle, chapters})`; `studio-next/tests/scenarios.test.tsx` renders every page with three heading styles and 40 chapters; `studio-next/tests/no-hardcoded-speakers.test.ts` fails on a literal in a component.
- **Real app.** Domain state lives in Go services and sidecar files ([ADR 0041](../adr/0041-host-bindings-read-project-services-through-one-snapshot-accessor.md)); the UI reads it through bindings checked by `parseWire`; pages keep state in hooks (for example `components/production/ProductionPage.tsx`, `components/proof/ProofPage.tsx`); `useApi()` returns the whole `NarrationApi` facade; mocks are per-domain files under `apps/ui/src/api/` and `api/mockHost/`; one Vitest file (`apps/ui/src/api/wireContracts.test.ts`, 3,103 lines) holds the contract rows.
- **Real undo.** `toast` Undo buttons per feature; auto links are undoable ([ADR 0202](../adr/0202-a-confident-two-way-match-is-a-real-link-labelled-auto-undoable-and-never-over-a-manual-one.md)); REAPER commands add one undo block each ([ADR 0233](../adr/0233-the-app-may-make-a-take-active-by-guid-in-one-undo-step.md)); the findings store keeps an append-only decision history ([ADR 0120](../adr/0120-findings-are-read-and-decided-through-four-generic-bindings-and-a-decision-carries-the-evidence-version-it-was-made-against.md)). Nothing spans them.

## Proposed Solution

1. **A read-model store, not a book.** `apps/ui/src/studio/` holds a small typed store of **read models** (what pages show: a production overview, a chapter's notes, the pickups list, bookmarks, the DAW capability and project state) hydrated through ports and kept fresh by the host's events (`job:ended`, `pickups:state`, `daw_capabilities_changed`). Selectors derive every shown number from read models. The Go host stays the source of truth.
2. **Commands with a journal.** `act({ label, touches, daw, run, undo })` runs a host command through a port, records a **journal entry** holding the inverse host command (or, for UI-only state, an inverse closure), and returns a `Result`. Undo is refused with a sentence when a later entry touches the same keys, when a DAW entry is no longer the last, or when the host says the inverse is stale. This is the mock's `undoEntry` logic carried over; patches over a mirrored book are not.
3. **Ports narrower than the facade.** `apps/ui/src/ports/` re-exports the per-domain interfaces and `usePort<K>()` returns only the one a feature declares, so Interface Segregation is enforced where it matters (the feature), while `NarrationApi` stays the composition type.
4. **Contract kit.** `describeProviderContract(name, { mock, host })` runs one behavioural suite over the mock adapter and the host-backed adapter (the latter against golden payloads from Go tests). Every port in the series gets one. A shared `Refusal` ({ code, reason }) and `Measured<T>` (value or reason) schema live in `apps/ui/src/api/schemas/base.ts`.
5. **Fixtures as data.** Sample data lives only in `apps/ui/src/fixtures/` (and the existing `api/mockHost`), built by `makeBook`-style builders (`headingStyle`, `chapters`); a scan test fails on a literal speaker, chapter title or number in a component. A dev and mock-build "Mock states" panel (not in the shipped build) forces states (DAW setup, network, stale ids) the way `studio-next/src/app/mock-states.tsx` does.
6. **Scenario tests.** Each page renders with three heading styles and a 40-chapter book (`studio-next/tests/scenarios.test.tsx`), asserting on formatted names only.

## Key Hypothesis

If derived numbers come from selectors over read models and every change goes through one journalled command path, then the owner's counter and undo rulings can be implemented once and hold on every page. We are wrong if a page needs state the host cannot return after a restart, or if journal entries cannot be inverted by host commands for more than a third of the undoable commands in the mock's list (`studio-next/src/state/commands/`).

## What We're NOT Building

- A client-side copy of the whole book or an immer patch history over host data.
- Persistence of the journal across restarts; redo; undo across projects.
- Undo that reaches into the DAW's own history; as in the mock, a refused DAW undo says to use the DAW's own Edit > Undo.
- A state library dependency (no Redux, Zustand, immer).
- Replacing the host's persistence or the findings store's audit history.

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Ports with a shared contract suite | 100% of ports in the series | `describeProviderContract` registration test |
| Derived numbers computed outside selectors | 0 for the series' pages (counts, percentages, tone) | Review plus a scan for arithmetic on read-model fields in components |
| Undoable mock commands with a real inverse | At least 90% of `studio-next/src/state/commands/*` `act(...)` calls | Mapping table in the ADR |
| Contract rows | Each new binding has schema, golden, row, mock | `wireContracts.test.ts` |
| Fixtures in components | 0 literals | Scan test |

## Decisions

Owner rulings of 2026-10-11; none is open.

| Id | Ruling | Consequence here |
| --- | --- | --- |
| SN0-Q3 | The UI store is a read-model cache plus a command journal; the Go host stays the source of truth ([ADR 0041](../adr/0041-host-bindings-read-project-services-through-one-snapshot-accessor.md)) | A5 records it; the mock's whole-book store is not adopted |
| SN0-Q2 / DQ-2 | Replace, one PR, no flag | The store lands unused; pages adopt it in their swap slices |
| SNS-Q2 | No immer; journal entries hold inverse host commands and UI-only slices use small copy-on-write helpers (default taken, standing instruction) | A5 |
| SNS-Q3 | The journal holds 40 entries in memory, as the mock, and is cleared on project switch (default taken) | SNS-3 |
| SNS-Q4 | The mock's `act` list is the starting set; a host command with no safe inverse is marked non-undoable in-app and the refusal says to use the DAW's own Edit > Undo, as `studio-next/src/state/store.ts` does | SNS-1 mapping table |
| SNS-Q5 | UI-only schemas have no golden; anything the host reads back does (default taken) | SNS-4 |

## Users & Context

Page workers (consumers), the owner (sees the history list and the refusals), the coordinator (parity tests are the main regression net for a swap of a mock for a real adapter).

## Solution Detail

### Acceptance criteria tied to the mock

| Behaviour | Mock reference | Acceptance |
| --- | --- | --- |
| Undo one change by name | `studio-next/src/app/history.tsx`, `studio-next/tests/daw.test.ts` | The history lists "Add bookmark" etc.; Undo restores and removes the entry |
| Refuse an unsafe undo with the reason | `undoEntry` in `studio-next/src/state/store.ts` | "Undo 'X' first. It changed the same thing." is shown; nothing changes |
| DAW entries only if last | same | A DAW-touching entry followed by another is refused with the last entry's label |
| Derived numbers from selectors | `studio-next/src/selectors/progress.ts`, `studio-next/src/selectors/proof.ts` | Production, Proof and the rail show one value for "cleared" |
| Value or reason | `studio-next/src/providers/measurements.ts`, `studio-next/src/selectors/measured.ts` | "Not measured yet" appears wherever a `Measured<T>` has a reason |
| No literals in components | `studio-next/tests/no-hardcoded-speakers.test.ts` | Scan passes |
| All heading styles, 40 chapters | `studio-next/tests/scenarios.test.tsx` | Each migrated page passes |

### Interfaces

- `Refusal = { code: string; reason: string }`; `Measured<T> = { ok: true; value: T } | { ok: false; reason: string }`.
- `Command<R> = { label: string; touches: string[]; daw?: boolean; run(): Promise<Result<R>>; undo?(r: R): Promise<Result<void>> }`; `Result<R> = { ok: true; value: R } | { ok: false; refusal: Refusal }`.
- `JournalEntry = { id, label, daw, touches, undo }`; `store.act(cmd)`, `store.undo(id)`, `store.undoLast()`, `store.setLeaveGuard(g)`.
- `usePort('production')` returns `ProductionApi` only.
- `describeProviderContract(name, factories)`.

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth for the rebuild; an old ADR stays in force for code not yet migrated until the superseding ADR is merged ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| [ADR 0041](../adr/0041-host-bindings-read-project-services-through-one-snapshot-accessor.md) | KEEP | Host is the truth; the mock's whole-book store is not adopted (A5) |
| [ADR 0069](../adr/0069-payloads-are-validated-with-zod-behind-parsewire-and-a-wrong-shape-fails-loudly.md) | EXTEND | Shared `Refusal` and `Measured` schemas |
| [ADR 0062](../adr/0062-ui-import-rules-are-a-dependency-cruiser-config-and-a-mark-scan-that-name-their-adr.md), [ADR 0046](../adr/0046-architecture-rules-taken-from-adrs-are-lint-and-test-rules.md) | EXTEND | Import rules for `studio/`, `ports/`, `fixtures/` |
| [ADR 0202](../adr/0202-a-confident-two-way-match-is-a-real-link-labelled-auto-undoable-and-never-over-a-manual-one.md), [ADR 0120](../adr/0120-findings-are-read-and-decided-through-four-generic-bindings-and-a-decision-carries-the-evidence-version-it-was-made-against.md), [ADR 0233](../adr/0233-the-app-may-make-a-take-active-by-guid-in-one-undo-step.md) | KEEP | Existing undo and audit mechanisms are journal targets, not replaced |
| [ADR 0044](../adr/0044-property-and-fuzz-tests-are-deterministic-in-the-gate.md) | KEEP | Deterministic property tests |
| Undo across the DAW | KEEP | A DAW entry is undoable only when it is the last entry and the DAW reports it is still its last action; otherwise the refusal names the DAW's own Edit > Undo (A6) |

## Technical Approach

**Architecture.** `apps/ui/src/studio/` (store, journal, hydration, selectors library helpers), `apps/ui/src/ports/` (typed re-exports and `usePort`), `apps/ui/src/fixtures/` (builders and data), page selectors beside their pages (`components/<page>/*.selectors.ts`). Import rules (dependency-cruiser): selectors import types and other selectors only; `studio/` imports ports and schemas; components import `studio/` and ports; nothing imports a bridge or `wailsClient` except the composition root. The store subscribes through `useSyncExternalStore` and selectors must return stable slices (the mock's rule, tested).

**Contracts.** New shared schemas `refusalSchema`, `measuredSchema(valueSchema)` in `apps/ui/src/api/schemas/base.ts`; per-domain additions are in the other PRDs and each follows the six-step wire rule. `hostAPIVersion` bumps happen in the slice that adds a binding.

**Test plan.** Unit tests for journal rules (ported from `studio-next/tests/daw.test.ts` and `foundations.test.ts`); property tests for "undo then redo equals original" on UI-only slices (fast-check, deterministic per [ADR 0044](../adr/0044-property-and-fuzz-tests-are-deterministic-in-the-gate.md)); contract suites; scan tests; a scenario render per page; no visual change in SNS slices.

**Rollout.** Layer strangling: the store lands unused; the first adopters are chapter selection and preferences, then history for bookmarks (Script), then page-by-page. No flag.

**ADRs.** A5 (read-model store and command journal, immer decision), A6 (undo scope: UI, host, DAW; refusal rules).

**Risks.** The journal can lie if the host changes behind it (mitigation: hydrate on events and treat a stale inverse as a refusal); read models can go stale (mitigation: events plus refetch on focus, as `useStageRecommendations` does with `useRefreshOnFocus`); over-use of the store for local component state (mitigation: only cross-page state belongs in it, reviewed per slice).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ADRs | A5 and A6 as Proposed, with the mock-command to inverse-command table | in review (ADR 0770, ADR 0771) | - | SN0-1 | 0.8 | - |
| 2 | Store core | `studio/` store, selectors helpers, hydration by events | in review (feat/sn-s2-store-core) | 3 | 1 | 1.5 | - |
| 3 | Journal and undo | `act`, `undo`, refusals, leave guard, tests | pending | 2 | 1 | 1.5 | - |
| 4 | Contract kit | `describeProviderContract`, `Refusal`, `Measured`, registration test | in review (#1031) | 5 | 1 | 1.0 | - |
| 5 | Ports and fixtures | `ports/`, `usePort`, ratchet on whole-facade `useApi()`, `fixtures/` builders, scan test | pending | 4 | 1 | 1.0 | - |
| 6 | Mock states and scenarios | Dev-only panel, scenario book builder, scenario test helper | pending | - | 5 | 0.8 | - |
| 7 | First adopters | Chapter selection, preferences, one journalled command end to end | pending | - | 2, 3 | 0.4 | - |

### Phase Details

- **Phase 1.** The table lists each `act(...)` in `studio-next/src/state/commands/` with its real inverse (host command), "UI only", or "not undoable in-app".
- **Phase 3.** Port `undoEntry` rules and tests; the DAW-last rule becomes "a DAW entry is undoable only if it is the last entry and the DAW reports it is still its last action" once the capability exists (SND).
- **Phase 5.** The ratchet counts files that call `useApi()` and use more than the one declared domain; it may only fall.
- **Phase 7.** Journalled command: Add bookmark ([Script and Story Bible](studio-next-script-and-story-bible.prd.md)) is the intended first, since it is small and host-persisted.

### Parallelism Notes

2 and 3 are independent modules; 4 and 5 are independent of them. 6 and 7 close the PRD.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 2, 3 | `apps/ui/src/studio/**` (new) | none (lane U territory, D-7 of Agent Delivery) |
| 4 | `apps/ui/src/api/schemas/base.ts`, test helpers | Any schema slice (add-only exports) |
| 5 | `apps/ui/src/ports/**`, `apps/ui/src/fixtures/**`, architecture tests | `api/mockApi.ts` and `wireContracts.test.ts` (hot files; add rows only) |
| 6 | `apps/ui/src/main.tsx` mock flags, dev panel | Mock-mode flags |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNS-1 | Phase 1 | SN0-1 | yes | ADR index generated; table covers every mock `act` |
| SNS-2 | Phase 2 | SNS-1 | yes | Store tests; stable-slice test |
| SNS-3 | Phase 3 | SNS-1 | yes | Ported journal tests; property tests |
| SNS-4 | Phase 4 (in review, #1031) | SNS-1 | yes | Registration test fails for a port without a suite |
| SNS-5 | Phase 5 | SNS-1 | yes | Ratchet and scan tests |
| SNS-6 | Phase 6 | SNS-5 | yes | Scenario test runs for one existing page |
| SNS-7 | Phase 7 | SNS-2, SNS-3 | no (needs a bookmark binding from SNB) | Journalled add and undo through the mock and the host adapter |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Host is the truth (owner, SN0-Q3) | Read models plus a command journal | Whole-book store | [ADR 0041](../adr/0041-host-bindings-read-project-services-through-one-snapshot-accessor.md); one persistence path |
| No immer (SNS-Q2) | Inverse commands | Patches | Patches over host data have no inverse |
| ISP at the feature (proposed) | `usePort` | Keep the facade | Enforceable and testable |
| Parity kit (proposed) | One suite, two adapters | Separate mock and real tests | Liskov: a mock may not be more permissive than the host |

## Research Summary

Read: the mock store, domain, selectors list, fixtures list, test names; the repo's `types.ts`, `ApiContext.tsx`, `mockApi.ts`, `wire-contracts.md`, ADR 0069. Not done: no inventory of every `act` in the mock yet (Phase 1); no measurement of how many real inverses exist.

## Visual Spec

None for the store. The history list is specified in [App Shell and Registries](studio-next-app-shell-and-registries.prd.md).
