# Verification and code-health tooling

What `pnpm check` and CI verify beyond "it lints and the example tests pass", how to run each check on its own, and how to add to it. How the jobs are wired is in [CI and releases](ci-and-releases.md); the reasons are in ADRs [0043](../adr/0043-coverage-is-a-ratchet-on-logic-directories-not-a-blanket-80-percent.md), [0044](../adr/0044-property-and-fuzz-tests-are-deterministic-in-the-gate.md), [0045](../adr/0045-dead-code-is-gated-at-zero-with-reasoned-ignores.md), [0046](../adr/0046-architecture-rules-taken-from-adrs-are-lint-and-test-rules.md) and [0062](../adr/0062-ui-import-rules-are-a-dependency-cruiser-config-and-a-mark-scan-that-name-their-adr.md).

| Check | Runs in | Run it alone |
| --- | --- | --- |
| Formatting: ruff (Python, the only Python formatter), Prettier (UI), gofmt, StyLua | `lint` and `format` targets | `pnpm exec nx run <project>:lint` |
| Go lint: golangci-lint v2 (errcheck, staticcheck, govet, unused, gosec, depguard) and checklocks | `narration-utils-shell:lint` | `pnpm exec nx run narration-utils-shell:lint` |
| Go race detector, on the packages with concurrency | `narration-utils-shell:test:ci` (CI only; it needs cgo) | `CGO_ENABLED=1 go -C apps/desktop test -race ./...` |
| Coverage ratchet on logic directories | the `test` targets of the projects with logic directories | `node scripts/ci/coverage-gate.mjs <go\|vitest\|pytest> <projectRoot>` |
| Property tests (Hypothesis, fast-check) and Go fuzz seed corpora | the same `test` targets | see below |
| Dead code: Knip | `narration-utils:knip` | `pnpm knip` |
| Import rules taken from ADRs: depguard, the script tracker's pytest | the Go lint and the teleprompter `test` target | with their targets |
| UI import rules: dependency-cruiser (primitives are leaves, wailsjs and the Wails runtime only in `src/api`, Base UI only in primitives, Zod only in `src/api`) and the `<mark>` scan | `narration-utils-ui:architecture`, and two Vitest files | `pnpm --dir apps/ui architecture` |
| Markdown links (lychee, offline) and PRD paths cited in source: see [the docs link check](ci-and-releases.md#the-docs-link-check) | `Docs / Links (offline)`; `repo-scripts:test-node` | `lychee --config .lychee.toml --offline .`; `node --test scripts/ci/prd-references.test.mjs` |
| Mermaid diagrams parse (Mermaid's own parser under jsdom, no browser) | `repo-scripts:test-node` | `node --test scripts/ci/mermaid-diagrams.test.mjs` |
| Playwright traces on a failing visual test (`trace: 'retain-on-failure'`, uploaded when a `ui-visual` step fails) | `ui-visual` | see [CI and releases](ci-and-releases.md) |
| Axe on every app state, with a declared, capped debt list | `ui-visual` (the visual suite) | `pnpm --dir apps/ui screenshots`, or `UI_AXE=1` to measure |
| Aria snapshots: the role trees of the dialogs, the slide-over and the navigation | `ui-visual`, after the screenshots | `pnpm --dir apps/ui run aria` |

## Go lint and the race detector

`apps/desktop/.golangci.yml` runs the `standard` set plus gosec and depguard and reports every finding (the defaults cap identical ones at three). The binary is pinned in `scripts/toolchain.json` and built with the repo's Go (`go install`, or `pnpm bootstrap`). Each exclusion in the file says why. A finding is fixed, or given a `//nolint:gosec // <reason>` comment. The two depguard rules are `no-network-outside-the-download-flow` and `analyzers-report-they-do-not-write` ([ADR 0046](../adr/0046-architecture-rules-taken-from-adrs-are-lint-and-test-rules.md)); to add a rule, copy one and name the ADR in its `desc`.

The lint target also runs gVisor's [checklocks](https://github.com/google/gvisor/tree/master/tools/checklocks) on the product code (`checklocks -test=false ./...`, about three seconds; pinned in `scripts/toolchain.json`). It analyses the Windows target on every host (`GOOS=windows` off Windows): it also analyses each dependency, and the pinned build panics on Go 1.27's Linux standard library (`fmt`, `os`, `internal/poll`), so a Linux run would crash before reaching our code. A field only touched under a lock says so with `// +checklocks:mu`, and a helper its caller holds the lock for says so with `// +checklocks:s.mu` (or `+checklocksread:s.mu` for a read lock); any access without the lock fails lint. A field checklocks sees used under a lock every time is reported until it is annotated, or given a trailing `// +checklocksignore: <reason>` when the lock is incidental (an atomic, read-only data). Declare one field per line in an annotated struct: checklocks pairs annotations with fields by position, so `a, b string` moves every later annotation onto the wrong field ([ADR 0171](../adr/0171-the-race-detector-runs-only-where-there-is-concurrency-and-checklocks-guards-the-locks.md)).

The race detector runs in CI only (`-race` needs cgo), and only on the packages it can find something in: `scripts/ci/coverage-gate.mjs` races every package whose source takes a lock, uses an atomic, starts a goroutine or makes a channel, or whose tests start goroutines, and runs the rest without it, printing which. `internal/measure` took 454 s under the detector and 4 s without it.

## Coverage ratchet

Only the logic directories in `scripts/ci/coverage-floors.json` are gated; components, host glue and sidecar-launch code are not. A floor is the rounded-down coverage when it was added and only goes up. To add a directory, add an entry at 80 or more (a lower floor needs a `reason`); to raise floors after adding tests, run the gate with `--update`. A few Go packages measure lower off Windows, so an entry can carry a `nonWindowsFloor` (and a `nonWindowsReason`) that applies on other hosts while `floor` stays the Windows number CI enforces. Details and the list of exempt code are in [CI and releases](ci-and-releases.md#coverage-ratchet).

## Property tests and fuzzing

Property tests run derandomized in the gate. To look for more bugs, run them randomized by hand:

```bash
# Python (Hypothesis): random seeds, 3000 examples per property
HYPOTHESIS_PROFILE=explore .venv/Scripts/python.exe -m pytest -q libs/python/tests sidecars

# UI (fast-check): random seeds, 5000 runs per property
VITE_FAST_CHECK_EXPLORE=1 pnpm --dir apps/ui exec vitest run src/components/manuscript src/components/primitives

# Go: coverage-guided fuzzing of one importer target (add -tags pdf_candidate for FuzzPdfDraft)
go -C apps/desktop test ./internal/importer -run='^$' -fuzz=FuzzAppendInline -fuzztime=60s
```

When a run fails it prints the counterexample (and a `@reproduce_failure` blob or a seed for the first two; Go writes `testdata/fuzz/<Target>/<hash>`). Turn it into a plain test in the same file (`@example(...)`, a named `it`/`Test...`, or keep the `testdata/fuzz` file), fix the code, and commit both. A new Hypothesis tests folder needs a `conftest.py` that calls `hypothesis_profiles.load()`, or its tests silently run randomized. When you write a property, check that its generator reaches the branches it claims to test (`hypothesis.event`, `--hypothesis-show-statistics`, or a reach assertion) and that mutating the code makes it fail; two properties in the first pass were vacuous until this was done.

## Dead code (Knip)

See [CI and releases](ci-and-releases.md#dead-code-check-knip). The short version: `pnpm knip` is at zero; delete the code or drop the `export`; add an ignore to `knip.jsonc` only with a reason.

## UI import rules

`apps/ui/.dependency-cruiser.mjs` has twelve rules over `src` and `tests`, run by the `architecture` target (about 2 s): `primitives-are-leaves` (a file in `components/primitives/`, a story or test too, imports nothing else under `components/`), `wails-bindings-only-in-api` (only `src/api/` imports `wailsjs/`), `wails-runtime-only-in-api` (only `src/api/` imports `@wailsio/runtime`, whose `Events` and `Call` reach the host without the bindings, [ADR 0200](../adr/0200-the-desktop-shell-runs-on-wails-v3-beta-pinned-at-v3-0-0-beta-25.md)), `base-ui-only-in-primitives` (a second guard behind `baseUiBoundary.test.ts`, [ADR 0047](../adr/0047-the-ui-primitives-wrap-base-ui-and-app-code-never-imports-it.md)) and `zod-only-in-api` ([ADR 0069](../adr/0069-payloads-are-validated-with-zod-behind-parsewire-and-a-wrong-shape-fails-loudly.md)). Seven more fence the Studio Next folders ([ADR 0770](../adr/0770-the-ui-store-caches-host-reads-and-journals-commands-and-the-go-host-stays-the-source-of-truth.md), [ADR 0781](../adr/0781-an-overlay-service-opens-dialogs-confirms-toasts-and-announcements-imperatively-and-renders-them-in-the-existing-primitives.md) for the overlay, [ADR 0780](../adr/0780-the-jump-menu-context-menus-and-help-are-derived-from-the-static-command-catalogue-and-dynamic-commands-come-from-providers.md) for the registries): `studio-does-not-import-components`, `bridge-only-at-the-composition-root` (`src/studio/`, `src/ports/`, `src/fixtures/` and `src/overlay/` never import `api/wailsClient`), `selectors-import-types-and-selectors-only` (`src/studio/selectors/` and `*.selectors.ts`, type-only imports allowed), `ports-and-fixtures-are-below-components`, `fixtures-do-not-import-the-store`, `overlay-imports-primitives-only` and `registries-import-no-feature` (`src/registries/` imports `components/primitives/`, `src/input/` and itself, no feature folder); the folders `ports`, `fixtures` and `overlay` do not exist yet. A failure names the rule and says what to do instead. To add a rule, add an entry to the file and a deliberate violation to `src/architectureRules.test.ts`, which writes each bad fixture and expects exactly that rule to fire. The `<mark>` rule of [ADR 0016](../adr/0016-highlight-primitive.md) needs syntax, not imports, so it is `src/highlightBoundary.test.ts` (a scan with an allowlist that carries a reason per entry and fails when an entry is stale); the tooling's config-protection hook refuses edits to `eslint.config.js`, so no lint rule was added. [ADR 0062](../adr/0062-ui-import-rules-are-a-dependency-cruiser-config-and-a-mark-scan-that-name-their-adr.md) records the rules; `design-spec-guard` cites them and keeps only the judgement calls.

## ADR index and topics

`scripts/ci/adr-index.mjs` builds the table in `docs/adr/README.md` from the ADR files ([ADR 0410](../adr/0410-the-adr-index-is-generated-from-each-adrs-heading-and-status-line-and-a-stale-index-fails-the-gate.md)). `scripts/ci/adr-topics.mjs` builds [ADRs by topic](../adr/topics.md) from the same files and `scripts/ci/adr-topics.json`: each ADR sits under the first topic that pins its number or whose title pattern hits. Both run as tests in `repo-scripts` (`scripts/ci/adr-topics.test.mjs`), so a stale page, a pin that names no ADR, or an ADR no topic claims fails `pnpm check`. After adding an ADR, run `node scripts/ci/adr-topics.mjs --write`; if it reports an unclaimed ADR, add a title pattern or a pin to the config. The same script prints one topic (`--topic <id>`) or searches titles (`--grep <words>`) for the `decision-index` skill.

## Aria snapshots

`apps/ui/tests/aria/` compares role trees with `toMatchAriaSnapshot` ([ADR 0065](../adr/0065-aria-snapshots-pin-the-role-trees-of-the-dialogs-the-slide-over-and-the-navigation.md)), in a Playwright run of its own (`playwright.aria.config.ts`, the same mock build, about 9 s). It pins each modal from `<body>` (the page behind an open modal is `aria-hidden`, so `/children: equal` at the root pins the role, the name and that nothing else is in the tree; a canary test removes the hiding and expects the snapshot to stop matching), the navigation list in its three shapes, and the info icon and its tooltip. A snapshot is partial by default: what it lists must be there, in order, and extra nodes are fine.

```bash
pnpm --dir apps/ui run aria                       # run the aria suite
pnpm --dir apps/ui run aria --update-snapshots    # rewrite the files with the full tree, then trim them and read the diff
```

Snapshots live in `tests/aria/snapshots/*.aria.yml`, hand-trimmed and commented. Reach a new state with a driver in `tests/visual/app.drivers.ts` (the visual suite needs it anyway) and add a test to `tests/aria/dialogs.spec.ts`. A red run uploads the traces with the visual suite's (`test-results/aria`).

## Mock match

`pnpm --dir apps/ui mock-match` measures how much of each benchmark mock the app reproduces: its layout, features and style, not its words (owner decisions, [ADR 0585](../adr/0585-mock-fidelity-is-a-pixel-match-at-the-mocks-own-size-and-theme-scored-by-a-tool-that-reports-and-does-not-gate.md), [ADR 0636](../adr/0636-the-mock-match-tool-scores-the-nav-rail-and-header-apart-from-the-page.md)). **The spec is `docs/research/mockups/audiobook-studio-benchmark/` and nothing else; every other mock was deleted** ([why](agent-train.md#which-mocks-are-the-spec)). **The number is a diagnostic, not a gate.** There is no percentage a state must reach, no reason to write when it falls short and no region-attribution table: look at the diff picture and at the mock, and build the page's features and styles. Since D98 (2026-10-11) the Studio Next mock is the spec for every page it covers and the tool does not score those pages; it stays only for the benchmark pages the mock lacks (06 Series voice bible, 07 companion) until cutover.

**Method.** For each mock listed in `apps/ui/tests/visual/mock-match/mocks.ts` it loads the mock-backend build at the mock's own size and theme (light against light, dark against dark), drives the app to the target state with the visual suite's driver, photographs it and scores it in two ways:

- **Match % (the headline) is text-blind.** `glyphs.ts` (`flattenGlyphs`) runs on both the mock and the capture and paints every glyph-like mark in the colour around it, so different words or numbers at the same size, weight and position score the same. It quantises each pixel to 4 bits per channel, labels the connected areas of one colour, and treats an area as a glyph mark when it is at most 32 px tall and either sparse (under 60% of its bounding box, which is what strokes look like) or a speck of a few pixels (anti-aliasing, an i-dot). A rule or border (at most 3 px thick, at least 16 px long) and any fill (a card, pill, badge, bar or filled dot) is dense or thin-and-long, so it stays. The fill colour is the most common colour of the kept pixels within 2 px. Everything is deterministic: no randomness, no font or machine dependence in the flattening itself.
- **Raw pixel %** is the plain comparison of the two photos, text and sample data included, kept beside the headline so nothing is hidden. **Ink match %** is the match over the pixels that are not page background in either image.

Both use the same comparison: a pixel matches when its YIQ colour difference is at most 0.1 of the maximum, and an anti-aliased pixel is forgiven. What the text-blind score cannot see: an outlined icon reads as a glyph, so an icon the app lacks is not counted; bold headings taller than 32 px, or so heavy their letters fill more than 60% of their box, stay in the score; a waveform or chart of sample data is a shape and is still compared. Check those by eye against the mock.

**Output.** A diff picture per state and a `scores.md` table in the gitignored `apps/ui/screenshots/mock-match/`; `MOCK_MATCH_BASELINE=<an earlier scores.json>` adds each score's change. The Nav rail and header are also scored on their own where the mock draws them (text-blind too). Rasterisers differ between machines, so compare two runs only from one machine. `MOCK_MATCH_CHROMIUM=<path>` points it at a Chromium other than Playwright's own, for a container whose browser is older than the pinned Playwright.

**Baseline** (2026-09-29, one machine, before this change's text-blind score: the raw column is the number the earlier notes quoted). Recorded for the six scored mocks; 06 (the series voice bible) draws a page the app does not have and is unscored:

| Mock | State | Theme | Match % (text-blind) | Raw pixel % |
| --- | --- | --- | --- | --- |
| 01 Production | `production/mock-fidelity-01` | light | 87.94 | 82.32 |
| 02 Script | `script/prep-rail-pronunciations` | light | 93.03 | 86.33 |
| 03 Booth | `booth/speaker-tags` | dark | 93.20 | 87.59 |
| 04 Proof | `proof/default` | light | 93.75 | 89.44 |
| 05 Master & QC | `master/mock-fidelity-05` | light | 92.06 | 85.76 |
| 07 Companion (420×900 crop) | `booth/companion-listening` | dark | 92.39 | 85.86 |

The Booth (03) and the companion (07) are scored at `booth/dark` (1440×900; `booth/speaker-tags` until the Studio Next Booth replaced the old page, SN-O10, so the 03 baseline above is the old page's) and `booth/companion-listening` (the active companion, at the mock's 420×900 crop). Layout and style are what the score is for, not the mock's sample data: don't seed demo data to raise it. What is left is content the app has no data for (the Schedule and Delivery items, the series chip, "following Ch 7") and features not built yet (Master's OUTPUTS list and its "Preview naming", "Edit chain" and "A/B" buttons).

## Gate stamp

`scripts/ci/gate-stamp.mjs` records that `pnpm check` passed on an exact working tree. `record` writes the hash of every non-ignored file to `.cache/gate-pass.json`; the hash comes from a throwaway index, so committing after a green run keeps the stamp valid and any later edit invalidates it. `pnpm check` runs `record` as its last step.

Nothing blocks on the stamp; `pnpm check` is not a precondition for pushing, because the pull-request pipeline runs the full gate. The script's `--hook` mode, and how to register it again, is described with the other agent hooks in [`.claude/skills/README.md`](../../.claude/skills/README.md#hooks).

## Merge safety checks

Four scripts in `scripts/ci/` check what merges while no person watches each pull request (the reasons are in [ADR 0758](../adr/0758-the-agent-train-is-watched-from-outside-and-gated-by-checks-a-worker-cannot-edit.md)). Each exports pure functions with a `node --test` file beside it, and the two that gate a pull request run from the base branch in CI, so a pull request cannot edit its own check.

- `train-health.mjs heartbeat` reads `Last pass:` from #509's body and comments once per stall on #510 when it is over two hours old and `HOLD` is not ticked. `train-health.mjs hold <reason>` ticks `HOLD` on #509 and says why. Both need `gh` and a token with `issues: write`.
- `test-ratchet.mjs <base-ref>` diffs `HEAD` against the merge base and prints one line per deleted test file, test file moved to a non-test path, added skip, focus or xfail marker in a test file, and coverage floor in `coverage-floors.json` that fell or was removed. It exits 1 on any. Run it locally before pushing a test change.
- `pr-risk.mjs <path>...` prints `high` or `normal` and the boundary each path touches. The list is in the script; `--json` reads paths from stdin.

## Reading a run

Every tool run (a host job, a sidecar launch, a Go tool decision) writes one JSON line per event to `%APPDATA%\narration-utils\logs\run.jsonl` (`run`, `tool`, `event`, `ts`, `level`, plus the event's own fields; never manuscript, audio or transcript text, [ADR 0251](../adr/0251-tool-runs-are-logged-as-json-lines-through-slog-with-a-run-id-and-content-is-never-logged.md)), rotated at 5 MiB with two backups (`internal/runlog`). `grep '"run":"<id>"' run.jsonl` (or `jq 'select(.run=="<id>")'`) isolates one run; `Begin`/`End` bound it and `Decision` records why a tool chose what it chose. A sidecar's own stderr for a run with debug on is captured separately, one file per run, at `logs/runs/<run-id>.stderr.jsonl` (pruned to the newest 20, or 7 days).

Turning on Settings > General > "Debug logging" raises the level from `info` to `debug` for new runs (a `NARRATION_DEBUG=1` environment variable forces `debug` for the whole session and cannot be turned back off from Settings, for a support session run from a terminal). "Open log folder" and "Copy diagnostics" (Settings; `SystemOpenLogFolder`, `SystemCopyDiagnostics`) reach the same files: the former opens `logs/` in the file manager, the latter saves one `.jsonl` bundle (the matching `run.jsonl` lines plus, for "last run", that run's stderr file) to a folder the narrator picks, for handing to an agent or attaching to a bug report.

## Not built, on purpose

These were considered and left out; the reasons are current as of the work that delivered this tooling.

- **Chromatic:** a SaaS visual service, redundant with the Playwright suite, and it cannot see the WebView2 host.
- **MSW:** the app talks to Wails bindings, not HTTP, and the mock API already covers tests.
- **Playwright component testing:** the experimental React packages were removed upstream; it would overlap the atlas.
- **Mutation testing as a gate:** Stryker's Vitest runner does not support Browser Mode and mutmut needs `fork` (WSL only on Windows). At most an occasional manual run on the parser modules.
- **Storybook Vitest addon:** only if atlas maintenance becomes a burden.
- **Vale** (prose lint) and **`eslint-plugin-jsx-a11y`:** the latter's peer range stops at ESLint 9 and this repository is on ESLint 10, and it overlaps axe.
- **Python type checking as a gate:** none for now; revisit `ty` as an advisory step when it reaches 1.0.
- **Crash reporting:** out by the privacy rule that analysis is local ([ADR 0032](../adr/0032-analyzers-report-findings-and-never-change-audio-or-manuscript-on-their-own.md)).
- **Pixel-baseline visual diffs:** a deferred spike ([#153](https://github.com/countrymanprime/narration-utils/issues/153)), started only after 50 consecutive stable `ui-visual` runs; baselines would come from a pinned Linux container and be stored outside the repository, and the result is an ADR either way.
- **An ESLint rule for the `<mark>` and Base UI import boundaries:** the tooling's config-protection hook refuses edits to `eslint.config.js`, so they are a Vitest scan and a dependency-cruiser rule with bad fixtures ([ADR 0062](../adr/0062-ui-import-rules-are-a-dependency-cruiser-config-and-a-mark-scan-that-name-their-adr.md)); add the lint rule by hand if wanted (the selector is in `highlightBoundary.test.ts`).
