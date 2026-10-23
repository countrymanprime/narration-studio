# Product requirements documents (PRDs)

Planned work in this repository is specified here as PRDs: one file per feature or defect group, named `<topic>.prd.md`. A PRD says what problem is being solved, what evidence supports it, what is and is not being built, and how the work is cut into phases that can be delivered and reviewed one at a time.

## PRDs, ADRs and the other docs

| Kind | Where | What it holds |
| --- | --- | --- |
| **PRD** | `docs/prds/` | Specifies planned work: problem, evidence, scope, open questions, phased delivery. It describes something that is not built yet (or not fully). |
| **ADR** | [`docs/adr/`](../adr/README.md) | Records a decision that was actually made and applied to the code. Immutable once accepted; a changed decision gets a new ADR that supersedes the old one. |
| Docs for shipped behavior | `docs/architecture/`, `docs/design/`, `docs/utilities/`, `docs/guides/`, `docs/workflows/` | Describe how the code works today, how to use it, and the design records of what shipped. |

PRDs never replace ADRs. A PRD names the decisions it expects to make and links the ADR when it is written; an ADR that came out of PRD work links back to the PRD. When a phase settles a real decision, record it with the `adr-author` workflow after the code lands, and check the next free ADR number at merge time (see [Cross-PRD sequencing](#cross-prd-sequencing)).

## Lifecycle of a PRD

1. **Draft:** the PRD is written with its open questions; the owner answers them before phases are planned.
2. **In delivery:** each phase becomes a PRP plan and a pull request. The PR that delivers a phase sets that phase's `Status` to `complete` in the PRD's phase table (and links the plan in `PRP Plan`). Work in flight is tracked on GitHub issues per [Tracking work on GitHub](../operations/github-workflow.md), with `Closes #<n>` in the PR.
3. **Done:** once the work is implemented and has become steady state, the PRD is deleted in favor of steady-state documentation: `docs/architecture/`, `docs/utilities/`, `docs/guides/` and the ADRs record how it works and why. Delete the PRD in the PR that completes its last phase, and make sure that PR also writes the steady-state docs first. Git history keeps the PRD (`git show <commit>:docs/prds/<name>.prd.md`).

Nothing in a PRD that is still true and useful after delivery is lost by deleting it: move durable rules to the steady-state doc, decisions to an ADR, and the rest to git history. The decision is recorded in Lifecycle of a PRD.

## PRD template

Every PRD uses the same sections, in this order:

1. Problem Statement
2. Evidence
3. Proposed Solution
4. Key Hypothesis
5. What We're NOT Building
6. Success Metrics
7. Open Questions
8. Users & Context: the people who use what is built, narrators and maintainers, never agents
9. Solution Detail (core capabilities by MoSCoW priority, MVP scope, user flow)
10. Technical Approach (feasibility, architecture, risks)
11. Implementation Phases: the phase table (`#`, Phase, Description, Status, Parallel, Depends) and Phase Details. A phase is product scope: what it delivers and what it depends on
12. Decisions Log
13. Research Summary

The ADRs that constrain the work go on one `**Constraints:**` line under the title, as links. A PRD has no "Supersedes / depends on ADRs" section.

A PRD holds no agent process: no PRP Plan column, Parallelism Notes, Parallel-session compatibility table, lanes, slice rows, session caps or other tables of who builds what. Slices, the files each owns and their collisions go in the slice issues and on [#989](https://github.com/countrymanprime/narration-studio/issues/989); how the agent train runs goes in its procedure ([the agent train](../../.claude/skills/agent-train/SKILL.md)) or `.claude/`, not in a PRD. The Studio Next PRDs written before this rule keep their tables until each is deleted.

A PRD with UI changes points, in its **Visual Spec** section, at the [benchmark mock](../research/mockups/audiobook-studio-benchmark/) of the page it changes. A PRD keeps no mockup copies: a new mock is added only for work being built now, and is deleted when that work merges ([Which mocks are the spec](studio-next-rebuild.prd.md#which-mocks-are-the-spec)).

Most PRDs open with a `**Supersedes:**` or `**Source:**` line naming what they replace or draw from. Each PRD's phase table has one `Status` cell per phase; the pull request that delivers a phase updates that cell.

## Index

Phase counts are the rows of each PRD's phase table. The Studio Next series (the rebuild around the working mock in [`docs/research/mockups/studio-next/`](../research/mockups/studio-next/README.md)) is the main set of open PRDs, with one feature PRD beside it; every earlier PRD was deleted on 2026-10-10 (see [Deleted PRDs](#deleted-prds)).

| PRD | Type | Phases | Replaces |
| --- | --- | --- | --- |
| [Studio Next Rebuild: Evolve the Real App to the Studio Next Mock's Behaviour and Architecture](studio-next-rebuild.prd.md) | Program overview (owner request 2026-10-10) | 5 | None; extends the mock's lifecycle in [Which mocks are the spec](studio-next-rebuild.prd.md#which-mocks-are-the-spec); carries over or drops the remaining phases of the older PRDs (table in the PRD) |
| [Studio Next ADR Supersession Register](studio-next-adr-register.prd.md) | Appendix (every ADR classified; 18 owner questions) | 3 | None; supersedes no ADR by itself |
| [Studio Next Foundations: Tokens, Primitives, Layout Rules, Icon Vocabulary and Key Caps](studio-next-foundations.prd.md) | Feature (UI foundation) | 8 | None |
| [Studio Next App Shell and Registries](studio-next-app-shell-and-registries.prd.md) | Feature (UI architecture) | 8 | Extends Input Commands and Pedals (deleted PRD `input-commands-and-pedals`) |
| [Studio Next Domain, State and Wire Contracts](studio-next-domain-state-and-contracts.prd.md) | Feature (UI architecture) | 7 | None |
| [Studio Next DAW Ports and Capabilities](studio-next-daw-ports-and-capabilities.prd.md) | Feature (platform; spikes first) | 10 | Takes over the open DAW phases of the REAPER automation, Audacity and booth-actions PRDs |
| [Studio Next Production and Schedule](studio-next-production-and-schedule.prd.md) | Feature | 8 | Finishes the UI halves of the chapter-track auto-sync PRD |
| [Studio Next Script and Story Bible](studio-next-script-and-story-bible.prd.md) | Feature | 8 | None |
| [Studio Next Extraction and Analysis Tools](studio-next-extraction-and-analysis-tools.prd.md) | Feature (optional downloads, consent first) | 9 | None |
| [Studio Next Booth](studio-next-booth.prd.md) | Feature | 10 | Takes over the open phases of the read-aloud control bar and teleprompter PRDs |
| [Studio Next Proof and Pickups](studio-next-proof-and-pickups.prd.md) | Feature | 9 | Takes over the open REAPER checks of the review dashboard PRD |
| [Studio Next Script-Based Editing](studio-next-script-based-editing.prd.md) | Feature (the Editing page) | 10 | Supersedes the remaining phases of Edit and Proof Workspace |
| [Studio Next Master, Delivery and Settings](studio-next-master-delivery-and-settings.prd.md) | Feature | 5 | None |
| [Studio Next Cutover](studio-next-cutover.prd.md) | Close-out (deletes the mock) | 6 | None |
| [Character Voice Samples: Mark How You Voiced a Character in Editing, Replay It from the Story Bible and the Booth](character-voice-samples.prd.md) | Feature (owner request 2026-10-17; mock approved) | 8 | None; extends the Reference clips of the Story Bible |
| [Activity Trace: An Allow-Listed Record of How the App Behaves That Never Holds Content](activity-trace.prd.md) | Feature (diagnostics; owner rulings 2026-10-17, [#1827](https://github.com/countrymanprime/narration-studio/issues/1827)) | 5 | None |

## Deleted PRDs

On 2026-10-10 the owner had every earlier PRD deleted so the Studio Next series is the single plan (`docs/prds/README.md#lifecycle-of-a-prd` deletes a PRD when it is built or replaced; git history keeps it). The open phases they held are listed in the [overview](studio-next-rebuild.prd.md) as carried over into a Studio Next PRD or explicitly dropped. To read one, run `git log --diff-filter=D --name-only -- docs/prds/<name>.prd.md` and then `git show <commit>^:docs/prds/<name>.prd.md`.

Deleted: `actual-recorded-column`, `analysis-evidence-ledger`, `app-navigation-and-zoom-controls`, `app-shell-vertical-overflow`, `audacity-integration`, `audiobook-credits-templates`, `booth-actions-enablement`, `chapter-title-display-consistency`, `chapter-track-link-control`, `character-continuity-review`, `coreaudio-capture`, `credits-in-chapter-table`, `credits-token-setup-and-front-matter-detection`, `daw-chapter-track-auto-sync`, `delivery-platform-profiles`, `diagnostics-delivery-and-cleanup-tools`, `editing-readiness-analysis`, `home-stage-check-line`, `input-commands-and-pedals`, `manuscript-chapter-header-alignment`, `manuscript-credits-card-parity`, `native-recording-suite`, `prep-depth`, `project-workspace-and-daw-link`, `public-app-demo`, `read-aloud-control-bar`, `reaper-automation-follow-through`, `release-readiness-provisioning-and-docs-site`, `render-encode-master`, `review-dashboard-and-findings-adoption`, `teleprompter-engines-and-input-devices`, `teleprompter-manuscript-integration`, `tool-run-logging`, `typescript-7-and-typed-linting`, `wails-v3-migration`.

Restored on 2026-10-17 for reference, as written when they were deleted: [`edit-and-proof-workspace`](edit-and-proof-workspace.prd.md) (deleted in c1710719) and [`recording-check-model-cascade`](recording-check-model-cascade.prd.md) (delivered, deleted in 024417e2). Their line citations and links refer to the code and docs of that time. [Recording Check (recording coverage)](../utilities/recording-coverage.md) builds on the second.

## Replaced briefs

These 19 planned-work files were removed when the PRDs landed (a twentieth, `host-binding-concurrency.md`, is back as the steady-state description of the delivered host binding work). Each original is recoverable from git, for example `git show d5cc994:docs/utilities/review-dashboard.md`.

| Removed file | Now specified in |
| --- | --- |
| `docs/utilities/review-dashboard.md` | review-dashboard-and-findings-adoption.prd.md (deleted) |
| `docs/utilities/duplicate-and-pickup-finder.md` | [Take review](../utilities/take-review.md) (delivered) |
| `docs/utilities/take-intelligence.md` | [Take review](../utilities/take-review.md) (delivered) |
| `docs/utilities/character-continuity-review.md` | character-continuity-review.prd.md (deleted) |
| `docs/utilities/narration-diagnostics.md` | diagnostics-delivery-and-cleanup-tools.prd.md (deleted) |
| `docs/utilities/delivery-and-review-export.md` | diagnostics-delivery-and-cleanup-tools.prd.md (deleted) |
| `docs/utilities/silence-cleanup.md` | diagnostics-delivery-and-cleanup-tools.prd.md (deleted) |
| `docs/utilities/clause-split-and-level-normalize.md` | diagnostics-delivery-and-cleanup-tools.prd.md (deleted) |
| `docs/utilities/daw-project-scan.md` | diagnostics-delivery-and-cleanup-tools.prd.md (deleted) |
| `docs/architecture/dictionary-thesaurus-integration.md`, `import-settings-workflow.md`, `native-notifications.md`, `pronunciation-provider-selection.md`, `story-bible-concurrent-build.md` (original planned briefs) | The Story Bible and Import UX Briefs PRD, delivered and deleted (see its row above); each is now itself the steady-state doc at the same path, with fresh content — the original brief is `git show d5cc994:docs/architecture/<name>` |
| `docs/architecture/interaction-feedback-backlog.md` | The interaction feedback audit PRD, delivered by stack S14 and deleted; steady state in [interaction feedback](../architecture/interaction-feedback.md) (`git log --diff-filter=D -- docs/prds/interaction-feedback-audit.prd.md` finds the PRD) |
| `docs/architecture/component-showcase-and-docs-site.md` | release-readiness-provisioning-and-docs-site.prd.md (deleted) |
| `docs/architecture/teleprompter-manuscript-integration.md` | teleprompter-manuscript-integration.prd.md (deleted) |
| `docs/architecture/story-bible-readonly-views.md` | [Story Bible](../guides/using-the-app/story-bible.md) (the behavior shipped; the ADR records it) |
| `docs/design/known-ui-defects.md` | One PRD per defect group. Four are delivered and deleted: the dialogs ([Base UI wrappers](../design/design-system.md#base-ui-wrappers), [Design system reference](../design/design-system.md)) MeterBar, Tooltip, Field, Heading and Panel ([Base UI wrappers](../design/design-system.md#base-ui-wrappers), [Design system reference](../design/design-system.md)), and palette contrast ([Colour and contrast](../design/colour-and-contrast.md), [colour and contrast](../design/colour-and-contrast.md)). the settings mobile layout ([Visual bug fixes require screenshot verification](../../.claude/rules/ui-visual-verification.md), [Design system reference](../design/design-system.md), [Settings rows](../design/design-system.md#settings-rows)). The tooling limits and flaky tests are delivered too ([CI and releases](../operations/ci-and-releases.md#keeping-a-red-run-meaningful), [CI and releases](../operations/ci-and-releases.md), [Verification and code-health tooling](../operations/verification-tooling.md)); the one deferred item, the pixel-baseline spike, is [#153](https://github.com/countrymanprime/narration-studio/issues/153). `git show d5cc994:docs/design/known-ui-defects.md` recovers it. |

Three planned-work documents stay because they hold rules or design records that shipped code and other docs cite. [`first-use-dependency-provisioning.md`](../architecture/first-use-dependency-provisioning.md) keeps the normative provisioning rules, [`manuscript-teleprompter.md`](../architecture/manuscript-teleprompter.md) is the design record of the shipped sidecar, host relay and page, and [`standalone-launch.md`](../architecture/standalone-launch.md) records the shipped project picker. Their remaining work is tracked in GitHub issues ([#231](https://github.com/countrymanprime/narration-studio/issues/231), [#1476](https://github.com/countrymanprime/narration-studio/issues/1476)) and the PRDs above.

## Cross-PRD sequencing

Delivery order, lanes and the coordinator rules for the Studio Next series are in the agent train's [Studio Next delivery model](../../.claude/skills/agent-train/references/studio-next-delivery.md), which was the PRD `studio-next-agent-delivery.prd.md`.

These serialization points are named inside the PRDs themselves. Several PRDs run in parallel sessions, so check each before starting a phase that touches one.

- **Host API version.** `hostAPIVersion` lives in three places, all `5` at the time the PRDs were written: `src/studio/desktop/app.go`, `src/studio/desktop/app_test.go` and `src/studio/ui/src/hostApi.ts`. Every phase that adds a binding bumps it (and regenerates `Host.{js,d.ts}`), so it is a merge-time serialization point: the later pull request rebases and bumps again. The host binding data race work (delivered) was the exception: it changed no signatures and did not bump.
- **Adding a nav item.** The navigation is grouped by stage (Production, Prep, Record, Review, Finish, with Settings at the foot) and a new page replaces its old counterpart in the same pull request, with a redirect and no toggle between them (owner D79, [Design principles](../architecture/principles.md)). A PRD that adds a page names its group and the page it replaces, per [Navigation](../guides/using-the-app/navigation.md); a section of a page is not a nav item. Every change to `AppShell.tsx`'s navigation or header regenerates every doc screenshot under `docs/images/ui/`, so nav changes land one at a time.
- **Lua dispatcher.** Delivered (stack S09, [The DAW port](../architecture/daw-integration.md#the-daw-port)): the bridge in `src/studio/integrations/reaper` dispatches through a registry with one Lua file per feature, is tested by a Lua 5.4 harness that `pnpm check` and CI run, and the Go client fans events out to subscribers by tag and run ID. A PRD that adds a command writes its harness tests first, puts it in a new `narration_<feature>.lua` listed in `FEATURE_FILES` and `scripts/release/reaper-files.mjs`, and subscribes to its own events ([how](../architecture/reaper-bridge.md#the-command-registry)). The review dashboard, take review, diagnostics, teleprompter integration and the rest of the REAPER automation PRD all add commands this way.
- **`src/studio/desktop/bindings.go` and the host accessor.** Delivered (see [host binding concurrency](../architecture/host-binding-concurrency.md) and [The rule](../architecture/host-binding-concurrency.md#the-rule)): every binding reads the project-scoped services through `h.services()`, and `hostguard_test.go` fails `go test` on a direct read. A PRD that adds a binding writes it on the accessor and adds a row to `stressReaders` in `hostrace_test.go`.
- **Base UI foundation.** Delivered (stack S10a, [Base UI wrappers](../design/design-system.md#base-ui-wrappers) and the ADRs after it): the primitives are built on Base UI, and only `src/studio/ui/src/components/primitives/` imports it (`src/studio/ui/src/baseUiBoundary.test.ts`). `Dialog`, `ConfirmDialog`, `WorkDialog`, `Tooltip`, `TooltipTarget`, `Field`, `MeterBar`, `SlideOver`, `NavDrawer`, `Pill`, `Menu`, `Checkbox`, `Collapsible` and `Switch` are done, and the dialog modality and component accessibility PRDs that the foundation started are delivered and deleted by the dialog and component accessibility stack S11 ([Design system reference](../design/design-system.md); `git log --diff-filter=D -- docs/prds/dialog-modality-and-workdialog-a11y.prd.md docs/prds/component-a11y-meter-tooltip-field-heading-panel.prd.md` finds them); the primitives PRD that followed it (stack S10b, [Base UI wrappers](../design/design-system.md#base-ui-wrappers) to [Design system reference](../design/design-system.md)) is delivered too: `IconButton`, `TextField`, `SearchField`, `Select`, `Tabs`, `ToggleGroup`, `TagInput` and `Table`, and no page writes a native control (`src/studio/ui/src/rawNatives.test.ts`). Its PRD is deleted as well (`git log --diff-filter=D -- docs/prds/ui-primitives-and-headless-library.prd.md`). The foundation PRD is deleted; find the commit that deleted it with `git log --diff-filter=D -- docs/prds/base-ui-primitive-foundation.prd.md` and read it with `git show <that commit>^:docs/prds/base-ui-primitive-foundation.prd.md`.
- **Workflow files.** Delivered (stack S06, [CI and releases](../operations/ci-and-releases.md)): every `uses:` is a commit SHA and the `zizmor` check fails an unpinned one, so any action a PRD adds must arrive SHA-pinned (`pinact run`); the release-readiness PRD (`prerelease.yml`, installer) edits the same workflows. The release assets are attested (see [CI and releases](../operations/ci-and-releases.md#build-provenance)) and promote verifies them, so an installer joins the `release-assets/*` glob by itself; signing (release-readiness Phase 15) must run before the attestation step.
- **The app's own update.** Delivered (stack S15, [ADR 0002](../adr/0002-local-models-and-tools-come-first-so-the-app-is-free-to-use.md), [The version inside the program](../operations/ci-and-releases.md#the-version-inside-the-program), [The install and the rollback](../architecture/in-app-update.md#the-install-and-the-rollback); [in-app update](../architecture/in-app-update.md)): the version is stamped into the program, the app checks this repository's releases and replaces itself on Windows. A PRD that changes the release assets (their names, the zip's one file `narration-studio.exe`, the `.sha256` format, the tag shapes) or adds a platform to the release table changes `src/studio/desktop/internal/update` in the same pull request ([CI and releases](../operations/ci-and-releases.md#what-the-in-app-updater-depends-on)); an installer (release-readiness Phase 14) must keep the portable zip working, because the update replaces one file. `git log --diff-filter=D -- docs/prds/in-app-update.prd.md docs/prds/release-artifact-naming.prd.md` finds the two PRDs.
- **The REAPER launcher and its executable name.** Delivered by stack S15 ([The version inside the program](../operations/ci-and-releases.md#the-version-inside-the-program)): the program is `narration-studio[.exe]` and the launcher's name logic has harness tests. Project Workspace (deleted PRD `project-workspace-and-daw-link`) Phase 5 still adds `--project-file` to the same launcher; the Lua now has harness tests ([The DAW port](../architecture/daw-integration.md#the-daw-port)), so only REAPER API behaviour needs a manual sign-off.
- **`Home.tsx` and the import review dialog.** The review body is already extracted from `Home.tsx` into `ImportReview.tsx` ([the import review](../architecture/import-review.md), delivered by stack S18); the Story Bible and import briefs (phases 2, 3, 5) and the chapter stage recommendations PRD still edit `Home.tsx`, and the interaction feedback work (a pending guard on the file dialog, stack S14) already did. Rebase them onto the extracted component.
- **Primitives first.** Delivered (stacks S10a and S10b): the reader, Story Bible and Proofing PRDs build their icon-only buttons, search field, controls bar, tag input, selects, tabs and tables from the primitives listed in [design-system.md](../design/design-system.md), and a page that needs a control that has no primitive adds the primitive first (a page may not write a native `button`, `input`, `select`, `textarea` or table element beyond the ceilings in `src/studio/ui/src/rawNatives.test.ts`).
- **`GuideDetail.tsx`, `Guide.tsx` and `Transcript.tsx`.** The Story Bible entries work (delivered, stack S19a, PRD deleted), the briefs PRD (phases 2, 9-11) and the release-readiness install-flow phase all edit these files (the interaction feedback work, stack S14, already put every Story Bible action on `usePendingAction` and moved the rebuild's completion to the `job:ended` event); Proofing Vocabulary Hints (delivered, PRD deleted) edited `Transcript.tsx`.
- **The Studio Next series.** The 14 `studio-next-*` PRDs ([overview](studio-next-rebuild.prd.md)) schedule the rebuild of the app around the Studio Next mock. Their ADR conflicts are classified in the [ADR supersession register](studio-next-adr-register.prd.md); an old ADR stays in force for unmigrated code until its superseding ADR is merged. Slices, lanes and the ready list are in the agent train's [Studio Next delivery model](../../.claude/skills/agent-train/references/studio-next-delivery.md).
- **Accepted ADRs reversed by PRDs.** The reader PRD Phase 5 and the import-structure PRD Phase 2 supersede the reader half of `src/studio/ui/src/state.ts`; the Story Bible entries work (delivered) superseded a clause of `docs/guides/using-the-app/story-bible.md` ([Story Bible](../guides/using-the-app/story-bible.md)); the project workspace PRD supersedes decisions of `docs/architecture/standalone-launch.md`; the primitives PRD's supersession of `docs/design/design-system.md#base-ui-wrappers`'s `table.dtable` exception is delivered ([Design system reference](../design/design-system.md)). Each needs its own new ADR (ADRs are immutable) and `design-spec-guard`; check the next free number at merge time.
- **Import path.** [the import review](../architecture/import-review.md) (delivered), Import Structure (delivered, PRD deleted; importer, `model.go`, `docx.go`) and the briefs PRD Phase 5 all touch the importer or the review dialog; the structure PRD's Phase 3 needs the Story Bible entries work's properties schema (delivered, stack S19a) first.
- **`ProjectCreate` and the projects directory.** Project Workspace (deleted PRD `project-workspace-and-daw-link`) Phase 2 replaces `ProjectCreate` with `ProjectCreateIn` (a `hostAPIVersion` bump) on top of the delivered host accessor work, which already made `ProjectCreate` check for a busy host before it creates the folder and require an absolute path.
- **The layout move.** [Repository layout](../architecture/codebase-map.md#repository-layout) records the layout; the move renamed nearly every tracked path into role-based folders (`apps/`, `libs/`, `src/studio/sidecars/`, `src/studio/integrations/`, `config/`, `tests/`; the old-to-new map is `scripts/ci/layout.json`). Every path cited in the other PRDs was rewritten by its codemap. A branch or worktree that predates the move merges `main` (git follows the renames) and then runs `node scripts/ci/apply-path-map.mjs` to rewrite the path text inside its files, and `pnpm install` to refresh the workspace links.
- **Capture contract.** The UI atlas kit is gone ([Visual bug fixes require screenshot verification](../../.claude/rules/ui-visual-verification.md)): a PRD that changes the visual suite or the atlas edits `src/studio/ui/tests` directly, with no kit version, template or sync step. Two such PRDs still collide on `tests/visual/lib`, so serialize them.
