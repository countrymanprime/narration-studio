# Changed path → docs owed

Paths are repo-relative. A change can match several rows. Add a row when a new area gets a doc. `scripts/ci/docs-impact-map.json` enforces a subset of these rows; the rest are for judgment. When you add a row here that a script can check, add it there too.

| Changed path | Docs to check or update |
| --- | --- |
| `integrations/reaper/**` | `docs/architecture/reaper-bridge.md` (command table, harness), `docs/architecture/reaper-navigation.md` (go to, loop, marker), `docs/architecture/daw-integration.md`, `docs/operations/reaper-verification-pass.md` |
| `apps/desktop/internal/dawport/**` (a capability, role or declared level) | `docs/reference/daw/capabilities.md` (a section per capability), `docs/reference/daw/matrix.md` (generated: `UPDATE_DAW_DOCS=1`), the engine page it touches, `docs/architecture/daw-integration.md` |
| `apps/desktop/internal/bridge/**` (`wire.go`) | `docs/architecture/reaper-bridge.md`, `docs/architecture/wire-contracts.md` |
| `apps/ui/src/api/schemas/**`, `tests/fixtures/contracts/**`, `apps/ui/src/api/wireContracts.test.ts` | `docs/architecture/wire-contracts.md` (only when the rule changes) |
| `apps/ui/src/components/primitives/**`, `apps/ui/src/styles.css` | `docs/design/design-system.md`, `docs/design/colour-and-contrast.md`, `docs/design/motion-and-animation.md`; regenerate `docs/ui/` with `pnpm --dir apps/ui docs:atlas`; run `design-spec-guard` |
| `apps/ui/src/**` (a page or state a user sees) | `docs/guides/using-the-app/<page>.md`; run `visual-catalog-sync` then `doc-screenshot-sync`; `docs/ui/` if a primitive changed |
| `sidecars/manuscript-guide/**`, `apps/desktop/internal/guide/**` | `docs/utilities/manuscript-guide.md`, `docs/architecture/story-bible-preview.md`, `docs/architecture/story-bible-entity-accuracy.md` |
| `sidecars/transcript-compare/**` | `docs/utilities/transcript-compare.md`, `docs/utilities/recording-coverage.md`, `docs/utilities/take-review.md` |
| `sidecars/manuscript-teleprompter/**` | `docs/architecture/manuscript-teleprompter.md`, `docs/guides/using-the-app/booth.md` |
| `apps/desktop/internal/findings/**` | `docs/architecture/findings-contract.md` |
| Stage or readiness signals | `docs/architecture/stage-recommendations.md`, `docs/workflows/chapter-stage-progression.md` |
| `apps/desktop/internal/assets/**`, the asset catalogs in `config/` | `docs/architecture/first-use-dependency-provisioning.md`, `docs/architecture/model-provenance.md` (generated table), `docs/research/local-dependency-evaluation.md` |
| `apps/desktop/internal/update/**` | `docs/architecture/in-app-update.md`, `docs/operations/ci-and-releases.md` |
| `apps/desktop/internal/persist/**` and the files that call it, listed in rule `data-files` of `scripts/ci/docs-impact-map.json` (a file the app writes and reads back in the project or per-user folder: path, contents, version, limits, when it is cleared) | `docs/reference/data-files.md` (the file's row). Not the threat model or `SECURITY.md`, unless the file names a path the host opens, a command it runs or a URL it fetches |
| Trust-boundary code: `apps/desktop/internal/process/**` (sidecar arguments), the REAPER and Audacity channels (`bridge/transport.go`, `narration_bridge_core.lua`, `audacitybridge/transport.go`, `pipe_*.go`), the download and update verification (`assets/{download,extract,manifest}.go`, `update/{install,manifest,stage,spawn_*}.go`), the release workflows (`prerelease.yml`, `promote-release.yml`), `apps/desktop/internal/importer/**` (files from someone else) | `docs/architecture/threat-model.md`, `SECURITY.md` if the reporter-facing scope changed |
| A trust boundary: untrusted input crossing in (download, update, sidecar arguments, DAW bridge, a file from someone else, the release pipeline), a new privilege or network egress | `docs/architecture/threat-model.md` (row and review date), `SECURITY.md` if the reporter-facing scope changed; see `feature-cleanup` step 7. A file the app writes and reads back is not a trust boundary |
| `.github/**`, `scripts/**`, `tools/**`, `package.json` scripts, `nx.json` | `docs/operations/ci-and-releases.md`, `docs/operations/verification-tooling.md`, `docs/operations/github-workflow.md`, `CONTRIBUTING.md` |
| `tools/docs-site/**` | `docs/operations/ci-and-releases.md#the-public-docs-site` |
| A moved, renamed or new top-level folder or project | `docs/architecture/codebase-map.md`, `scripts/ci/layout.json`, the Mermaid diagrams that name it |
| A new or removed utility or user-visible capability | `docs/README.md` (inventory, status), `docs/roadmap.md`, the relevant `docs/utilities/` or `docs/guides/` page |
| A decision with lasting effect | `docs/adr/` through `adr-author`; the PRD that planned it under `docs/prds/` |
| `.claude/skills/**`, `CLAUDE.md` | The skills and docs that name them (`grep -rn "<skill>" .claude CLAUDE.md docs`) |
