---
name: wire-contract-change
description: Adding or changing a Wails binding result, live event, persisted file, sidecar output or REAPER event? Walk the checks every boundary needs (schema, golden payload, contract row, mock, API version) so Go, Python and the UI cannot drift.
---

# wire-contract-change

## Why this exists

The Go host, the Python sidecars, the REAPER Lua and the React UI each define their own copy of a payload's shape. The schemas, golden files and contract tests are what keep them equal; a side that is changed without them fails at runtime instead of in CI.

## When to use this

A change that adds, removes, renames, retypes or newly requires a field in anything that crosses a boundary: a Wails binding result, a live event, a sidecar's output, a file the host reads back, or a line in the REAPER `events.log`. Skip it for changes inside one side that never reach a payload.

## What to do

1. Read [wire contracts](../../../docs/architecture/wire-contracts.md): its table says which check owns your boundary, and its "rule for a new binding" lists the same steps as below.
2. Find every consumer first with `change-impact-scan`, including the mock and the visual fixtures.
3. Write the failing test first (`tdd-workflow`): the golden payload or the schema row that the change will satisfy.
4. Make the change on every side that owns the shape:
   - Schema in `apps/ui/src/api/schemas/` (`satisfies z.ZodType<Contract>`; use the null helpers in `base.ts`), decoded in `wailsClient.ts`. No `as` cast and no bare `JSON.parse` under `apps/ui/src/api/`.
   - Golden payload written by the owning test: `contractfile.Check` in Go, `contract_files.check` in Python. Regenerate with `UPDATE_CONTRACTS=1`, review the diff, never edit `tests/fixtures/contracts/` by hand.
   - A row in `apps/ui/src/api/wireContracts.test.ts`; the mock must pass the same schema.
   - A REAPER event goes in the table in `apps/desktop/internal/bridge/wire.go`, with `wire_test.go` and the Lua harness pinning the same line.
5. `hostAPIVersion`: additive changes need no bump. Removing, renaming, retyping or newly requiring a field bumps it in `apps/desktop/app.go`, `apps/desktop/app_test.go` and `apps/ui/src/hostApi.ts`.
6. If the payload is page data, add or update the invalid-payload visual state (`visual-catalog-sync`).
7. Run `full-verification-gate`. If a persisted file changed, add or update its row in `docs/reference/data-files.md` (location, schema or golden, retention); it needs a threat-model row only if it names a path the host opens, a command it runs or a URL it fetches. If a trust boundary changed, re-read its row in `docs/architecture/threat-model.md`. Then run `doc-impact-check`.

## What this skill is not

It does not choose a schema library or generate schemas from one source. Replacing the hand-written schemas with generated ones needs an ADR.
