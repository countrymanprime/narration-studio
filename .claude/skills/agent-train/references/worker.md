# The worker procedure

What a train worker, resume session or fixer reads: the protocol, the order of work, serial points, lanes, the guide rule and what a job builds to. The coordinator's procedure is in [coordinator.md](coordinator.md); the owner's standing rules are in [owner-rules.md](owner-rules.md); the prompts are in [templates.md](templates.md).

## The worker protocol

A worker is one cloud session for one stream. It opens one PR per phase, stacked on the previous one, and never merges.

- **Commit and push after every green step,** not just at the end. A session that dies on a usage limit loses only the work since its last push.
- **Checkpoints:** before each phase, and before any expensive step (the visual states of a page, a full Go race run, the atlas). At each checkpoint:
  1. Read the train issue's switches and Owner queue, and call `get_session` for your own `rate_limit_info` if the tool is available.
  2. On `HOLD`, `HOLD-UNTIL-RESET`, or RED in your own reading, or `DRAIN` unless you are lane K and the band is not RED: **pause.**
     - Commit your work in progress as `chore(<scope>): wip, paused at <step>` and push.
     - Open or update the phase's PR as a **draft** with a `## Resume notes` block:
       - Stream `<ID>`, PRD and phase
       - Done: the steps finished, with commit SHAs
       - Next: the exact next step
       - Failing: any failing check, with its output
       - Checks run: the local checks already passed
     - Comment `<ID>: PAUSED at <step>, PR #<n>` on the train issue, then end the session.
  3. On AMBER in your own reading (`allowed_warning`), **unless the train issue's `WARNING_POLICY` is `ignore`** (then a warning counts as GREEN, D63): **yield.** Finish the current PR to green, don't start the next phase, comment `<ID>: yielded after p<N>` on #989, and end.
  4. Otherwise, continue.
- **Order of work.** Plan, build the feature set, then test it together, with a cap on fix rounds:
  1. **Plan.** The slice issue holds the plan (the groomer writes it and a fresh subagent reviews it). A job from another source gets a short plan in the Handoff comment: the files, the behaviours the issue asks for and the checks that prove them. For more than a small change, have a fresh subagent review the plan against the issue before you build; it reports gaps, not style.
  2. **Build** the whole feature set the plan lists, not one test at a time.
  3. **Test.** Write the tests for every behaviour the issue lists. A bug fix is the exception: write the test that reproduces the bug first, because it proves the fix and costs one run.
  4. **Run the targeted checks once, together,** fix every failure they show, and run them again. Stop after three fix-and-run rounds: push what is green, put the failing check and its output in the Handoff comment and the PR body, and end; a fixer takes it.
  5. Never delete, skip or loosen a test to get green. When a test must go (the code it covered was removed or rewritten), say why in the PR body; the intent reviewer checks the reason.

  Tests are the definition of done, not a step-by-step ritual: published guidance asks for a check the agent runs itself, a separate reviewer and a stopping condition, not red-green per test ([Claude Code best practices](https://code.claude.com/docs/en/best-practices), [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)).
- **Open the PR as soon as the change is pushed (owner rule, 2026-10-18).** Do not wait for local checks to finish or for the owner to ask: open the PR (a draft only if the work is genuinely incomplete), list the checks still running as pending in the body, and update the body as they finish. The owner reviews from the PR, not from the session.
- **Finishing (D99, one-shot):**
  - Push and open the PR as soon as the change is pushed, report in one short message and end. Do not subscribe to the PR, wait for CI or answer review rounds.
  - Run only the one or two fastest targeted checks. CI is the source of truth.
  - Comment `<ID>: PRs #… opened` on the train issue, then end the turn.
  - A red check, a conflict or a review comment gets a new one-PR fixer session started by the coordinator, never a message into your session.
- **No resume-in-place:** there is no tool to send a follow-up task into a session that has already finished and gone idle. A stream's next PRD phase (D62) is always a **new** session, branched fresh off the current `main` tip — never a message into the old one. The gain from D62 is launching that new session the moment the phase is ready, not batching it to the next tick; it is not session reuse.
- **Owner steps:** anything needing the owner, REAPER, audio hardware or owner input goes in the train issue's Owner queue as a comment and is marked pending in the PR; the coordinator puts it on the owner board. Never wait for a human.
- **A missing tool or library is yours to install, not a blocker.** Cloud sessions run as root with `apt-get`, `npm`, `pip`/`uv` and `go` working through the proxy. If a check, hook or build fails because something is not installed, install it and re-run; do not report the check as impossible, skip it, or use `--no-verify`. Example: the pre-commit `check-go` hook and any Go build of `src/studio/desktop` need the Wails GTK libraries; run `apt-get update && apt-get install -y libglib2.0-dev libgtk-4-dev libwebkitgtk-6.0-dev libsoup-3.0-dev librsvg2-dev patchelf` (the same line as `.github/actions/setup-toolchain/action.yml`). Only when the install itself fails, say which package and quote the error (and read `read_documentation` `environment.network` if a host is denied) before you hand the step to someone else.
- **Tooling:** the repo's `SessionStart` hook (`scripts/cloud/session-start.sh`, registered in `.claude/settings.json`) installs the pinned toolchain. `.claude/settings.json` allows the build, test and git commands and denies force-pushes and rebases. Workers never edit `.claude/settings.json`; auto mode refuses that as self-modification, so any change to it goes in the Owner queue for the owner.

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

## What a job builds to

A job builds to the issue, the PRD and the page's current guide in `docs/guides/using-the-app/`, plus what the prompt's `REFERENCES` field names (a mock, a design draft, a guide page or a doc, each with what it is for). When the work needs a reference the prompt omits, say so in the Handoff comment and build to the issue.
