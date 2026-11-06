# The worker procedure

What a train worker, resume session or fixer reads: the protocol, serial points, lanes, the guide rule and which mocks are the spec. The coordinator's procedure is in [coordinator.md](coordinator.md); the owner's standing rules are in [owner-rules.md](owner-rules.md); the prompts are in [templates.md](templates.md).

## The worker protocol

A worker is one cloud session for one stream. It opens one PR per phase, stacked on the previous one, and never merges.

- **Read your slice of the PRD, not all of it.** Start from the slice issue (or the prompt's `SCOPE`) and read the PRD sections it links. With no links, read only: the phase's row in the phase table (its `Depends` and Ports used), its Phase Details paragraph, the Visual Spec section and the open questions that name your phase. List the headings first (`grep -n '^#' <prd>`) and read by line range. Read another section when the work needs it, not up front. If a constraint your slice needs is missing from the sections it cites, say so in the slice's Handoff comment.
- **Commit and push after every green step,** not just at the end. A session that dies on a usage limit loses only the work since its last push.
- **Checkpoints:** before each phase, and before any expensive step (the visual states of a page, a full Go race run, the atlas). At each checkpoint:
  1. Read #989's switches and the decisions register #993, and call `get_session` for your own `rate_limit_info` if the tool is available.
  2. On `HOLD`, `HOLD-UNTIL-RESET`, or RED in your own reading, or `DRAIN` unless you are lane K and the band is not RED: **pause.**
     - Commit your work in progress as `chore(<scope>): wip, paused at <step>` and push.
     - Open or update the phase's PR as a **draft** with a `## Resume notes` block:
       - Stream `<ID>`, PRD and phase
       - Done: the steps finished, with commit SHAs
       - Next: the exact next step
       - Failing: any failing check, with its output
       - Checks run: the local checks already passed
     - Comment `<ID>: PAUSED at <step>, PR #<n>` on #989, then end the session.
  3. On AMBER in your own reading (`allowed_warning`), **unless #989's `WARNING_POLICY` is `ignore`** (then a warning counts as GREEN, D63): **yield.** Finish the current PR to green, don't start the next phase, comment `<ID>: yielded after p<N>` on #989, and end.
  4. Otherwise, continue.
- **Open the PR as soon as the change is pushed (owner rule, 2026-10-18).** Do not wait for local checks to finish or for the owner to ask: open the PR (a draft only if the work is genuinely incomplete), list the checks still running as pending in the body, and update the body as they finish. The owner reviews from the PR, not from the session.
- **Finishing (D99, one-shot):**
  - Push and open the PR as soon as the change is pushed, report in one short message and end. Do not subscribe to the PR, wait for CI or answer review rounds.
  - Run only the one or two fastest targeted checks. CI is the source of truth.
  - Comment `<ID>: PRs #… opened` on #989, then end the turn.
  - A red check, a conflict or a review comment gets a new one-PR fixer session started by the coordinator, never a message into your session.
- **No resume-in-place:** there is no tool to send a follow-up task into a session that has already finished and gone idle. A stream's next PRD phase (D62) is always a **new** session, branched fresh off the current `main` tip — never a message into the old one. The gain from D62 is launching that new session the moment the phase is ready, not batching it to the next tick; it is not session reuse.
- **Owner steps:** anything needing the owner, REAPER, audio hardware or owner input goes on #992 as a comment and is marked pending in the PR. Never wait for a human.
- **A missing tool or library is yours to install, not a blocker.** Cloud sessions run as root with `apt-get`, `npm`, `pip`/`uv` and `go` working through the proxy. If a check, hook or build fails because something is not installed, install it and re-run; do not report the check as impossible, skip it, or use `--no-verify`. Example: the pre-commit `check-go` hook and any Go build of `src/studio/desktop` need the Wails GTK libraries; run `apt-get update && apt-get install -y libglib2.0-dev libgtk-4-dev libwebkitgtk-6.0-dev libsoup-3.0-dev librsvg2-dev patchelf` (the same line as `.github/actions/setup-toolchain/action.yml`). Only when the install itself fails, say which package and quote the error (and read `read_documentation` `environment.network` if a host is denied) before you hand the step to someone else.
- **Tooling:** the repo's `SessionStart` hook (`scripts/cloud/session-start.sh`, registered in `.claude/settings.json`) installs the pinned toolchain. `.claude/settings.json` allows the build, test and git commands and denies force-pushes and rebases. Workers never edit `.claude/settings.json`; auto mode refuses that as self-modification, so any change to it goes on #992 for the owner.

## Serial points

- **`hostAPIVersion`:**
  - It lives in `src/studio/desktop/app.go`, `app_test.go` and `src/studio/ui/src/hostApi.ts`, and the bindings `Host.*` are regenerated from it.
  - A PR that adds a binding takes `main`'s value + 1.
  - On a collision, whoever merges `main` in second takes the higher value + 1 and regenerates. Use the bump script once lane X has added it.
- **The PRD index rows:** add-only. The coordinator resolves conflicts in them mechanically.
- **Append-only rows:** `config/defaults.json`, `internal/settings/store.go` field rows, the `SettingsPage.tsx` panel list, `internal/bridge/wire.go` event rows.
- **One at a time, train-wide:**
  - the `AppShell.tsx` navigation or header;
  - `.github/workflows/**`;
  - the design token batch (`src/styles.css` token blocks and `paletteContrast.test.ts` `PAIRS`);
  - any lane-X refactor.
- **Hot UI files,** until lane X splits them: `api/mockApi.ts`, `wailsClient.ts`, `wireContracts.test.ts`, `tests/visual/state-catalog.ts`, `tests/visual/app.drivers.ts`, `interactionFeedback.catalog.ts`, `App.tsx`. Two streams may both touch one only when each adds rows in a separate place, and the coordinator merges `main` into the second before it merges.

## Lanes

A lane is a territory of files. Two workers may share a lane only when their slice issues' `owns` (or, for an older PRD, its Parallel-session table) show they touch disjoint files. D48 on the retired #509 records the check: verify file by file before pairing.

| Lane | Owns | Model |
| --- | --- | --- |
| **K: contracts** | `src/studio/desktop/internal/port/**`, `internal/dawport/**`, the provider-port packages, `src/studio/libs/python/narration_common/ports/**`, contract bindings and their schemas, goldens and mocks, `hostAPIVersion` bumps for contract bindings | Opus |
| **A: host features** | root `src/studio/desktop/*.go` feature bindings, `internal/<feature>` packages outside the ports | Sonnet (Opus for tricky concurrency) |
| **B: adapters and sidecars** | `src/studio/integrations/reaper/**`, `internal/bridge`, `internal/daw*`, `internal/dawport/reaper`, `internal/dawport/audacity`, the consumer migrations, `src/studio/sidecars/**`, the rest of `src/studio/libs/python/**` | Sonnet (Opus for new Lua commands) |
| **U: primitives and input** | `src/studio/ui/src/components/primitives/**`, `src/studio/ui/src/input/**`, `src/studio/ui/src/studio/**`, `src/studio/ui/src/ports/**`, `src/studio/ui/src/overlay/**`, `src/studio/ui/src/registries/**` (D-7), design tokens (in one PR, running alone) | Sonnet |
| **C: UI features** | `src/studio/ui/src/components/<feature>/**`, `hooks/**`, `tests/visual/**` rows of its pages, `docs/guides/using-the-app/**` | Sonnet |
| **D: documents** | PRDs, steady-state docs, ADR bookkeeping, PRD close-outs | Sonnet for PRDs, Haiku for bookkeeping |
| **X: exclusive** | Refactors of shared files (see [Serial points](#serial-points)) | Opus |

A lane-X stream runs with no other stream that touches the same files. Lanes have no ADR blocks: a slice does not write an ADR.

## UI PRs update the how-to guide

The rule and the commands are in [CONTRIBUTING.md](../../../../CONTRIBUTING.md#ui-prs-update-the-how-to-guide). For the train:

- **Worker.** A UI PR updates the guide page of each app page it changes, text and screenshots (`node scripts/dev/guide-screenshots.mjs <page>...`), in the same PR, or says `No guide change: <reason>`. It looks at every catalogued state with `visual:page` and `atlas:page` and states the real-app (Playwright) and Storybook results in the body; Storybook alone does not count. It commits no other images: no `pr-screenshots/` folder in its head.
- **Coordinator.** Accepts a UI PR when its guide page and images are updated (or the body carries a specific `No guide change:` reason), the body states the real-app and Storybook results, and the `Guide impact` step of `Docs / Docs checks` is green. It never merges or counts ready a UI PR without them, whatever the rest of CI says.
- **Sweep.** A periodic docs sweep runs `node scripts/dev/guide-screenshots.mjs --all` and commits what moved, as a safety net for changes to shared components.

## Which mocks are the spec

The Studio Next mock was the only spec for every page it covers (D98). It is deleted from the tree and read from git history ([Reading the deleted mock](../../../../docs/operations/verification-tooling.md#reading-the-deleted-studio-next-mock)). The rules are in the rebuild PRD's Which mocks are the spec and, for primitives and the theme, in [the design system](../../../../docs/design/design-system.md#which-mocks-are-the-spec).

## Rules for every worker

The worker prompt carries only the fields that change. These rules were in every prompt; they live here once.

### Building to the mock (D46, D98)

Open the mock page named in the prompt and the running mock before coding and build to match. The Studio Next mock is the only spec (D98): if it is not in the mock, don't build it; if the repo already has an equivalent of something in it, the old one is removed in the swap. Compare light to light and dark to dark by the theme the mock page is drawn in. Layout and style are the spec, never the mock's sample data.

Drive the app to the mock's state and data, capture at the mock's own size and theme, and look at it beside the mock. There is no match % for Studio Next pages: build the features and styles the mock shows and look at the images.

No reasons to write, no region tables, no Mockup check table. New primitives and tokens are in scope; existing styles are not a reason: when a primitive, token or style doesn't draw what the mock shows, change the primitive (its `<Name>.stories.tsx` too, with `design-spec-guard` and an ADR for a changed design decision), don't restyle it locally on the page. The spec per primitive is `docs/design/design-system.md`.

### Pull request, issues, ADRs and docs

- **Branches.** The first PR is based on the latest `main`; one PR per phase, each based on the previous branch; branch `<type>/<prd-slug>-p<N>-<slug>`.
- **PR body.** A Conventional Commit title; goal, what changed, local checks run with results, the real-app (Playwright) and Storybook results of the pages touched (`pnpm --dir src/studio/ui visual:page <page>` and `atlas:page <page>`; never run `playwright install`, the runs find this container's Chromium). For any change to what a page draws or how it is used, that page's guide updated in the same PR: `docs/guides/using-the-app/<page>.md` and its images (`node scripts/dev/guide-screenshots.mjs <page>`), linked from the body, or `No guide change: <reason>`; commit no other images (see "UI PRs update the how-to guide" in CONTRIBUTING.md). Then `Base: <branch>`, `Closes #<slice>` for a slice, else `Part of #<PRD issue>` (find it or create it per `docs/operations/github-workflow.md`; the PRD's last phase says `Closes #<n>`), and `New ADRs for review`.
- **Issues.** Before you open the PR, list every open issue your change resolves (the slice, plus any bug or triage issue it fixes: search `gh issue list` for the symptom). Write one `Closes #<n>` line per issue the PR fully resolves; `Refs #<n>` only for an issue it resolves in part, never for a fix; `Issue: none — <reason>` when there is none. A fix or feat PR with none of these fails the advisory Issue link check. A PR based on another branch does not close its issues on merge; the coordinator closes them. Set each phase's Status cell in its own PR. The PR delivering a PRD's last phase writes the steady-state docs and deletes the PRD.
- **ADR numbers.** An ADR takes the next free number in `docs/adr/`; check it at write time and again before your last push.
- **Docs.** Do not write agent vocabulary (coordinator, worker, slice, session, skill) into files under `docs/`, except `docs/operations/` runbooks that a person follows. A spike's research note has a date and a question and no slice, stream or lane header; an audit or checklist for one PR is a comment on the PR or its issue, not a file.

### Method and checks

- **Method.** Impact scan before touching shared code (list every consumer of what you change and its tests); tests first.
- **Settings.** The Settings page always keeps every setting; a working page may add a compact modal or side-panel entry, never remove or replace the Settings control.
- **SOLID.** Depend on the ports (`internal/dawport` roles, provider ports, `NarrationApi`), never on concrete adapters.
- **Testing (D43, D44).** Targeted checks only: Go tests of changed packages plus `go vet`, the Lua harness for Lua, Vitest of changed UI, pytest of changed sidecars, lint and typecheck of touched projects, and the visual states of pages you changed (`cd src/studio/ui && npx playwright test tests/visual/app.spec.ts -g "<page>.*<state>"`), looking at every viewport's PNG. Not the full `pnpm check`, the full visual suite or the atlas (a primitive's own atlas story is fine). Regenerate only your pages' guide images (`guide-screenshots.mjs <page>`), never all of `docs/images/ui`, and never `docs/ui`.
- **Wire contracts.** A new binding or event gets a Zod schema, a golden (`UPDATE_CONTRACTS=1`), a `wireContracts` row and a mock that passes it, plus a `hostAPIVersion` bump to `main` + 1. New REAPER commands: harness tests first, `wire.go` row, threat-model and `SECURITY.md` rows, declared as Experimental capabilities.

### Owner rules a worker repeats

D67 mock-first behind every port; D69 one app-wide theme, never force light or dark on a page; D70/D71 development audio from LibriVox (provenance recorded, audio kept out of git) or synthetic, results provisional; D72 fetch reference data freely, but never send the narrator's or authors' data out. The full rows are in [owner-rules.md](owner-rules.md).

### Usage and finish (D99)

Follow [the worker protocol](#the-worker-protocol) exactly: push after every green step, check #989 and your `rate_limit_info` at every checkpoint, pause or yield as it says. The session is one-shot: push, open the PR as soon as it is pushed, comment `<ID>: PR #… opened` on #989, reply with one short report (PR link, what you did, what you did not exercise) and end. Do not subscribe to the PR, wait for CI or answer review rounds: CI is the source of truth and the coordinator sends a fresh fixer for anything red. Never use `send_later` or any scheduling tool. Never merge. End every GitHub comment with a blank line, `---`, then `_Generated by [Claude Code](https://claude.ai/code)_`.
