# 0757. The DAW reference is reference docs pinned to the port's declarations by a generated matrix and a section test

**Status:** Proposed (for the owner's review)
**Date:** 2026-10-10

## Context

What each engine can do, and what each capability should return, was spread over three places: dated research pages (`docs/research/reaper-*.md`, `audacity-4-scripting-spec.md`), a hand-kept capability table in `docs/architecture/daw-integration.md`, and the adapters' declarations in `apps/desktop/internal/dawport`. A plan or a review had to rebuild the answer from all three, the table had no Audacity 3 versus 4 distinction, and nothing stated a capability's expected result outside the tests. [ADR 0300](0300-every-daw-is-reached-through-one-port-of-small-role-interfaces-and-callers-ask-a-resolver-what-it-supports.md) made the declarations the source of truth for levels; the prose around them could still drift.

## Decision

The DAW knowledge is reference documentation in `docs/reference/daw/`, kept equal to the port by two tests in `apps/desktop/internal/dawport/dawportdoc`:

- `matrix.md` is generated from `dawport.Capabilities()` and each adapter's `Declares()`; the test fails when it differs, and `UPDATE_DAW_DOCS=1` rewrites it. The Audacity 4.x column is a fixed statement, not a declaration.
- `capabilities.md` must have exactly one ``### `name` `` section per capability, in catalog order.

`capabilities.md` holds each capability's intent, expected result, per-engine mapping and a "Checked" line that separates the harness, a run in the engine and a pending verification-pass row. The engine pages (`reaper.md`, `audacity-3.md`, `audacity-4.md`) state what the app relies on and cite their sources. The `daw-capabilities` skill says which page answers which question. The hand-kept table in `daw-integration.md` is replaced by a link.

## Consequences

- A capability or level cannot change without the reference changing, and a reader gets the expected result without reading the tests.
- Adding an engine or version is a new column in the generating test and a new engine page.
- The expected results in `capabilities.md` are hand-written and can still be wrong or stale; only their set of capabilities and the declared levels are pinned. Each statement names its source for that reason.
- The reference is not yet in the published site list (`tools/docs-site/include.txt`); publishing it is a separate reviewed change.
- To override this, write an ADR that supersedes it.
