# Studio Next Foundations: Tokens, Primitives, Layout Rules, Icon Vocabulary and Key Caps

**Source:** owner request of 2026-10-10 ([Studio Next Rebuild](studio-next-rebuild.prd.md)); the mock's `studio-next/src/ui/`, `studio-next/research/icon-audit.md` and the "no raw controls" standing rule in `studio-next/ARCHITECTURE.md`; the owner's rulings of 2026-10-11 (see Decisions).

**Builds on:** the delivered primitives ([Base UI wrappers](../design/design-system.md#base-ui-wrappers), [Design system reference](../design/design-system.md)), [the design system](../design/design-system.md), the zero-new-global-CSS rule ([Base UI wrappers](../design/design-system.md#base-ui-wrappers), [CSS layering gotcha](../design/design-system.md#css-layering-gotcha)) and the visual-suite viewports ([viewports.ts](../../apps/ui/tests/visual/viewports.ts), [Design system reference](../design/design-system.md)).

**Status (2026-10-16):** done; all eight phases are merged, the atlas docs by SN-F82. The owner's rulings of 2026-10-11 are applied. Tokens, primitive sizes and layouts come from the Studio Next mock (`studio-next/src/styles/`, `studio-next/src/ui/`), not from the benchmark mocks. Slice SNF-2 is a train-wide serial point (the token batch runs alone).

## Problem Statement

The mock draws every page from about 30 small components, one icon map, one key cap mapping and a 633-line global stylesheet. The real app already has the primitives and the rules, but three things stand between it and the mock's behaviour: a few primitives are missing (Slider, NumberInput, Swatch), icons and key hints are drawn in 55 files by hand rather than from a vocabulary, and the mock's responsive rules are written against the zoomed viewport width and must be expressed as container and media queries at the mock's widths. Pages cannot be rebuilt on a stable base until those are settled.

## Evidence

- **Primitives.** The mock's `studio-next/src/ui/primitives/` has Checkbox, RadioGroup, Input, Textarea, Select, Slider, NumberInput, FieldRow; `studio-next/src/ui/` adds Icon, IconButton, Pill, Seg, Swatch, Field, Menu, ChapterBar, Tooltip, Waveform, SpeakerPicker. The repo's `apps/ui/src/components/primitives/` has the equivalents of all but Slider, NumberInput, Swatch and the chapter stepper (and `SpeakerTag` stands in for the speaker chip).
- **Raw controls.** The mock bans them outright (`studio-next/tests/no-raw-controls.test.ts`, escape: a `native-control-ok: <why>` comment). The repo ratchets them down per file (`apps/ui/src/rawNatives.test.ts`).
- **Icons.** The mock draws every icon through `studio-next/src/ui/Icon.tsx` and a vocabulary decided in `studio-next/research/icon-audit.md` (sections 5 and 6: keep, change or text per action). 55 files in `apps/ui/src` import `FontAwesomeIcon` directly; there is no icon wrapper in `apps/ui/src/components/primitives/`.
- **Key caps.** `studio-next/src/ui/KeyCap.tsx` maps key names to pictures (arrows, Enter, Esc, Backspace as Font Awesome glyphs; space bar and right-click as inline SVG) and `studio-next/src/ui/KeyHints.tsx` draws the footer. The repo has `Kbd` and `KeyHint` (text caps only, [Design system reference](../design/design-system.md)).
- **Layout.** `studio-next/src/app/layout.ts` reads the zoomed viewport width (`RAIL_COLLAPSE_BELOW = 1360`, medium at 1280, narrow under 1180, tiny under 860) and sets `document.documentElement.style.zoom`. The real app zooms through the host ([Zoom](../guides/using-the-app/navigation.md#zoom)), the suite captures 1440, 1024 and 768 plus a 390 reflow, and the desktop minimum is 960. The mock's rules apply to the width the host reports (SN0-Q7).
- **Styles.** `studio-next/src/styles/app.css` is global classes; the real app forbids new ones and styles with Tailwind utilities on tokens.

## Proposed Solution

1. **Record the base** in two ADRs: spec precedence (A1: the Studio Next mock is the only spec) and layout rules plus icon vocabulary (A16).
2. **One token batch**, alone: the mock's token values from `studio-next/src/styles/`, replacing the repo's where they differ and adding those the repo lacks (diffed, not guessed), with contrast pairs.
3. **Add the missing primitives** as flat leaf files with stories, tests and atlas coverage: `Slider`, `NumberInput`, `Swatch`, and a `ChapterStepper` if the Booth and Proof need the same control.
4. **An `Icon` wrapper and a vocabulary** as data (`apps/ui/src/icons.catalog.ts`): action name to icon and tooltip wording, so two pages cannot give one action two icons. A ratchet test counts direct `FontAwesomeIcon` imports per file and only lets the number fall.
5. **Key caps and hints**: `Kbd` gains picture keys; `KeyHint` composes them; a `KeyHints` footer primitive replaces the Booth, Proof and Editing footers' hand-built rows.
6. **Responsive rules** re-expressed as container and media queries at the mock's widths (rail collapse below 1360, medium at 1280 and below, narrow below 1180, tiny below 860; `studio-next/src/app/layout.ts`), with one hook (`useLayoutClass`) only where CSS cannot do it.
7. **No raw controls**: lower the `rawNatives` ceilings with every page swap, and require a reasoned `native-control-ok` comment as the escape (replaces silent ceilings for the pages of this series).

## Key Hypothesis

If the base is settled once, page slices need no primitive work and no token edits, so they can run in parallel. We are wrong if more than two page slices in the series have to add a primitive or a token.

## What We're NOT Building

- Anything the mock does not show. Tokens are diffed against the mock, not redrawn.
- A port of `app.css`, of the mock's zoom mechanism, or of its Font Awesome map as a second icon system.
- Per-page forced light or dark (one app-wide theme, [D69](../design/design-system.md#theme)).
- A phone layout ([viewports.ts](../../apps/ui/tests/visual/viewports.ts)).
- Storybook rewrites beyond the new primitives' stories.

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| Missing primitives | 0 of Slider, NumberInput, Swatch left | Atlas coverage test |
| Direct `FontAwesomeIcon` imports outside `Icon` | Falls to 0 for migrated pages; never rises | New ratchet test |
| Raw native controls in pages of this series | 0 at cutover | `rawNatives.test.ts` |
| Contrast | Every new token has a `PAIRS` row and passes AA | `paletteContrast.test.ts` |
| Overflow and collapsed controls | None at 1440, 1024, 768 and 390 | Visual suite checks (`.claude/rules/ui-visual-verification.md`) |

## Decisions

Owner rulings of 2026-10-11; none is open.

| Id | Ruling | Consequence here |
| --- | --- | --- |
| SN0-Q1 / DQ-1 | Studio Next is the spec for every page it covers, tokens, primitive sizes and layouts included | SNF-2 takes the mock's values; `docs/design/colour-and-contrast.md#derived-and-status-tokens, apps/ui/src/styles.css` to 0640 and the benchmark's measured values are superseded where they differ; `docs/operations/verification-tooling.md#mock-match` stop binding pages the mock covers |
| SN0-Q7 | The mock's breakpoints are implemented as container or media queries at the mock's widths | Rail collapse below 1360 CSS px replaces the earlier 1280 recommendation; the 960 px minimum window and host zoom do not change the rules, which read the reported width |
| SNF-Q1 | The icon vocabulary is a data module, `apps/ui/src/icons.catalog.ts`, read by `Icon` and by a test that checks tooltips (default taken, standing instruction) | SNF-3 |
| SNF-Q2 | `Kbd` stays text; a new `KeyCap` leaf picks text or a glyph and `KeyHint` composes it (default taken) | SNF-4 |
| SNF-Q4 | `Slider` and `NumberInput` wrap Base UI ([Base UI wrappers](../design/design-system.md#base-ui-wrappers)) (default taken) | SNF-5a, SNF-5b |

## Users & Context

Every UI worker. Foundations are consumed by all page PRDs; they are the first slices that run (gate G1).

## Solution Detail

### User stories and acceptance criteria

| Story | Acceptance (tied to the mock) |
| --- | --- |
| As a narrator I see one icon per action everywhere | The Booth record button, Proof "Add marker" and Pickups "Mark done" use the vocabulary in `studio-next/research/icon-audit.md` section 6; a test fails when two catalogue entries share an icon with different meanings (audit section 3a) |
| As a narrator I read key hints as pictures | `KeyHints` footer draws arrows, Enter, Esc, Space, right-click as glyphs (`studio-next/tests/d2-keycaps.test.tsx`); each cap has the key name as an accessible name and tooltip |
| As a worker I never write a raw control | `studio-next/tests/no-raw-controls.test.ts` equivalent passes for migrated pages |
| As a narrator at 1024 px nothing overflows | `studio-next/e2e/overflow.mjs`-style check passes at 1440, 1024, 768 (the suite does it) |
| As a narrator I can set a speed or a gap with a slider or a number field | `Slider` and `NumberInput` match `studio-next/tests/form-primitives.test.tsx` behaviour (keyboard step, clamp, commit on blur) |

### Icon vocabulary rules (from the audit)

Text only for primary calls to action, segmented controls, chips and the audit's explicit text conversions; everything else an icon button with a tooltip; a nav or rail icon is never reused as an action; near-identical icons are not placed side by side. The catalogue is the single reference; the audit's mechanical change list (section 8) is applied by the page PRDs as they swap, not here.

### Supersedes / depends on ADRs

On conflict this PRD, and the ADR written when its phase lands, is the source of truth for the rebuild; an old ADR stays in force for code not yet migrated until the superseding ADR is merged ([register](studio-next-adr-register.prd.md)).

| ADR | Class | Note |
| --- | --- | --- |
| , [Base UI wrappers](../design/design-system.md#base-ui-wrappers), [CSS layering gotcha](../design/design-system.md#css-layering-gotcha) | KEEP | The mock's global `app.css` is not adopted |
| [viewports.ts](../../apps/ui/tests/visual/viewports.ts), [Design system reference](../design/design-system.md), [Zoom](../guides/using-the-app/navigation.md#zoom) | KEEP | Viewports and host zoom; the mock's breakpoints are applied to the reported width, its `style.zoom` mechanism is not adopted |
| [Base UI wrappers](../design/design-system.md#base-ui-wrappers) | KEEP / EXTEND | New primitives are flat leaves; token batch alone |
| [Design system reference](../design/design-system.md), [Base UI wrappers](../design/design-system.md#base-ui-wrappers) | EXTEND | Raw controls become a zero ceiling per migrated page |
| [Design system reference](../design/design-system.md) | EXTEND | Key cap pictures and the icon vocabulary (A16) |
| [Derived and status tokens](../design/colour-and-contrast.md#derived-and-status-tokens), [styles.css](../../apps/ui/src/styles.css) to [Design system reference](../design/design-system.md) | SUPERSEDE (DQ-1) | Token values and primitive sizes come from the Studio Next mock where they differ from the benchmark |
| [Mock match](../operations/verification-tooling.md#mock-match) | SUPERSEDE (DQ-1) | Spec precedence (A1): the Studio Next mock, not the benchmark, is scored against and built to |
| [Theme](../design/design-system.md#theme), [Derived and status tokens](../design/colour-and-contrast.md#derived-and-status-tokens) | KEEP | One app-wide theme (D69) |

## Technical Approach

**Interfaces.** `Icon({ name })` resolves a catalogue key to a Font Awesome definition; `IconButton` takes `action` (catalogue key) and derives `label` and tooltip. `KeyCap({ keyName })` and `KeyChord({ keys })` resolve against `KEY_GLYPHS`. `useLayoutClass()` returns `{ rail: 'full' | 'icons', medium, narrow }` from container width only where a query cannot express it.

**Data contracts.** None cross the host. The catalogue and glyph map are static data validated by tests (no duplicate meaning, every action has a tooltip).

**Architecture.** Leaf files in `apps/ui/src/components/primitives/` ([Base UI wrappers](../design/design-system.md#base-ui-wrappers) rules); catalogue and layout helpers in `apps/ui/src/`; Base UI imported only by primitives ([Base UI wrappers](../design/design-system.md#base-ui-wrappers)); no class added to `styles.css` ([CSS layering gotcha](../design/design-system.md#css-layering-gotcha)). The token batch edits `styles.css` token blocks and `paletteContrast.test.ts` once.

**Test plan.** Unit and story per primitive; atlas (`pnpm --dir apps/ui atlas`) in light and dark, wide and narrow; axe; visual suite on the pages that first use them; ratchet tests; `describe`-level property tests where the mock has them (number clamp).

**Rollout.** No flag. New primitives are unused until a page slice adopts them; Knip counts stories as use ([Dead code (Knip)](../operations/verification-tooling.md#dead-code-knip)), and the coordinator flags an unused primitive older than one wave.

**ADRs to author.** A1 spec precedence (with the owner); A16 layout rules, icon vocabulary and key cap pictures (supersedes nothing; extends [Design system reference](../design/design-system.md)).

**Risks.** The token diff touches colour used by every page (mitigation: the atlas strip and the full visual suite run once at the end of SNF-2); the icon sweep touches 55 files (mitigation: ratchet, migrate per page, never in bulk).

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Base ADRs | A1 and A16 as Proposed (A1 needs no owner answer); token and primitive diff note in `docs/research/` | done | 2 | SN0-1 | 0.5 | - |
| 2 | Token batch | Add missing tokens, `PAIRS` rows, dark values; runs alone | done | - | 1 | 0.8 | - |
| 3 | Icon wrapper and catalogue | `Icon`, `icons.catalog.ts`, ratchet test, stories | done | 4, 5 | 1 | 0.9 | - |
| 4 | Key caps and hints | `KeyCap`, `KeyChord`, `KeyHints` footer, stories | done | 3, 5 | 1 | 0.8 | - |
| 5 | Form primitives | `Slider`, `NumberInput`, `Swatch` (three parallel slices) | done | 3, 4 | 2 | 1.5 | - |
| 6 | Layout rules | Container and media queries, rail collapse, `useLayoutClass` if needed, visual rows | done | 5 | 2 | 0.9 | - |
| 7 | Raw-control gate | `native-control-ok` mechanism and per-page ceilings to zero as pages swap | done | - | 5 | 0.4 | - |
| 8 | Close-out | `design-system.md` rows, atlas docs regenerated once | done | - | 2 to 7 | 0.4 | - |

### Phase Details

- **Phase 2.** Diff the custom properties in `studio-next/src/styles/` against `apps/ui/src/styles.css`; the mock's value wins where they differ, and tokens no mock page uses are not added; both theme blocks; `PAIRS` rows; the full visual suite and the atlas once.
- **Phase 3.** The ratchet test is a copy of the `rawNatives` pattern for `FontAwesomeIcon`; entries per file only fall.
- **Phase 5.** One slice per primitive; each with the mock's test ported (`studio-next/tests/form-primitives.test.tsx`).
- **Phase 6.** Re-derive the rules from `studio-next/src/app/layout.ts` and `studio-next/e2e/overflow.mjs` at the mock's widths; capture the Settings reflow at 390; add a visual row for any of the four rules the suite's widths do not exercise.

### Parallelism Notes

Phases 3, 4 are independent of 2; Phase 5 needs the tokens. Phase 6 follows the tokens but may overlap with 5.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 2 | `apps/ui/src/styles.css`, `paletteContrast.test.ts`, `tokenContrast.ts` | Serial point: no other token edit may run |
| 3 | `apps/ui/src/icons.catalog.ts`, `components/primitives/Icon.*` | Any page slice adding an icon (adds a catalogue row; append-only) |
| 4 | `components/primitives/{Kbd,KeyHint,KeyCap}*` | Booth and Proof slices that edit footers (they wait) |
| 5 | `components/primitives/{Slider,NumberInput,Swatch}*` | `docs/design/design-system.md` rows (add-only) |
| 6 | `components/layout/*`, `AppShell.tsx` | The navigation serial point |
| 7 | `rawNatives.test.ts` | Page swaps lower entries (conflicts are mechanical) |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNF-1 | Phase 1 | SN0-1 | yes | Docs link check; ADR index generated |
| SNF-2 | Phase 2 | SNF-1 | no (serial point) | `pnpm check`; full visual suite and atlas read |
| SNF-3 | Phase 3 | SNF-1 | yes | `Icon` tests; ratchet test; atlas |
| SNF-4 | Phase 4 | SNF-1 | yes | Port of `studio-next/tests/d2-keycaps.test.tsx`; atlas; axe |
| SNF-5a | Slider | SNF-2 | yes | Story, tests, atlas, a11y |
| SNF-5b | NumberInput | SNF-2 | yes | Same |
| SNF-5c | Swatch | SNF-2 | yes | Same |
| SNF-6 | Phase 6 | SNF-2 | yes | Visual rows at 1440, 1024, 768; overflow checks |
| SNF-7 | Phase 7 | SNF-5a | yes | `rawNatives.test.ts` |
| SNF-8 | Phase 8 (done) | SNF-2..7 | no | `docs:atlas` regenerated; `pnpm check` |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| Icons by catalogue (proposed) | A data catalogue and one wrapper | Per-file imports | Two actions cannot drift to different icons |
| Layout by queries (SN0-Q7) | The mock's widths as CSS queries, a hook only where needed | Port the mock's zoom-width logic | The host zooms and reports the width; the rules stay the mock's |
| Tokens in one batch (existing) | One serial slice | Per-primitive token edits | [Base UI wrappers](../design/design-system.md#base-ui-wrappers) |

## Research Summary

Read: the mock's `studio-next/src/ui/`, `studio-next/src/app/layout.ts`, `studio-next/tests/no-raw-controls.test.ts`, `research/icon-audit.md` headings and section 6; the repo's `rawNatives.test.ts`, `components/primitives/*`, `docs/design/design-system.md`. Not done: the token diff itself (Phase 2 does it); no atlas run.

## Visual Spec

Mock pages: any page that shows a footer of key hints (Booth, Proof, Editing: `studio-next/src/ui/KeyHints.tsx`), the form controls in `studio-next/src/pages/Settings.tsx`. Each primitive slice shows its story in light and dark against the mock's control.
