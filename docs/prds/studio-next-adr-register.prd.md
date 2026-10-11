# Studio Next ADR Supersession Register: Which Accepted Decisions Keep, Extend, Yield or Are Decided by the Owner's Rulings

**Source:** owner requirement of 2026-10-10 for the Studio Next series: treat the PRDs as superseding existing ADRs wherever they conflict with the mock's design. On 2026-10-11 the owner withdrew the exception for a worse experience and ruled on all 18 conflicts that had been flagged for discussion: "The mocks are the gold standard and if it is not in the mock it doesn't get built. If it exists already and has an equivalent somewhere in the Studio Next mocks then get rid of the old. Anything that is there before: forget it."

**Builds on / appendix to:** [Studio Next Rebuild](studio-next-rebuild.prd.md), which summarises this register; every focused PRD of the series repeats its own rows in a "Supersedes / depends on ADRs" subsection. The decisions are the 336 files in [`docs/adr/`](../adr/README.md) at `550a7d1`; the rulings are `studio-next/research/repo-compare-decisions.md`.

**Status (2026-10-11):** draft; no row is open. This register writes no ADR and edits no existing ADR (they are immutable once accepted, [ADR rules](../adr/README.md#rules)). Each superseding ADR is authored with the `adr-author` workflow when the code of its phase lands, with the next free number checked at merge time ([Cross-PRD sequencing](README.md#cross-prd-sequencing)). The titles below are working titles.

## Problem Statement

The mock contradicts accepted ADRs in many places, and it also encodes owner rulings that the ADRs predate. Workers that read an ADR and a PRD that disagree need a rule for which wins, and the owner's rulings on the conflicts need one place where each is recorded with the ADRs it supersedes or keeps.

## Evidence

Every ADR was classified from its title and, for those touching UI, shell, state, keys, Booth, Proof, Pickups, Editing, Production, Story Bible, Script, the DAW port and bridge, takes and FX, Settings, the design system, mocks, accessibility, pronunciation and imports, from its Decision section. About 40 were read in full; the rest were classified from their titles and the code they name, and are marked "title-classified" where a worker must re-read before relying on the row.

## Proposed Solution

Four classes (every row is exactly one of them):

- **KEEP**: compatible, or the mock's mechanism is not adopted because the ADR is right for this repo (the narrator sees the mock's behaviour anyway).
- **EXTEND**: compatible; a PRD adds to it, and the new ADR (if any) says "extends".
- **SUPERSEDE**: the mock and the owner's rulings conflict and the PRD wins. The superseding ADR is authored when the phase lands.
- **DECIDED**: the owner ruled on a conflict (DQ-1 to DQ-18, 2026-10-11) and the ruling leaves the ADR or the shipped feature untouched, or the ruling is the one in the [Decided rows](#decided-rows-the-owners-rulings) table. Rows whose ruling supersedes an ADR are classed SUPERSEDE and cite their DQ.

**Migration-period rule.** On any conflict, the PRD (and the superseding ADR written when its phase lands) is the source of truth for the rebuild. The old ADR stays in force for code not yet migrated until the superseding ADR is merged; a slice that changes a behaviour an ADR names must say so and carry the superseding ADR in the same pull request or an earlier one.

## Key Hypothesis

If conflicts are classified once and every ruling is recorded against the ADRs it supersedes or keeps, no worker silently reverses a decision and no ruling is lost. We are wrong if a worker meets an ADR conflict that this register does not list.

## What We're NOT Building

- Any ADR text, status change or edit of an existing ADR.
- A question to the owner: nothing is pending.
- A re-litigation of any ruling: those in the decisions file and those of 2026-10-11 are SUPERSEDE or DECIDED rows, with the ruling cited.

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| ADRs covered | All 336 appear in a row | The coverage check run when this file was written (a script reading the numbers below) |
| Decided rows with a superseding ADR written as Proposed when their slice lands | 100% | Decisions register |
| Silent reversals | 0 | Review: every superseding ADR cites its register row |

## Decisions

The 18 conflicts (DQ-1 to DQ-18) are ruled; see [Decided rows](#decided-rows-the-owners-rulings). Nothing is open and no phase waits for the owner.

## Users & Context

The owner (accepts the superseding ADRs), the ADR author sessions (write the superseding ADRs), and every worker (reads a row before changing a behaviour an ADR names).

## Solution Detail

### Decided rows: the owner's rulings

Ruled by the owner on 2026-10-11. Each ruling is the plan; the superseding ADR is written as Proposed when the owning slice lands, and the old ADR's Status line changes in that pull request. "Working title" is the title of the new ADR that records the supersession.

| Q | Ruling | ADRs superseded or kept | Working title of the new ADR | PRD |
| --- | --- | --- | --- | --- |
| DQ-1 | Studio Next is the spec for every page it covers, including tokens, primitive sizes and layouts. The benchmark's measured values are superseded where they differ. | Superseded where they differ: 0585, 0590 to 0667, 0645, 0650, 0670, 0715, 0720, 0725, 0740 (primitive sizes, tokens and layouts measured to the benchmark mocks, D69). Kept where the mock agrees. The rule in `.claude/rules/ui-spec-and-screenshots.md` is replaced. | Studio Next is the spec for every page it covers (A1) | SNF, SNC |
| DQ-2 | Replace: a new page replaces its old counterpart in one PR for every page, Editing included. No flag, no period with two versions. | Kept: 0407 decision 1 | None | SNE |
| DQ-3 | The timer, PFH and effective rate have no equivalent in the mock: they stay as built and untouched; Production slices do not read or extend them. | Kept: 0320 | None | SNP |
| DQ-4 | The mock's plan chart and deadline tone from fixed inputs (WPH, ratio, pace; the projection may only worsen the tone) is the spec. | Superseded to that extent: 0404 ("shown, not projected"). Kept: 0015 | Plan chart and deadline tone from fixed inputs (A12) | SNP |
| DQ-5 | Record arms only the chapter's track and starts at the end of the last item; Space stays one action; a failed precondition shows the capability's refusal reason. | Superseded to that extent: 0380 ("arming is a separate click"). 0232 and 0249 are kept except where the mock's Record differs | Record arms the chapter's track and starts at the end of the last item (A10) | SNO |
| DQ-6 | Pickups only points to the Booth (no punch, no cursor move). The shipped Punch on the Pickups page (`pickupsPunch`) is removed in the Pickups swap slice. | 0246 is not changed by this ruling beyond A8 | Pickups points to the Booth and does not punch | SNQ, SNO |
| DQ-7 | Stacking retries follows the mock: later reads move onto the first read, the chapter shifts, the plan is shown first. | Superseded to that extent: 0147. Kept: 0032 | Stacking retries moves later reads onto the first read | SNE, SND |
| DQ-8 | Never delete: trims hide or mute, and deletion is the DAW's job. Trims go to the muted Cuts track as `delete_range` does. | Superseded: 0262 | Trims go to the muted Cuts track and nothing is deleted | SNE |
| DQ-9 | No conflict: the mock does not pick a default engine. Removed from the discussion list. | Kept unchanged: 0414 (default stays Whisper tiny until a real-time A/B), 0107 | None | SNO |
| DQ-10 | The mock's rule is the spec: suggestions at 75% or more are applied and flagged Review; under 75% need verification. | Superseded to that extent: 0020, 0042 | Extraction suggestions and tiers (A14) | SNX |
| DQ-11 | No query or confirmed workflow; pronunciation has a source, as in the mock. The query status, the author query CSV export and import and the rail badge counting open queries are removed with the Story Bible swap. | Superseded: 0346, 0347, 0352, 0725 | Pronunciation provenance without a query workflow (A11) | SNB |
| DQ-12 | The series voice bible and Series tab have no equivalent in the mock: untouched. | Kept: 0450, 0565 to 0568 | None | SN0 |
| DQ-13 | The Companion has no equivalent in the mock: frozen as built, no work. | Kept: 0381, 0401, 0659 | None | SN0 |
| DQ-14 | Schedule and Delivery are pages with their own rail items, as in the mock. | Superseded: 0407 decision 5 | Schedule and Delivery are pages with their own rail items (A13) | SNP, SNM |
| DQ-15 | The mock's take suggestion is the spec: evidence first, a suggested take with an honest (possibly null) confidence, never auto-applied. | Superseded to that extent: 0165. 0140 is extended | Take suggestion with honest confidence | SNE, SNQ |
| DQ-16 | The mock's Proof percent is the spec (it cannot read 100 while a pickup is open) together with its two counters, decided and cleared. | Superseded to that extent: 0525 | Proof percent and the cleared and decided counters (A18) | SNQ |
| DQ-17 | The mock's wheel-browse behaviour is the spec. | 0119 is kept only where it describes identical behaviour; superseded otherwise | Wheel browse follows the mock | SNO |
| DQ-18 | Capability-driven take management for Audacity, as in the mock. | Superseded to that extent: 0660 | Audacity backups table and capability-driven takes | SND, SNQ |

Rulings that remove an existing equivalent (DQ-6, DQ-11, DQ-14) are carried out in the owning page's swap slice; the [Cutover](studio-next-cutover.prd.md) lists the deletions.

### Register: every ADR, by area

Numbers are ADR numbers. A range means every ADR in it. "New ADR" is a working title.

#### UI foundation, design system, tests

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0001, 0002 | Import dialog width; dialog action placement | KEEP | | | |
| 0003, 0009, 0017 | Tailwind tokenised primitives; no new global classes; no legacy CSS shadowing | KEEP | Mock's `studio-next/src/styles/app.css` global classes are not adopted | SNF | |
| 0010, 0365 | Theme switching; one global theme | KEEP | `studio-next/src/app/layout.ts` `useTheme` agrees | SNF | |
| 0011, 0023, 0105, 0243, 0244, 0267 | Doc screenshots, visual suite and atlas contracts and sharding | KEEP | | | |
| 0016, 0063 | Highlight primitive | KEEP | | | |
| 0037 | No phone viewport | KEEP | Mock's `tiny` (<860) layout is not built | SNF | |
| 0038, 0060, 0061, 0064, 0065, 0465 | Visual suite builds, collapsed controls, reflow, axe, aria | KEEP | | | |
| 0047 | Primitives wrap Base UI only | KEEP | `studio-next/src/ui/primitives/` agrees | SNF | |
| 0048, 0057, 0094, 0172, 0630 | Dialog shell, running jobs, full dialog, popover layer, overlay frame | EXTEND | `studio-next/src/ui/overlay.ts` imperative API | SNR | Overlay service renders the existing primitives |
| 0049, 0050, 0051, 0054, 0055, 0056, 0058, 0059, 0363 | Tooltips, meter, slide-over, tabs, tag input, table, heading, text colour, tag backspace | KEEP | | | |
| 0052, 0053 | Menu, checkbox, switch; icon buttons and fields wrap native controls | EXTEND | `studio-next/tests/no-raw-controls.test.ts` (zero ceiling) | SNF | Raw controls are a zero ceiling per migrated page |
| 0062 | Import rules as dependency-cruiser | EXTEND | New `studio/`, `ports/`, `registries/`, `overlay/` rules | SNS, SNR | Rules for the new layers |
| 0046, 0045, 0043, 0044, 0171, 0410, 0415 | Architecture rules, dead code, coverage ratchet, deterministic properties, race detector, ADR index, markdownlint | KEEP | | | |
| 0201 | Zoom under Wails v3 | KEEP | Mock's `document.documentElement.style.zoom` not adopted | SNF | |
| 0360 | Studio primitives and capability gating | EXTEND | `studio-next/src/selectors/daw.ts` `gateOf` | SNF, SND | Adds Slider, NumberInput, Swatch |
| 0362, 0590, 0595, 0600, 0605, 0610, 0615 to 0620, 0625, 0635, 0636, 0640 | Token batches and primitive sizes measured to the benchmark mocks | SUPERSEDE where they differ (DQ-1) | Tokens and primitive sizes follow `studio-next/src/styles/app.css` and `studio-next/src/ui/primitives/` | SNF | Studio Next is the spec (A1) |
| 0585, 0740 | Mock fidelity scoring against the benchmark mocks | SUPERSEDE (DQ-1) | Fidelity is judged against the Studio Next mock page; the scoring tool is deleted at cutover except what the Series voice bible and Companion pages still need | SNF, SNC | Studio Next is the spec (A1) |
| 0620 | Kbd and KeyHint | EXTEND | `studio-next/src/ui/KeyCap.tsx` | SNF | Key cap pictures and icon vocabulary (A16) |
| 0367 | Per-speaker colours hash by name | EXTEND | `studio-next/src/selectors/speakers.ts` (entry colour override, stable pick by id) | SNB | Speaker colour override |

#### Shell, input, state, wire contracts

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0361 | Command registry and keymap | EXTEND | `studio-next/src/app/registry.ts`, `palette.tsx`, `help.tsx` | SNR | Jump menu, providers and help derived from the catalogue (A3) |
| 0069 | Zod behind parseWire | EXTEND | `studio-next/src/domain/*.ts` | SNS | |
| 0041 | Host bindings read services through one accessor | KEEP | Mock's whole-book store not adopted | SNS | Read-model store and command journal (A5) |
| 0075, 0076, 0077, 0078, 0079, 0081, 0136 | Acknowledge within 100 ms; job-ended; assets installed through one registry | EXTEND | `studio-next/src/providers/components.ts` maps to the registry | SNX, SNM | Analysis tools are registry assets |
| 0407 | New page replaces its old counterpart; nav grouped by stage; Schedule and Delivery stay panels | KEEP decision 1 (DQ-2), SUPERSEDE decision 5 (DQ-14) | Schedule and Delivery are pages with their own rail items | SNE, SNP, SNM | Schedule and Delivery are pages (A13) |
| 0725 | Rail count badges only from host counts; product named Studio | EXTEND, SUPERSEDE the open-query badge (DQ-11) | The badge counting open queries is removed with the Story Bible swap | SNB | Pronunciation without a query workflow (A11) |
| 0030, 0092, 0096 | Start without a project; REAPER discovery; demo basename | KEEP | `studio-next/src/pages/production/ProjectPicker.tsx` agrees | | |
| 0028, 0029 | PRDs deleted when built; tracked on GitHub | EXTEND | The series obeys both | SNC | |

#### DAW port, bridge, takes, FX

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0300, 0301, 0303, 0305, 0306 | DAW port, provider ports, factory, heartbeat transport, mastering port | KEEP | Same shape as the mock's `DawAdapter` | SND | |
| 0302 | Role value types, async role per command | EXTEND | `DawResult`, `Capability.mode` | SND | Result object and capability fields (A7) |
| 0304, 0400, 0230, 0403 | Gate per command; promotion; experimental switch; capabilities flag | KEEP | | | |
| 0031, 0066, 0067, 0068, 0253 | Lua bridge, harness, registry, events | KEEP | | | |
| 0143, 0121, 0122, 0123, 0146, 0163 to 0168 | Review via DawAdapter; go-to by GUID; marker; cleanup launchers | KEEP | `addMarker(kind)` prefix is additive | SNQ | |
| 0231, 0232 | Chapter track state; arming remembers arms, app stops only its own recording | EXTEND (0232 with DQ-5) | `studio-next/src/state/daw.ts` `recordStart` | SND, SNO | Record preconditions |
| 0233 | Make a take active by GUID | KEEP | | | |
| 0234 | FX chains on tracks; one plug-in on a passage | SUPERSEDE (range part) | `studio-next/research/repo-compare-decisions.md` "FX exception"; `studio-next/src/state/commands/scriptedit.ts` | SND, SNE | FX on a range of words (A9) |
| 0705 | Workspace adds an effect to a passage after confirmation | SUPERSEDE (chain on range) | Same | SNE | Folded into A9 |
| 0700 | Takes panel lists a passage's takes by an offered id | EXTEND | `studio-next/src/pages/proof/TakeLanes.tsx`, `studio-next/src/pages/editing/TakeParts.tsx` | SNQ, SNE | |
| 0147 | App never converts takes and lanes | SUPERSEDE (DQ-7) | Stacking (`studio-next/src/selectors/stacking.ts`) | SNE | Stacking retries moves later reads onto the first read |
| 0165 | A comparison never ranks | SUPERSEDE (owner follow-up, DQ-15) | `studio-next/src/selectors/takes.ts` `suggestTake` | SNE | Take suggestion with honest confidence |
| 0140 | Take metrics per category | EXTEND | `studio-next/src/providers/takes.ts` | SNE | |
| 0246 | Punch and roll move only the edit cursor | SUPERSEDE (roll part; the Pickups Punch is removed, DQ-6) | `studio-next/src/state/commands/booth.ts` roll, `studio-next/tests/booth-daw.test.tsx` | SND, SNO | Roll as one command (A8) |
| 0560 | Words anchored by aligning in the recording | EXTEND | Passage map written at record time (`studio-next/src/state/commands/passagemap.ts`) | SNO | |
| 0660 | Audacity hides REAPER take management | SUPERSEDE (DQ-18) | Capability-driven | SND, SNQ | Audacity backups table and capability-driven takes |
| 0355, 0144, 0145, 0460 | Audacity over the scripting pipe | KEEP | | SND | |
| 0262 | Cleanup trims split and delete | SUPERSEDE (DQ-8) | Never delete: trims go to the muted Cuts track | SNE | Trims go to the muted Cuts track |
| 0238, 0252, 0510, 0511, 0236 | Silence candidates, level normalize, click and breath signals | KEEP, EXTEND (0252: clause split can use persisted word times) | | SNE | |
| 0098, 0485, 0545, 0026, 0382, 0383 | Take provenance, native takes, line identity, markup, preview pin | KEEP | | | |
| 0455, 0357, 0247, 0402, 0412, 0413 | Built-in recorder; capture engine; input level; Windows only | KEEP, EXTEND (0455: a DAW row) | `studio-next/src/fixtures/daw.ts` `builtin` | SND | |

#### Booth and teleprompter

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0388 | Booth keyed by address; only Exit stops a session | SUPERSEDE (recording part), KEEP otherwise | Leaving while recording asks "Stop recording?" (`studio-next/src/state/store.ts` `setChangeGuard`) | SNO | Leave while recording (A10) |
| 0380 | Record in REAPER setting; arming separate from play | SUPERSEDE (DQ-5) | Record arms only the chapter's track | SNO | Record arms the chapter's track (A10) |
| 0196, 0248, 0720, 0655, 0656, 0658 | Space plays; pause; Booth fills the window; styles | KEEP | | | |
| 0111, 0112, 0187, 0205, 0206, 0349, 0353 | Resume point and prompt | EXTEND | `studio-next/src/state/commands/booth.ts` resume | SNO | |
| 0113, 0249, 0250 | Suggest chapter, arm check, mic preselect | KEEP | | | |
| 0115, 0116, 0117, 0118 | Live flags and read-aloud marks | EXTEND | Dismissible with a stable key (`studio-next/src/providers/speech.ts`) | SNO | |
| 0119 | Hand scroll pauses following | KEEP where identical, SUPERSEDE otherwise (DQ-17) | Wheel browse (`studio-next/src/pages/`, Booth) | SNO | Wheel browse follows the mock |
| 0021, 0022, 0024, 0033, 0034, 0035, 0104, 0106 | Live engines and follow | KEEP | | | |
| 0107, 0414 | Moonshine ships; default engine stays Whisper tiny | KEEP (DQ-9: no conflict) | The mock does not pick a default engine | SNO | |
| 0150, 0151, 0152, 0260, 0261 | Credits read in the Booth | KEEP | Mock's credits in Booth agree | | |
| 0381, 0401, 0659 | Companion | DECIDED (DQ-13): frozen as built, no work | No equivalent in the mock | | |

#### Proof, pickups, findings, recording check

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0120 | Findings read and decided with an evidence version | EXTEND | Stale guard and history (`studio-next/src/state/commands/proof.ts`) | SNQ | |
| 0470, 0650, 0651, 0652, 0715 | Proof follows the benchmark mock; notes card; waveform scope | EXTEND, SUPERSEDE where the mock differs (DQ-1) | `studio-next/src/pages/Proof.tsx` | SNQ | Cleared versus decided |
| 0525 | Proofing met by zero open pickup items | SUPERSEDE to that extent (DQ-16) | `studio-next/src/selectors/proof.ts` | SNQ | Proof percent and the cleared and decided counters (A18) |
| 0126 to 0132, 0204, 0264, 0341, 0344, 0351 | Recording check | EXTEND | Gap taxonomy and nullable confidence (`studio-next/src/selectors/gaps.ts`) | SNQ | Gap taxonomy |
| 0100, 0110, 0175, 0202, 0203, 0209, 0210, 0211, 0245, 0235, 0263 | Chapter-track map, sync, regions | KEEP | | | |
| 0212, 0242, 0265, 0520, 0550 | Workspace alignment, highlighting, peaks | KEEP, EXTEND for Editing | `studio-next/src/providers/alignment.ts` | SNE | |
| 0431, 0348, 0354, 0008, 0125 | Character review, continuity, timing confidence, corpus | KEEP | | | |
| 0124, 0141, 0266, 0327, 0329, 0430, 0575 | Take-review groups, per-take divergence, editing check panel, windowed findings, readiness ground truth, the engine panel, LibriVox signal evaluation | KEEP (0430: the engine chip and panel carry the DAW label from capabilities, EXTEND) | | SNQ, SNR | |
| 0160, 0161 | Stage recommendations and decisions | EXTEND | Chip and slide-over (`studio-next/src/pages/production/StageReadiness.tsx`) | SNP | |

#### Production, schedule, delivery, master

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0323 | Deadlines and milestones on the manifest | EXTEND | Payment type, milestone measure, estimate, done (`studio-next/src/selectors/milestones.ts`) | SNP | Plan fields (A12) |
| 0320 | PFH and effective rate from logged hours | DECIDED (DQ-3): untouched | No equivalent in the mock | SNP | |
| 0404 | Next up order; deadline shown not projected | EXTEND, SUPERSEDE "shown, not projected" (DQ-4) | `studio-next/src/selectors/nextup.ts`, `studio-next/src/selectors/progress.ts` | SNP | Plan chart and deadline tone from fixed inputs (A12) |
| 0406 | Status report omits amount unless opted in | EXTEND | `studio-next/src/selectors/report.ts` | SNP | |
| 0399, 0006, 0193, 0015, 0645 | Board cell opens stage; ordering; actual recorded; real progress only | KEEP; 0645 SUPERSEDE where it differs from the mock (DQ-1) | | | |
| 0179, 0180, 0440, 0170, 0322, 0025, 0155 | Delivery profiles and report | EXTEND | `studio-next/src/selectors/platform.ts` | SNP, SNM | Delivery profile capability lookup |
| 0321, 0366, 0435, 0480, 0343, 0342, 0325, 0237, 0156, 0158, 0666, 0667, 0665 | Mastering, export, measurement | KEEP | | | |

#### Story Bible, Script, pronunciation, extraction, imports

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0007, 0018, 0036, 0087 | Locked entries; read-only until edit | KEEP, EXTEND (drafts dropped on Cancel) | `studio-next/src/state/commands/bible.ts` | SNB | |
| 0020, 0042 | Precision over recall; suggestions skip needs-review | SUPERSEDE to that extent (DQ-10) | `studio-next/src/config/extraction.ts` | SNX | Extraction suggestions and tiers (A14) |
| 0345 | Stable entity ids, dialogue cues | KEEP | | | |
| 0346, 0347, 0352 | Pronunciation status, query CSV, re-import | SUPERSEDE (DQ-11) | Source plus manual (`studio-next/src/providers/pronunciation.ts`) | SNB | Pronunciation provenance without a query workflow (A11) |
| 0091, 0680, 0695, 0405, 0356, 0097, 0080, 0093 | Pronunciation as edited value, Piper phoneme block, sources, MW key, WordNet, language model asset | KEEP, EXTEND (0695 default source) | | SNB, SNX | |
| 0450, 0565, 0566, 0567, 0568 | Series storage and voice bible | DECIDED (DQ-12): untouched | No equivalent in the mock | SN0 | |
| 0392, 0393, 0670 | Script page layout | KEEP; SUPERSEDE where the layout differs from the mock (DQ-1) | | SNB | |
| 0005, 0088, 0090, 0004, 0013, 0014 | Reference material, front matter, whitespace, spans | KEEP | | | |
| 0019, 0086, 0089, 0095, 0099, 0101, 0102, 0103, 0135, 0239, 0240, 0241 | Import and chapter names | KEEP | `studio-next/src/format/headings.ts` agrees | | |
| 0183, 0191, 0207, 0208, 0324, 0333, 0495, 0152 | Credits and chapter kinds | KEEP | | | |

#### Release, CI, platform, docs, research (title-classified)

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0251, 0364, 0190, 0340, 0668 | Tool-run log, synthetic corpus, manuscript card header, async role from the live adapter, flush table bleed | KEEP | | | |
| 0012, 0200, 0027, 0039, 0040, 0070, 0071, 0072, 0073, 0074, 0082, 0083, 0084, 0085, 0197, 0411, 0416 | Media route, Wails v3, release, licence, layout, supply chain, update, installer, docs site | KEEP | | | |

## Technical Approach

The register is a document, not code. Its coverage is checked by a script when written (it reads the ADR numbers in the tables above, expands ranges, and lists every ADR file not covered); a worker adding an ADR later extends the register or notes the row in the PRD that owns the area. The rows move into each focused PRD's "Supersedes / depends on ADRs" subsection.

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Est. (pw) | PRP Plan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Re-read title-classified rows | A worker re-reads every title-classified ADR before its area is built | pending | all | - | 0.5 | - |
| 2 | Author superseding ADRs | Per phase, with `adr-author`, when code lands | pending | - | owning PRD phase | in each PRD | - |

### Phase Details

- **Phase 1.** Output is a comment on the owning slice issue, not a document.
- **Phase 2.** Each ADR cites its register row and the old ADR's Status line becomes "Superseded by" in that same pull request, per the ADR rules.

### Parallelism Notes

Both phases are independent of code slices except that Phase 2 follows each owning phase.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 2 | `docs/adr/` (add-only), the index | Every ADR-writing stream (number blocks) |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNG-1 | Phase 1 per area | owning PRD G0 | yes | Comment on slice issue |
| SNG-2 | Phase 2 | owning phase | yes | ADR index generated; old ADR Status updated |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| PRD wins on conflict; old ADR governs unmigrated code (owner, 2026-10-10) | Migration-period rule above | Edit ADRs now | ADRs are immutable once accepted |
| Mock wins; nothing outside the mock (owner, 2026-10-11) | Every conflict is ruled in the Decided rows; no DISCUSS class remains | Keep a discussion list for worse experiences | Owner ruling: the mocks are the gold standard |

## Research Summary

Read in full or in the Decision section: 0020, 0032, 0047, 0069, 0107, 0119, 0120, 0147, 0165, 0196, 0230, 0232, 0233, 0234, 0246, 0262, 0300 to 0304, 0320, 0345, 0346, 0360, 0361, 0367, 0380, 0381, 0388, 0401, 0404, 0407, 0414, 0455, 0525, 0660, 0700, 0705, 0725. The rest by title and the files they name. Not done: no code was run; the rulings of 2026-10-11 are applied as given.

## Visual Spec

None.
