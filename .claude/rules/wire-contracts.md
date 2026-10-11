---
paths:
  - "apps/ui/src/api/**"
  - "apps/desktop/**"
  - "tests/fixtures/contracts/**"
  - "sidecars/**"
  - "integrations/reaper/**"
---

# Wire contracts

Anything that crosses into the UI (a Wails binding result, a live event) or that the host reads back from disk is checked where it crosses, and a new one brings its checks with it: a Zod schema in `apps/ui/src/api/schemas/`, a golden payload written by a Go or Python test (`tests/fixtures/contracts/`, regenerated with `UPDATE_CONTRACTS=1`, never edited by hand), a row in `apps/ui/src/api/wireContracts.test.ts` and a mock that passes the schema. A new REAPER event goes in the table in `apps/desktop/internal/bridge/wire.go`. No `as` cast or bare `JSON.parse` on a payload. See `docs/architecture/wire-contracts.md`.
