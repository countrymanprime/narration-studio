# Studio Next ADR Supersession Register: Which Accepted Decisions Keep, Extend, Yield or Wait for the Owner

**Source:** owner requirement of 2026-10-10 for the Studio Next series: treat the PRDs as superseding existing ADRs wherever they conflict with the mock's design, except where following the mock would give the narrator a worse experience; those are flagged for discussion with the owner and not decided.

**Builds on / appendix to:** [Studio Next Rebuild](studio-next-rebuild.prd.md), which summarises this register; every focused PRD of the series repeats its own rows in a "Supersedes / depends on ADRs" subsection. The decisions are the 336 files in [`docs/adr/`](../adr/README.md) at `550a7d1`; the rulings are `studio-next/research/repo-compare-decisions.md`.

**Status (2026-10-10):** draft. This register writes no ADR and edits no existing ADR (they are immutable once accepted, [ADR rules](../adr/README.md#rules)). Each superseding ADR is authored with the `adr-author` workflow when the code of its phase lands, with the next free number checked at merge time ([Cross-PRD sequencing](README.md#cross-prd-sequencing)). The titles below are working titles.

## Problem Statement

The mock contradicts accepted ADRs in many places, and it also encodes owner rulings that the ADRs predate. Workers that read an ADR and a PRD that disagree need a rule for which wins, and the owner needs the conflicts where the mock may be worse for the narrator set aside, not decided by an agent.

## Evidence

Every ADR was classified from its title and, for those touching UI, shell, state, keys, Booth, Proof, Pickups, Editing, Production, Story Bible, Script, the DAW port and bridge, takes and FX, Settings, the design system, mocks, accessibility, pronunciation and imports, from its Decision section. About 40 were read in full; the rest were classified from their titles and the code they name, and are marked "title-classified" where a worker must re-read before relying on the row.

## Proposed Solution

Four classes:

- **KEEP**: compatible, or the mock's mechanism is not adopted because the ADR is right for this repo (the narrator sees the mock's behaviour anyway).
- **EXTEND**: compatible; a PRD adds to it, and the new ADR (if any) says "extends".
- **SUPERSEDE**: the mock and the owner's rulings conflict and the PRD wins. The superseding ADR is authored when the phase lands.
- **DISCUSS**: the mock may be worse or riskier for the narrator, or the conflict is the owner's to settle. Nothing is built that depends on it until the owner answers; the owning PRD names the default the agents take if the owner does not (never for these rows: they stay blocked, see Agent Delivery "Guardrails").

**Migration-period rule.** On any conflict, the PRD (and the superseding ADR written when its phase lands) is the source of truth for the rebuild. The old ADR stays in force for code not yet migrated until the superseding ADR is merged; a slice that changes a behaviour an ADR names must say so and carry the superseding ADR in the same pull request or an earlier one. Where a page runs behind a per-page flag (only if SN0-Q2 B is accepted), the old ADR governs the old path and the new ADR the new path until the flag is removed.

## Key Hypothesis

If conflicts are classified once and the owner sees every DISCUSS row before the affected slice starts, no worker silently reverses a decision and no ruling is lost. We are wrong if a worker meets an ADR conflict that this register does not list.

## What We're NOT Building

- Any ADR text, status change or edit of an existing ADR.
- A decision on a DISCUSS row.
- A re-litigation of rulings the owner already made in the decisions file (those are SUPERSEDE rows, with the ruling cited).

## Success Metrics

| Metric | Target | Measured by |
| --- | --- | --- |
| ADRs covered | All 336 appear in a row | The coverage check run when this file was written (a script reading the numbers below) |
| DISCUSS rows answered before their slices start | 100% | Decisions register |
| Silent reversals | 0 | Review: every superseding ADR cites its register row |

## Open Questions

The DISCUSS table below is this PRD's open questions (DQ-1 to DQ-18). Each has a recommendation and the evidence that is missing; none is decided here.

## Users & Context

The owner (answers DISCUSS rows), the ADR author sessions (write the superseding ADRs), and every worker (reads a row before changing a behaviour an ADR names).

## Solution Detail

### DISCUSS rows: questions for the owner

| Q | ADRs | Mock behaviour | Narrator-experience trade-off | Recommendation | Evidence missing | PRD |
| --- | --- | --- | --- | --- | --- | --- |
| DQ-1 | 0585, 0590 to 0667, 0645, 0650, 0670, 0715, 0720, 0725, 0740 (primitive sizes, tokens and page layouts measured to the seven benchmark mocks, owner-approved as the build spec, D69) | Studio Next pages differ in layout and some controls from the benchmark (`studio-next/src/pages/`, `studio-next/src/styles/app.css`) | Rebuilding to the newer mock risks losing measured fidelity and the work behind it; keeping the benchmark leaves the app unlike the mock the owner now prefers | Studio Next wins for behaviour and layout of pages it covers; the benchmark's measured token values and primitive sizes stay unless a captured side-by-side shows the mock visibly differs; the owner picks per page from that side-by-side | No pixel or feature diff of the two spec sets exists | SNF, SNC |
| DQ-2 | 0407 decision 1 (a new page replaces the old in the same PR) | A large page (Editing) built beside the old one | Atomic swap never leaves two versions, but a 12-week page in one swap delays owner review; a time-boxed flag lets the owner look early but keeps two paths | Atomic for every page; a dev-only flag for Editing if the owner wants early review | How big the Editing swap PR will be | SNE |
| DQ-3 | 0320, the timer chip, PFH, effective rate | Time tracking deferred; no timer in the mock | Removing a working timer loses data the narrator may rely on; keeping it contradicts "deferred" and may show a number the mock does not | Keep as built; the series neither extends nor removes it; Production reads fixed inputs plus measurements | Whether the owner or anyone uses the timer | SNP |
| DQ-4 | 0404 ("the deadline is shown, not projected"), 0015 (real progress only) | Plan chart and deadline tone from fixed inputs WPH 9,300, ratio and pace (`studio-next/src/config/estimates.ts`, `studio-next/src/selectors/progress.ts`); the projection may only worsen the tone | A chart drawn from constants can look authoritative and be wrong for this narrator | Project only from measured values (own pace from measured chapter lengths, `studio-next/src/selectors/pace.ts`); with none, show the due date and days left | How accurate own-rate is on real projects | SNP |
| DQ-5 | 0380, 0232, 0249 (arming is a separate click; arms are remembered) | Record arms only the chapter's track and starts at the end of the last item (`studio-next/src/state/commands/booth.ts`, `recordCheck`); "Space stays the one action" | One action is fewer steps; an implicit arm changes the DAW's state under the narrator and could disarm another track | Arm as a visible step the first time in a chapter; a setting "Arm automatically on Record" default off; the arms are always restored | Whether the ruling meant implicit arming | SNO |
| DQ-6 | `pickupsPunch` on the Pickups page (shipped), 0246 | Pickups only points to the Booth; no cursor move or punch (ruling 12) | The narrator loses a one-click punch from the list; the Booth path costs navigation | Keep Punch on Pickups until the Booth's pickup session lands, then retire it in the same slice | How often Punch from Pickups is used | SNQ, SNO |
| DQ-7 | 0147 (the app never converts takes and lanes), 0032 | Stacking retries moves later reads onto the first read and shifts the rest of the chapter by the freed seconds (`studio-next/src/selectors/stacking.ts`) | Tidy takes, but markers, regions and other tracks tied to chapter time can slip | Confirm with the plan shown (as the mock), default "leave", REAPER first, Audacity steps only after the backups spike, refuse when the chapter has items outside the track or markers inside the moved span | How common sync-sensitive material is in narrators' projects | SNE, SND |
| DQ-8 | 0262 (cleanup trims are split and delete) | "Never delete": hide or mute; deleting is the DAW's job | A reversible trim is safer; a muted Cuts track clutters the project | Send trims to the same muted Cuts track as `delete_range` | Spike SND-S2 | SNE |
| DQ-9 | 0414 (default engine stays Whisper tiny until a real-time A/B), 0107 | Moonshine listens live in the Booth only; Whisper-class confirms after; picker lists what the host reports (ruling 7) | A faster engine may follow better or worse; changing the default untested risks the Booth losing the narrator's place | Keep the 0414 default; offer Moonshine in the picker as "live"; the owner's A/B (pending since the engines PRD) decides the default | The A/B run | SNO |
| DQ-10 | 0020 (precision over recall), 0042 | Suggestions at 75% or more are applied and flagged Review; under 75% need verification (`studio-next/src/config/extraction.ts`) | Fewer clicks, but a wrong entry may sit in the Story Bible unnoticed | Apply entries only; properties, claims and speakers always need verification; show the unreviewed count; "Mark reviewed" blocked while any needs verification | Calibration on real manuscripts (the research measured only the Alice trial with placeholder weights) | SNX |
| DQ-11 | 0346, 0347, 0352, 0725 (query status, the author query CSV, the Story Bible rail badge counts open queries) | No query or confirmed workflow; status is auto versus selected (ruling "Rejected") | A narrator who sends queries to authors loses the export; existing data carries statuses | Supersede as ruled; keep existing `status` and `note` readable and migrate the badge to the needs-review count | How many projects hold query data | SNB |
| DQ-12 | 0450, 0565 to 0568 (series storage and the voice bible) | One book per app; Series tab dropped (maybe list) | Dropping a shipped feature loses cross-book voice data | Keep the series features; the mock simply lacks them | Whether the owner wants them kept | SN0 |
| DQ-13 | 0381, 0401 (the Companion) | Deferred entirely; nothing to translate | "Deferred" could mean freeze or remove; removing a shipped mode is a loss | Freeze: keep the code, add no work | Owner intent | SN0 |
| DQ-14 | 0407 decision 5 (Schedule stays a panel of Production, Delivery a panel of Master & QC) | Both are pages with their own rail items | A separate Schedule page gives the milestone table room; a new nav item adds a serial change | Panels first; page only if the table does not fit at 1024 px | A screenshot at 1024 px | SNP, SNM |
| DQ-15 | 0165 (a comparison never ranks or names a best read) | A favoured take is suggested with evidence; confidence is null until levels are comparable (owner follow-up) | A suggestion can anchor the narrator | Show the evidence first and the suggestion as a chip, never preselected, never applied | Owner confirmation of wording | SNE, SNQ |
| DQ-16 | 0525 (a chapter is proofed when no pickup source has an open item) | Proof percent held at 99 while a pickup is open (`studio-next/src/selectors/progress.ts`) | A capped number is a made-up value | Show "cleared n of m" and no capped percent; leave the stage engine untouched | none | SNQ |
| DQ-17 | 0119 (a hand scroll pauses following until the current word is back in the band) | Wheel browse: hand scroll keeps the reading position (ruling 6) | Probably the same behaviour; if not, one of them loses the narrator's place | Keep 0119; confirm in the Booth slice that the mock's behaviour is identical | A side-by-side in the running Booth | SNO |
| DQ-18 | 0660 (Audacity hides REAPER's take management) | Audacity gets takes when backups are on, driven by capabilities | Showing take controls for Audacity could imply non-destructive editing; with backups off it must not | Capability-driven as the mock, with the destructive notice from the capability | Spike SND-S7 | SND, SNQ |

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
| 0362, 0590, 0595, 0600, 0605, 0610, 0615 to 0620, 0625, 0635, 0636, 0640 | Token batches and primitive sizes measured to the benchmark mocks | DISCUSS (DQ-1) | | SNF | |
| 0585, 0740 | Mock fidelity scoring against the benchmark mocks | DISCUSS (DQ-1), EXTEND | Studio Next would need a scoring source | SNF, SNC | Spec precedence (A1) |
| 0620 | Kbd and KeyHint | EXTEND | `studio-next/src/ui/KeyCap.tsx` | SNF | Key cap pictures and icon vocabulary (A16) |
| 0367 | Per-speaker colours hash by name | EXTEND | `studio-next/src/selectors/speakers.ts` (entry colour override, stable pick by id) | SNB | Speaker colour override |

#### Shell, input, state, wire contracts

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0361 | Command registry and keymap | EXTEND | `studio-next/src/app/registry.ts`, `palette.tsx`, `help.tsx` | SNR | Jump menu, providers and help derived from the catalogue (A3) |
| 0069 | Zod behind parseWire | EXTEND | `studio-next/src/domain/*.ts` | SNS | |
| 0041 | Host bindings read services through one accessor | KEEP | Mock's whole-book store not adopted | SNS | Read-model store and command journal (A5) |
| 0075, 0076, 0077, 0078, 0079, 0081, 0136 | Acknowledge within 100 ms; job-ended; assets installed through one registry | EXTEND | `studio-next/src/providers/components.ts` maps to the registry | SNX, SNM | Analysis tools are registry assets |
| 0407 | New page replaces its old counterpart; nav grouped by stage; Schedule and Delivery stay panels | DISCUSS (DQ-2, DQ-14) | | SNE, SNP, SNM | Time-boxed flag (A2) if the owner wants it |
| 0725 | Rail count badges only from host counts; product named Studio | EXTEND | Story Bible count source changes (see DQ-11) | SNB | |
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
| 0147 | App never converts takes and lanes | DISCUSS (DQ-7) | Stacking | SNE | |
| 0165 | A comparison never ranks | SUPERSEDE (owner follow-up), DISCUSS (DQ-15 wording) | `studio-next/src/selectors/takes.ts` `suggestTake` | SNE | Take suggestion with honest confidence |
| 0140 | Take metrics per category | EXTEND | `studio-next/src/providers/takes.ts` | SNE | |
| 0246 | Punch and roll move only the edit cursor | SUPERSEDE (roll part) | `studio-next/src/state/commands/booth.ts` roll, `studio-next/tests/booth-daw.test.tsx` | SND, SNO | Roll as one command (A8) |
| 0560 | Words anchored by aligning in the recording | EXTEND | Passage map written at record time (`studio-next/src/state/commands/passagemap.ts`) | SNO | |
| 0660 | Audacity hides REAPER take management | SUPERSEDE, DISCUSS (DQ-18) | Capability-driven | SND, SNQ | Audacity backups table |
| 0355, 0144, 0145, 0460 | Audacity over the scripting pipe | KEEP | | SND | |
| 0262 | Cleanup trims split and delete | DISCUSS (DQ-8) | | SNE | |
| 0238, 0252, 0510, 0511, 0236 | Silence candidates, level normalize, click and breath signals | KEEP, EXTEND (0252: clause split can use persisted word times) | | SNE | |
| 0098, 0485, 0545, 0026, 0382, 0383 | Take provenance, native takes, line identity, markup, preview pin | KEEP | | | |
| 0455, 0357, 0247, 0402, 0412, 0413 | Built-in recorder; capture engine; input level; Windows only | KEEP, EXTEND (0455: a DAW row) | `studio-next/src/fixtures/daw.ts` `builtin` | SND | |

#### Booth and teleprompter

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0388 | Booth keyed by address; only Exit stops a session | SUPERSEDE (recording part), KEEP otherwise | Leaving while recording asks "Stop recording?" (`studio-next/src/state/store.ts` `setChangeGuard`) | SNO | Leave while recording (A10) |
| 0380 | Record in REAPER setting; arming separate from play | DISCUSS (DQ-5) | | SNO | |
| 0196, 0248, 0720, 0655, 0656, 0658 | Space plays; pause; Booth fills the window; styles | KEEP | | | |
| 0111, 0112, 0187, 0205, 0206, 0349, 0353 | Resume point and prompt | EXTEND | `studio-next/src/state/commands/booth.ts` resume | SNO | |
| 0113, 0249, 0250 | Suggest chapter, arm check, mic preselect | KEEP | | | |
| 0115, 0116, 0117, 0118 | Live flags and read-aloud marks | EXTEND | Dismissible with a stable key (`studio-next/src/providers/speech.ts`) | SNO | |
| 0119 | Hand scroll pauses following | DISCUSS (DQ-17), KEEP | | SNO | |
| 0021, 0022, 0024, 0033, 0034, 0035, 0104, 0106 | Live engines and follow | KEEP | | | |
| 0107, 0414 | Moonshine ships; default engine stays Whisper tiny | KEEP, DISCUSS (DQ-9) | | SNO | |
| 0150, 0151, 0152, 0260, 0261 | Credits read in the Booth | KEEP | Mock's credits in Booth agree | | |
| 0381, 0401, 0659 | Companion | DISCUSS (DQ-13) | | | |

#### Proof, pickups, findings, recording check

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0120 | Findings read and decided with an evidence version | EXTEND | Stale guard and history (`studio-next/src/state/commands/proof.ts`) | SNQ | |
| 0470, 0650, 0651, 0652, 0715 | Proof follows the benchmark mock; notes card; waveform scope | EXTEND, DISCUSS (DQ-1) | `studio-next/src/pages/Proof.tsx` | SNQ | Cleared versus decided |
| 0525 | Proofing met by zero open pickup items | EXTEND, DISCUSS (DQ-16) | `studio-next/src/selectors/proof.ts` | SNQ | |
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
| 0320 | PFH and effective rate from logged hours | DISCUSS (DQ-3) | | SNP | |
| 0404 | Next up order; deadline shown not projected | EXTEND, DISCUSS (DQ-4) | `studio-next/src/selectors/nextup.ts` | SNP | |
| 0406 | Status report omits amount unless opted in | EXTEND | `studio-next/src/selectors/report.ts` | SNP | |
| 0399, 0006, 0193, 0015, 0645 | Board cell opens stage; ordering; actual recorded; real progress only | KEEP, DQ-1 for 0645 | | | |
| 0179, 0180, 0440, 0170, 0322, 0025, 0155 | Delivery profiles and report | EXTEND | `studio-next/src/selectors/platform.ts` | SNP, SNM | Delivery profile capability lookup |
| 0321, 0366, 0435, 0480, 0343, 0342, 0325, 0237, 0156, 0158, 0666, 0667, 0665 | Mastering, export, measurement | KEEP | | | |

#### Story Bible, Script, pronunciation, extraction, imports

| ADR | Decision (short) | Class | Mock behaviour and source | Owner PRD | New ADR (working title) |
| --- | --- | --- | --- | --- | --- |
| 0007, 0018, 0036, 0087 | Locked entries; read-only until edit | KEEP, EXTEND (drafts dropped on Cancel) | `studio-next/src/state/commands/bible.ts` | SNB | |
| 0020, 0042 | Precision over recall; suggestions skip needs-review | DISCUSS (DQ-10) | `studio-next/src/config/extraction.ts` | SNX | Extraction suggestions and tiers (A14) |
| 0345 | Stable entity ids, dialogue cues | KEEP | | | |
| 0346, 0347, 0352 | Pronunciation status, query CSV, re-import | SUPERSEDE, DISCUSS (DQ-11) | Source plus manual (`studio-next/src/providers/pronunciation.ts`) | SNB | Pronunciation provenance without a query workflow (A11) |
| 0091, 0680, 0695, 0405, 0356, 0097, 0080, 0093 | Pronunciation as edited value, Piper phoneme block, sources, MW key, WordNet, language model asset | KEEP, EXTEND (0695 default source) | | SNB, SNX | |
| 0450, 0565, 0566, 0567, 0568 | Series storage and voice bible | DISCUSS (DQ-12) | | SN0 | |
| 0392, 0393, 0670 | Script page layout | KEEP, DQ-1 | | SNB | |
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
| 1 | Owner review | The owner reads DQ-1 to DQ-18 and answers or defers each | pending | - | - | 0.2 | - |
| 2 | Re-read title-classified rows | A worker re-reads every title-classified ADR before its area is built | pending | all | 1 | 0.5 | - |
| 3 | Author superseding ADRs | Per phase, with `adr-author`, when code lands | pending | - | owning PRD phase | in each PRD | - |

### Phase Details

- **Phase 2.** Output is a comment on the owning slice issue, not a document.
- **Phase 3.** Each ADR cites its register row and the old ADR's Status line becomes "Superseded by" in that same pull request, per the ADR rules.

### Parallelism Notes

All phases are independent of code slices except that Phase 3 follows each owning phase.

### Parallel-session compatibility

| Phase | Files touched | Collides with |
| --- | --- | --- |
| 3 | `docs/adr/` (add-only), the index | Every ADR-writing stream (number blocks) |

### Slices

| Slice | Scope | Depends on | Parallel-safe | Verification |
| --- | --- | --- | --- | --- |
| SNG-1 | Phase 1 (decisions register entries DQ-1..DQ-18) | SN0-1 | yes | Each DQ has an answer or "waiting" |
| SNG-2 | Phase 2 per area | owning PRD G0 | yes | Comment on slice issue |
| SNG-3 | Phase 3 | owning phase | yes | ADR index generated; old ADR Status updated |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
| --- | --- | --- | --- |
| PRD wins on conflict; old ADR governs unmigrated code (owner, 2026-10-10) | Migration-period rule above | Edit ADRs now | ADRs are immutable once accepted |
| DISCUSS blocks | Nothing depending on a DISCUSS row is built | Take the recommendation | Owner instruction |

## Research Summary

Read in full or in the Decision section: 0020, 0032, 0047, 0069, 0107, 0119, 0120, 0147, 0165, 0196, 0230, 0232, 0233, 0234, 0246, 0262, 0300 to 0304, 0320, 0345, 0346, 0360, 0361, 0367, 0380, 0381, 0388, 0401, 0404, 0407, 0414, 0455, 0525, 0660, 0700, 0705, 0725. The rest by title and the files they name. Not done: no code was run; the benchmark-versus-Studio-Next diff does not exist yet (DQ-1).

## Visual Spec

None.
