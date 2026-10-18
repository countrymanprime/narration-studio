# One colour and one form per kind of highlighted thing

Dated 2026-10-18. Evidence, not kept current.

**Question.** The owner's rule: colour and shape follow what a thing is, not which page it is on. A character is highlighted the same on Script, Booth and Editing. A narrator mistake (extra words, a long silence, a mispronounced word) is the same kind of thing wherever it appears, and is drawn the same way as a text mark, a chip, a badge, a list row and a legend entry. What does the Studio Next mock draw, what does the app draw, where do they disagree, and what single map would give every kind one colour and one form?

Scope: read-only. No app code changed. Mock paths are under `docs/research/mockups/studio-next/src/` (`app.css` = `styles/app.css`, `sx.css` = `pages/editing/scriptedit.css`); app paths are under `apps/ui/src/`.

## Findings in short

- No shared kind-to-colour map exists. The audit found 38 separate local maps (list in [Maps to retire](#maps-to-retire)).
- The same narrator mistake has up to four colours across pages. Misread is red on Proof, Pickups and the Booth, amber on Editing. Extra words are red on Editing, blue on Proof's check card and the Booth, amber on Pickups, green in the mock's Proof diff.
- The same shape means different things: wavy is "low confidence" in Editing's `Word.tsx` and "misread" in the Booth's `Highlight`; dotted is "extra" in Editing and "skipped" in the Booth; dashed is "missing" in Editing and "restart" in the Booth.
- A Story Bible type reads four ways in the app: its chosen hue (Story Bible list), neutral (detail header, Script rail), red (`Highlight`), orange (Booth Reference chip).
- Script reader names get a muted dotted underline (`script/page/reader/Para.tsx:69`); the same entity in the Booth and in the mock is tinted in its type colour.
- The mock settles most statuses and the Proof finding types. It contradicts itself on extra words, misread/missing on Editing versus Proof, "active take", "open", and the speaker colour versus the entity colour.

## 1. Mock audit

Tokens: `app.css:3-8` (light), `:12-22` (dark): `--copper --ok --warn --bad --info --violet`, each with `-soft`. Every entity type, speaker and mark colour is one of those six (`MarkColour`, `domain/schemas.ts:64`). The pill is `.pill.{ok,warn,bad,info,neutral,copper,violet}` (`app.css:59`), the type tag `.type.t-*` (`:192-193`), the dot `.dot` (`:60`), the swatch `.swatch` (`:182`), the pipeline cell `.cell.{done,prog,open,wait}` (`:121-123`).

| Kind | What it is | Where, how drawn (mock) | Mock inconsistency |
| --- | --- | --- | --- |
| Entity type | Narrator-defined Bible type; defaults Character violet, Location info, Item warn, Event bad, Other ok (`fixtures/alice.ts:336-342`) | Reader name: 14% fill + 2px solid underline in `--ek` (`Para.tsx:14`, `app.css:157-158`). Booth and Editing word: 16% fill + 2px underline (`app.css:391`). Type pill (`BibleTab.tsx:10-12`, `SidePanel.tsx:30`). Swatch in lists, filters, pickers, Settings (`Bible.tsx:81,108`, `EntryPicker.tsx:22`, `Controls.tsx:181`) | `EntryEditor.tsx:147` hand-rolls the pill and draws copper on copper. Unknown type gives `faint-soft`, a token that does not exist. Reader fill 14% vs Booth/Editing 16%. Item/Event/Location/Character underlines collide with Query/Emotion/Pronunciation/Note marks of the same colour |
| Speaker | Who speaks a quote; colour from the entry, else a hash over the six hues (`selectors/speakers.ts:25`) | Chip: soft fill, hue text (`.phr-first::before` `app.css:300-303`, `.bchip` `:243-246`). Suggested: dashed border. Unknown `?`: dashed `--bad` | Speaker hue is independent of the same character's entity hue. The hash palette includes `bad`, the colour of the unknown-speaker chip. `.spk*` CSS (`app.css:151-156`) is dead |
| Narrator mark types | Word stress copper, Breath info, Pace ok, Emotion bad, Note violet, Query warn (`alice.ts:327-334`); six colours x six styles | Reader honours six styles (`app.css:162-167,316`); Booth/Editing draw every mark as a 3px solid underline (`app.css:247`). End markers `.e-note` violet, `.e-query` warn (`:169-170`) | Booth/Editing ignore the style. Notes are hard-coded violet; `look.note` is declared and unread (`fixtures/settings.ts:141`). `.a-query`, `.a-note` dead |
| Pronunciation | A word with a pronunciation entry | `.a-pron` info 2px dotted (`app.css:159`); Words tab pill Set ok / else neutral (`WordsTab.tsx:27,80`) | Same info + dotted as Breath mark and Location entity |
| Find hit, selection, playing word, bookmark | Positions and search | Find: info-soft + info outline; current: warn-soft + warn (`app.css:318`). Selection `--info-soft` + 2px info (`sx.css:25`). Playing `--copper` (`app.css:394`, `sx.css:21`). Cursor 2px `--focus` (`sx.css:24`). Bookmark copper ribbon (`bookmarks.css:2-3`) | Find reuses Location and Query colours |
| Finding type (Proof, Pickups) | `misread, skip, mouth, plosive, noise, breath, pron, pacing, repeat, takes` (`schemas.ts:186`) | Chip `.type.t-*` (`app.css:192-193`); pin `FINDING_COLOUR` (`selectors/proof.ts:21-24`): misread, skip `--bad`; mouth, plosive, noise, breath `--warn`; pron `--info`; pacing, repeat `--copper`; takes `--violet` | `.t-takes` has no CSS rule |
| Recording-check category | misread, skipped, repeated, extra, noise, breath, click (`fixtures/recordingcheck.ts:20-28`) | `.ccchip` with dot (`CheckCard.tsx:91`, `app.css:628-630`): misread bad; skipped bad; repeated copper; extra **info** dot with a **copper** `t-repeat` chip; noise, breath, click warn | Extra: dot and chip disagree |
| Editing word mistake | `DocItem.st` extra / mis / miss, plus derived low (`selectors/scriptedit.ts:16,376`) | extra: bad-soft fill, bad italic text, 2px dotted bad underline (`sx.css:28`); mis: warn-soft fill, 2px solid warn underline (`:29`); miss: faint text, 1.5px dashed warn box (`:30`); low: wavy warn underline (`:31`). Legend `.k-*` (`sx.css:119-122`); ribbon `.wv-*` (`:80-81`); flag card pills (`FlagCard.tsx:30,48,63,75`): extra bad, not read warn, misread/low warn, read twice violet | Legend swatch for low is a flat stripe, not wavy (`sx.css:122`). Word-effect legend reuses `.k-low` with a violet override (`Drawer.tsx:59`) |
| Proof script-vs-heard diff | Words in script not said / said not in script | `del` bad-soft, bad, strike; `ins` ok-soft, ok (`app.css:202`; `Inspector.tsx:53-65`; `format/diff.ts:14-17`) | An extra (said, not in script) is green here and red on Editing. `fixtures/alice.ts:198` marks a repeat with `<del>`, against the convention |
| Decision | `Resolution` (`schemas.ts:189`, `selectors/proof.ts:7-15`): pickup copper, edit info, waive ok, defer neutral, keep ok, fixed ok, unreviewed neutral | Pill in notes table, check card, Companion (`NotesTable.tsx:30`, `CheckCard.tsx:30`, `Companion.tsx:56`); decision buttons show only a copper outline when pressed (`app.css:206`) | Waive, keep, fixed are the same green |
| Pickup status | Recorded / Open | Pill ok / neutral (`Pickups.tsx:122`); Booth line 4px copper left border, green when recorded (`app.css:395-396`); Pickups type column `t-skip` red, extra `t-repeat` copper, misread red (`selectors/gaps.ts:65`) | "Open" is red in the pipeline cell, amber in the chapter strip, neutral in Pickups and the notes table |
| Chapter and pipeline status | Prep and stage state | `.cell` done ok, prog info, open bad, wait warn, none raised (`PipelineTable.tsx:77-114`); prep dot none ring / info half / ok solid (`.pdot` `app.css:135-137`); stage bar Delivered ok, Proofed `#5E9E6E` (hard-coded), Edited info, Recorded copper (`Production.tsx:52-58`) | Stage-bar colours differ from cell colours; hard-coded hex has no dark value |
| Readiness verdict | ready, notready, notchecked, progress, changed, confirmed (`selectors/readiness.ts:22`) | `.rchip` (`app.css:579-581`): ok, bad, neutral, info, warn, ok; evidence rows `.rd-item` (`:591-594`) | ready and confirmed differ only by icon |
| Schedule, Master, Delivery | On track / Tight / Behind; milestone Done / On track / At risk / Late; rule and file Pass / Fail / Waiting | Verdict pill ok / warn / bad (`VerdictPill.tsx:7-30`); milestone as `.cell` (`Schedule.tsx:19-30`); Master and Delivery pill ok / bad / neutral (`Master.tsx:121-176`, `Delivery.tsx:56-102`) | Waiting is neutral in Master and Delivery, warn in Schedule, a dash in the pipeline |
| Settings and Bible statuses | Installed, downloading, failed, repair; suggestion confidence | ok / info / bad / neutral / warn (`AnalysisTools.tsx:12-19`, `ModelsPane.tsx:15-18`); confidence chip warn if needs-verification else ok (`Suggested.tsx:18`) | Bible list shows every suggestion warn (`Bible.tsx:96`) |
| Takes | Identity, kept, active, muted | Violet is take identity everywhere in Editing (`sx.css:56-66,142`); kept ok; Active info in Editing (`TakeParts.tsx:211`), neutral in Proof (`Inspector.tsx:148`); selected band ok on Proof (`Wave.tsx:20`), violet lane on Editing (`Strip.tsx:52`) | Active take info vs neutral; selected green vs violet |
| Connection and recorder | Linked / built-in / not running | `Pill dot sm` neutral / ok / warn (`Shell.tsx:88-107`); Booth `.bchip2` drops the soft fill (`app.css:225-226`) | Booth form differs |

Other mock defects: the input meter uses hard-coded `#3FA66A #E3B04F #E5584B` (`app.css:228`); `ui/Markup.tsx` and `pages/companion/Markup.tsx` duplicate each other; `PILL` maps are duplicated in `AnalysisTools.tsx` and `ModelsPane.tsx`.

## 2. App audit

Tokens are in `styles.css` (`:63` light, `:243` dark). Entity hues `--character --place --org --review --lore --item --event`, each with a `-text` mix (43% hue, 57% `--text`); `-soft` exists only for character, place, org, review. Status `--danger --warn --info --ok` with `-soft`. `StatusBadge` tones: `neutral info progress accent success warning danger org experimental` (`primitives/StatusBadge.tsx:32-42`; `progress` and `accent` are identical).

### 2.1 Narrator mistakes, by surface

| Kind | Editing text (`editing/script/Word.tsx:37-43`) | Editing legend, card, ribbon | Proof check card (`CheckCard.tsx:40-47`) | Proof notes, pins | Pickups (`pickups/list/pickupRows.ts:61-70`) | Booth reader (`primitives/Highlight.tsx:56-96`, `booth/ReaderText.tsx:19`) |
| --- | --- | --- | --- | --- | --- |
| Misread | warn-soft fill, 2px solid warn underline | warning (`flags/Legend.tsx:5`, `FlagCard.tsx:69-74`); ribbon warn-soft | `--danger` dot | tag danger (`noteRows.ts:191`) | danger | **wavy** `--danger` underline |
| Missing / skipped | 1.5px **dashed** warn box | warning | `--warn` dot, labelled "Skipped" | skip tag **danger**; pin danger (`ProofPage.tsx:48-54`) | danger | **dotted** `--warn` underline |
| Extra | italic, danger-soft fill, 2px **dotted** danger underline | danger; ribbon danger-soft | `--info` dot | n/a | **warning** | inset bar `--info` |
| Low confidence | **wavy** warn underline | **info** dot and pill | n/a | n/a | n/a | n/a |
| Repeat / restart | n/a | "Read twice" org pill | n/a | repeat tag **org** | accent (regex) | restart: **dashed** `--accent` |
| Breath, click, noise | n/a | n/a | text-muted dot | warning tags | warning | n/a |
| Long silence / pacing | not drawn as a kind | not drawn | not drawn (`silence_cleanup` is only counted, `CheckCard.tsx:53`) | pacing tag **org** | accent (regex) | n/a |

Other mistake-related forms: Editing waveform bars of marked words are `--danger` (`editing/range/common/Strips.tsx:30`); take diff deleted danger-soft + strike, inserted ok-soft + underline (`editing/takes/TakeDiff.tsx:28,39`); the Production recording-check report prints missing words in `--danger-text` (`production/RecordingCheckReport.tsx:90,203`); `proof/flags.ts:99,134` (`FlagKind`) has labels and no colour. Recording-check count chips use an outlined `--line` chip with an 8px dot (`CheckCard.tsx:188-197`).

### 2.2 Story Bible types, speakers, marks

| Kind | Where, form (app) | Mismatch |
| --- | --- | --- |
| Entity type | Story Bible list and filter chips: Swatch of the narrator's chosen colour (`storybible/entryList.ts:66-77`, `Guide.tsx:463-470,549-550`, `FilterChip.tsx:6-17`). Detail header: Dot + pill by hard-coded category name (`manuscript/EntitySummary.tsx:14-35`). Script rail card: `Badge` by name (`script/page/rail/bible/kinds.ts:7,21-25`). Booth text: 2px underline + 16% tint of `--ek` (`booth/reading/BoothText.tsx:95`). Older Booth reader: `Highlight` 20% tint + 1.5px line (`booth/ReaderText.tsx:117`). Booth Reference chip (`booth/side/Reference.tsx:11,25`). **Script reader name: muted dotted 1px underline (`Para.tsx:69`)** | Four type-to-colour implementations; only the list, filters and Settings follow a renamed or recoloured type. Unknown type: grey (list), neutral (detail, rail), red (`Highlight`), accent (Reference). Fill recipes: `-soft` token (4 hues), 18% mix with surface (lore, item, event), 20% over transparent (`Highlight`, `SpeakerTag`). `TYPE_COLOUR_VAR` is unused outside its test. Dead CSS `styles.css:368-389`, `components.css:46` |
| Speaker | Script chip: solid `--speaker-N` fill (`Para.tsx:28-32,53`); Booth chip: 20% tint + border (`booth/reading/SpeakerChip.tsx:73-80`); `SpeakerTag` primitive has no importer in components | Unknown speaker: red dashed in Booth, grey in Script. Hash colour by speaker id (`speakerColor.ts`) differs from the entry's type colour |
| Narrator mark types | Script: highlight 22% tint, box ring, underline/double/dotted/wavy (`reader/markStyles.ts:5-30`). Booth: always 3px solid underline (`BoothText.tsx:96,108`) | Colour-to-token map written four times (`markStyles.ts`, `booth/side/decorations.ts:19`, `markSwatch.ts:5`, dialogs). Style lost in the Booth |
| Pronunciation word | `warn-soft` fill; set = ok solid underline, not set = warn dashed (`Para.tsx:79`) | Mock: info dotted |
| Find hit | Script `<mark>`: 25% / 45% + ring `--search` (`Para.tsx:99`); Find bar snippet: `Highlight Search` 20% + line (`tools/find/FindBar.tsx:106`) | Two recipes for one thing |
| Bookmark | Accent ribbon (`BookmarkRibbon.tsx:40-45`); Booth stale: warn triangle (`booth/bookmarks/BookmarkRibbons.tsx:74`) | `--bookmark` is defined in both themes and used by no non-test file |
| Credits placeholder | Script: review-soft fill, no underline (`CreditsSection.tsx:81`); Settings: `Highlight Review` (`CreditsPanel.tsx:311`) | Two forms |
| `--review` overload | Needs Review/Draft entries, DAW-off and no-audio banners, credits banner, REC fill, speaker 4 | One hue, five meanings |

### 2.3 Decisions, statuses, takes

| Concept | Forms in the app | Mismatch |
| --- | --- | --- |
| Pickup decision | danger (`FindingRow.tsx:33`, `NextUp.tsx`); accent (`noteRows.ts:45`) | Mock: copper (= accent) |
| Edit decision | warning (`FindingRow.tsx:33`); info (`noteRows.ts:45`) | Mock: info |
| Waive / Ignored | success (`noteRows.ts:47`); neutral (`FindingRow.tsx:44`) | Same decision, two tones |
| Defer | neutral (`noteRows.ts:49`); info (`proof/resolution.ts:38`, shadowed) | `resolution.ts` and `noteRows.ts` both define decision tones; only one is live |
| In progress | accent (`chapterStatus.ts:11-17`, `PipelineTable.tsx:21`, `DefinitionsBody.tsx:28`); info (readiness `progress`, `PrepDot.tsx`, `StageBar.tsx`, `ToolRow.tsx`) | Mock: info |
| Not checked | info (Master `RuleBadges.tsx:37`); neutral (readiness `verdict.ts:20`, check card, pipeline) | |
| To verify / evidence changed | warning outline (`RuleBadges.tsx`, `StageSuggestion.tsx:52`); warning soft (Bible, import, readiness, series) | Look differs for one meaning |
| Take states | Kept success, Active info, Muted neutral, Suggested accent (`editing/takes/TakeLines.tsx:31-53`); Proof Kept success, Active info (`proof/spot/SpotTakes.tsx:80`); selected band ok (`TakeLanes.tsx:25`) | Mock Proof Active is neutral; mock take identity violet |
| Install status | `PILL` map copied in `ToolRow.tsx:8`, `AssetRow.tsx:11`, `DefinitionsBody.tsx:28` | `ToolRow` lacks `repair`; `DefinitionsBody` uses accent for downloading |
| Others | `schedule/VerdictPill.tsx`, `MilestoneTable.tsx:13`, `master/RuleBadges.tsx:14-40`, `masterqc/page/PackageChecks.tsx:11`, `delivery/page/Preflight.tsx:9`, `settings/CapabilitySection.tsx:10`, `layout/EngineChip.tsx:57`, `booth/CompanionShell.tsx:59-63` | Each is its own map; tones agree with the mock except where listed above |

### 2.4 Defects found on the way (not colour policy)

- `--line` is used 27 times in `components/**/*.tsx` and is not defined in `styles.css`. A border using it falls back to `currentcolor`. Also undefined: `--warning-soft` (`editing/effects/AddEffect.tsx:42`, `EffectSettings.tsx:344`; should be `--warn-soft`), `--surface-muted` (`booth/side/VoicesNearby.tsx:81`, `Reference.tsx:25`), `--radius-panel`, `--radius`.
- `Highlight.tsx:52` cites `KIND_STYLES` (Transcript Compare), which no longer exists; `paletteContrast.test.ts:93,102` still names an "inline diff" pair.
- `booth/side/Reference.tsx:25` expects `${colour}-soft`, which lore, item, event and note do not have.

## 3. Mismatch table: kind, mock, app

"Mock" is what the mock settles; "App" is the range found. Full detail is in sections 1 and 2.

| Kind | Mock | App (range) | Mismatch |
| --- | --- | --- | --- |
| Misread | bad / red on Proof, Pickups; warn on Editing | danger (check card, notes, Pickups, Booth wavy); warning (Editing word, legend, card) | Editing vs everywhere else; shape differs by page |
| Missing / skipped | bad on Proof and Pickups; warn dashed box on Editing | warn (Editing, check card, Booth dotted); danger (notes, Pickups, report, pins) | Colour split; dashed box vs dotted underline |
| Extra words | bad on Editing; green `ins` in Proof diff; info dot + copper chip in check card; copper in Pickups | danger (Editing); info (check card, Booth bar); warning (Pickups) | Four colours |
| Repeat / restart | copper (Proof, Pickups, check card); violet "Read twice" (Editing) | org (notes, Editing card); accent (Pickups, Booth dashed) | Three colours |
| Low confidence | warn wavy (Editing text); stripe in legend | warn wavy (text); info (legend, card) | Text vs legend |
| Breath, click, noise, plosive | warn | muted dot (check card); warning tags (notes, Pickups) | Check card mutes them |
| Long silence / pacing | copper | org (notes); not drawn elsewhere | Not a drawn kind in text |
| Pronunciation | info dotted | warn dashed / ok solid (Script word layer); info (notes) | Script vs notes |
| Entity type | tint + 2px underline in type colour on every page | Script reader muted dotted; Booth tint + underline; `Highlight` tint + line; Reference accent | Script reader; unknown-type fallback; fill recipes |
| Speaker | soft chip; dashed suggested; dashed bad unknown | solid fill (Script); tint + border (Booth); grey unknown (Script) | Form; unknown colour |
| Narrator mark | colour and style everywhere in Reader; solid underline in Booth/Editing | same | Booth ignores style (the mock does too) |
| Find hit | info-soft outline; current warn-soft | `--search` tint, two recipes | Two recipes; mock reuses other kinds' colours |
| Bookmark | copper ribbon | accent ribbon; `--bookmark` unused | Dead token |
| Pickup decision | copper | danger / accent | Two tones |
| Edit decision | info | warning / info | Two tones |
| Waive, keep, fixed | ok (all three) | success; Ignored neutral | Same decision, two tones |
| In progress | info | accent / info | Two tones |
| Active take | info (Editing), neutral (Proof) | info; Suggested accent | Mock inconsistent |
| Take identity | violet | none (no violet except `--org`) | Mock hue has no app token to follow |
| Open pickup | red cell, amber strip, neutral pill | danger cell, neutral pill | Three tones |
| Waiting / not ready | neutral (Master, Delivery), warn (Schedule), dash (pipeline) | neutral / warning | Mock inconsistent |
| Needs review (entry) | warn pill | warning pill; `--review` highlight and banners | `--review` overloaded |

## 4. Proposed semantic map

Rules used to choose:

1. Follow the mock where it settles a kind (Proof's finding colours, statuses, resolutions, the entity mark).
2. Where the mock contradicts itself, pick one and mark it **owner decision**.
3. Few colours: the existing status tones (`danger warning info success`), `accent`, and the entity hues. No new hue is added.
4. Related kinds are one colour family; the specific kind is told apart by shape and label, never by colour alone.
5. Every text mark has a shape cue. Each shape is used for one kind app-wide.

### 4.1 Narrator mistakes and audio findings

| Kind | Family colour | Text mark (shape cue) | Chip form | Mock settles? |
| --- | --- | --- | --- | --- |
| Misread / mispronounced | `--danger`, text `--danger-text` | danger-soft fill + **wavy** underline | `tag` shape, danger | Colour: yes (Proof, Pickups). Editing's amber is dropped. Shape: new, owner decision |
| Missing / skipped | `--danger` | **dashed** box, no fill, muted text | `tag`, danger | Colour: yes (Proof, Pickups). Editing's amber is dropped. Shape from Editing |
| Extra words | `--danger` | italic + danger-soft fill + left **insertion bar** (the bar alone where zero-width) | `tag`, danger | **Owner decision.** Mock splits four ways; this joins Editing's red with the "words that are wrong" family |
| Repeat / restart | `--danger` | **double** underline | `tag`, danger | **Owner decision.** Mock: copper (Proof) vs violet (Editing) |
| Breath, click / mouth, plosive, noise | `--warn`, text `--warn-text` | none in running text; waveform pin and chip | `tag`, warning | Yes (Proof `FINDING_COLOUR`) |
| Low confidence | `--warn` | 1px **solid** thin warn underline, no fill | `tag`, warning; legend dot matches | Colour: yes (warn on Editing text). Legend `info` is dropped. Shape: owner decision |
| Long silence / pacing | `--accent` | none in text; waveform pin, chip | `tag`, accent | Mock: copper (= accent). **Owner decision** whether silence belongs in the audio-defect family (`--warn`); the app's `org` is dropped either way |
| Pronunciation differs | `--info` | **dotted** underline | `tag`, info | Yes (mock `.a-pron`, `t-pron`) |
| Take diff (script words not said / said not in script) | follows the kind: not said = missing, said = extra | the shapes above | n/a | Replaces green `ins` |

The family reads as: red = the words are wrong; amber = the audio or the recogniser is in doubt; blue = pronunciation. Under the owner's rule the "mistake" family is red. Whether red should be shared with errors such as "Fail" is an **owner decision**; the mock already shares it (misread, `Fail`, `Behind`).

### 4.2 Story Bible entities and speakers

| Kind | Colour | Text mark | Chip form | Mock settles? |
| --- | --- | --- | --- | --- |
| Entity of a type | The narrator's type colour (`storyBibleTypes.ts`), through one resolver that every surface calls. Six colours map to `--character --place --org --lore --item --event` | Tint + 2px solid underline in the hue, text `--<hue>-text` (the existing `Highlight` recipe; the mock draws this on Script, Booth, Editing) | `pill` with Swatch in lists and filters; type `tag` in headers | Yes. Script reader's muted dotted underline is dropped |
| Needs Review / Draft entry | `--warn` badge; entry itself drawn in the faint style | Faint text mark, no hue | `pill` warning | Mock: warn pill. **Owner decision** on the in-text mark; frees `--review` from the entity role |
| Unknown or deleted type | `--non-text` (faint) | solid faint underline | neutral `pill` | Mock: `faint` (but its soft token does not exist). One fallback everywhere |
| Speaker | The entry's own colour: its `speaker_color` if set, else its type colour. Narrator and unknown get no hue | n/a | Soft tint + hue text chip (`SpeakerTag`); suggested = dashed border; unknown = dashed neutral border | Chip form: yes (mock). **Owner decision:** drop the id hash so a character has one colour, and whether unknown stays red (mock) or neutral |

### 4.3 Marks, search, positions

| Kind | Colour | Form | Mock settles? |
| --- | --- | --- | --- |
| Narrator mark type | The narrator's chosen colour and style | One recipe on every page, honouring the style (Booth and Editing included) | Mock honours style only in the Reader. **Owner decision**: draw style everywhere |
| Note, query (marks with end markers) | Note: `--note`; query: `--warn` | Marker follows the mark's colour, not a fixed violet | Mock fixes violet and warn. **Owner decision** |
| Find hit | `--search` | 20% tint + 1.5px line; current hit adds a 2px ring | Mock reuses info and warn. Keep the app's own hue so a hit never reads as a Location or a Query. **Deviation, owner decision** |
| Selection, cursor, playing word | `--info-soft` (selection), `--focus` ring (cursor), `--accent` fill (playing) | one playing-word recipe on Booth and Editing | Yes (mock Editing) |
| Bookmark | `--accent` ribbon | as built | Mock: copper. Delete the unused `--bookmark` token or use it; **owner decision** |

### 4.4 Decisions, statuses, takes

| Concept | Tone | Mock settles? |
| --- | --- | --- |
| Needs pickup | `accent` | Yes (copper) |
| Fix in edit | `info` | Yes |
| Waive, Keep, Fixed, Accepted, Recorded, Pass, Ready, Confirmed, Done, On track, Installed, Kept take | `success`; label and icon carry the difference | Yes (mock shares green) |
| Defer, Not started, Not checked, Waiting, Muted, Unreviewed | `neutral` | Mostly. Master `not_checked` info becomes neutral |
| In progress, Active take, Downloading, Verifying, Checking | `info` | Yes. App's accent for chapter status moves to info |
| Changed, To verify, Evidence changed, Stale, At risk, Tight, Needs review, Repair | `warning`, `soft` look | Yes. Outline variants become soft |
| Failed, Fail, Not ready, Behind, Late | `danger` | Yes |
| Open pickup | **Owner decision**: `warning` (recommended; a thing still to do) vs the mock's three tones | Mock inconsistent |
| Take identity | No hue; state carries the colour. Mock's violet has no app token and would collide with Organization | **Owner decision** |
| Suggested take | `accent` | Mock violet; follows the pickup decision's accent |

Chip forms, one per role:

| Role | Form |
| --- | --- |
| Kind of finding, type of entry | `tag` (16px, uppercase) |
| Status, decision, verdict, resolution | `pill` (22px) |
| Pipeline, schedule, package cells | `cell` |
| Legend entry, dense list marker, count chip | `Dot` + label; the legend draws the same text mark as the document, not a flat swatch |
| Toggle filter | `Pill` toggle (as built) |

### 4.5 Tokens and contrast

No new hue is needed. Two gaps:

- `--lore-soft`, `--item-soft`, `--event-soft` do not exist. Recommended: one helper computes the 18% tint for every hue (the existing badge recipe, `paletteContrast.test.ts` rows `badge-*` and `highlight-*`), rather than three new tokens. If tokens are preferred, each needs `PAIRS` rows in both themes.
- Undefined tokens (`--line`, `--warning-soft`, `--surface-muted`, `--radius-panel`) are fixed in the first PR.

Existing recorded ratios ([colour-and-contrast.md](../design/colour-and-contrast.md#fills-and-surfaces)) cover the status text on its soft fill: danger 5.11 / 6.27, warn 4.78 / 6.78, info 5.52 / 6.78 (light / dark). The new combinations (danger text on `--danger-soft` over `--row-alt` and `--reading-bg`; the 1px low-confidence line and the 2px wavy and double underlines as 3:1 marks; `--info` dotted on reader rows) have no `PAIRS` row today and need one each. Not run: see [What could not be verified](#6-what-could-not-be-verified).

## 5. Enforcement

### 5.1 One shared module

Primitives may not import from `components/` (`architectureRules.test.ts`), and `chapterStatus.ts` already sits above the feature folders for that reason. The map goes beside it:

- `apps/ui/src/kinds/kindMap.ts` holds a closed `KindId` union (the table rows of 4.1 to 4.4), and per kind: label, family, `StatusTone`, text-mark recipe (token, shape, fill) and chip shape. It exports `kindTone(id)`, `kindMark(id)`, `kindChip(id)`.
- `apps/ui/src/kinds/entityColour.ts` is the one resolver for entries, types and speakers: `entryColour(types, entry)` wraps `typeColour`/`TYPE_COLOUR_VAR` (`storyBibleTypes.ts`), the fallback, the `-text` and tint recipes, and the speaker override. `SWATCH_OF_COLOUR`, `ENTITY_BADGE_COLORS`, `CAT_DOT_BG`, `KIND_HUE`, `entityColour`, `COLOUR_TOKEN`/`MARK_COLOUR`/`SWATCH` collapse into it.
- `apps/ui/src/kinds/statusTone.ts` holds the status, decision, verdict and take-state maps of 4.4.
- Primitives: `KindMark` (extends `Highlight`, replacing its `Misread/Extra/Skipped/Restart` entries with registry kinds; `Word.tsx` stops hand-writing classes and renders a `KindMark` span, since it renders thousands of words and needs the class string, not an element per word) and `KindChip` (a `StatusBadge` whose tone, shape and label come from the registry).

### 5.2 Guard test

`apps/ui/src/kindMap.test.ts`, written like `badgeShapes.test.ts` (per-file ceiling that may only go down, with a `PENDING` list naming each file still to migrate and its owner) and `highlightBoundary.test.ts` (TypeScript syntax tree, so comments do not trip it). It fails when:

1. A non-test file outside `kinds/` writes an object or `Record` literal with two or more keys from the kind vocabulary (`misread`, `missing`, `skip`, `skipped`, `extra`, `repeat`, `restart`, `breath`, `click`, `noise`, `plosive`, `pacing`, `low`, `pron`, `Character`, `Place`, ...) whose values contain `var(--`, a tone string or a Tailwind colour class.
2. A file under `components/` passes a `tone=` that is a string literal to a status or kind badge for a kind-vocabulary label (the registry call is the only route).
3. A `Record<Category, ...>` keyed by the entity category names, or a `switch` on them, appears outside `kinds/` (this catches `EntitySummary.tsx`, `kinds.ts`, `decorations.ts`).
4. A `var(--<name>)` with no fallback names a custom property that `styles.css` does not define (catches the `--line`, `--warning-soft`, `--surface-muted` class of bug; a separate describe block, fails on day one, so it ships with the fixes).
5. Every registry kind has a `PAIRS` row in `paletteContrast.test.ts` for its mark and its chip, and no two kinds in one scope share a (colour, shape) pair.

The `PENDING` list starts with every file in section 2 and shrinks by one page group per PR.

### 5.3 Plan in small PRs

| PR | Contents | Files | Guide and screenshots |
| --- | --- | --- | --- |
| 0 | Owner answers the decisions below; supersede the mock's lines in a PRD or `docs/design/colour-and-contrast.md` (the mock is frozen, [Which mocks are the spec](../design/design-system.md#which-mocks-are-the-spec)) | `docs/design/colour-and-contrast.md`, `docs/design/design-system.md` | none |
| 1 | Map, `KindMark`, `KindChip`, guard with full `PENDING`, undefined-token fixes, `PAIRS` rows, dead-code removal (`styles.css:368-389`, `components.css:36-46`, `TYPE_COLOUR_VAR` use) | `apps/ui/src/kinds/*`, `primitives/Highlight.tsx`, `StatusBadge.tsx`, `kindMap.test.ts`, `paletteContrast.test.ts`, `styles.css`, the files using the undefined tokens | No visible change except the undefined-token borders; `proof.md`, `editing.md` regenerated for those |
| 2 | Proof: check card, finding rows, notes table, pins, delete `resolution.ts` dead map | `proof/checkcard/*`, `proof/notes/noteRows.ts`, `proof/ProofPage.tsx`, `proof/resolution.ts`, `proof/spot/*` | `docs/guides/using-the-app/proof.md` and its images |
| 3 | Editing: word marks, legend, flag card, ribbon, found list, strip, takes | `editing/script/Word.tsx`, `editing/flags/*`, `editing/ribbon/*`, `editing/range/common/Strips.tsx`, `editing/takes/*`, `editing/drawer/FoundList.tsx` | `editing.md` and images |
| 4 | Booth: reader flags, key, text marks (style honoured), speaker chip, Reference chip | `primitives/Highlight.tsx` callers, `booth/ReaderText.tsx`, `booth/ReaderKey.tsx`, `booth/reading/*`, `booth/side/*`, `booth/readerFlags.ts` | `booth.md` and images |
| 5 | Script: names, speaker chips, rail Bible kinds, marks, Find hit, credits placeholder, word layer | `script/page/reader/*`, `script/page/rail/*`, `script/page/chapters/CreditsSection.tsx` | `script.md` and images |
| 6 | Pickups and Story Bible: type column, entry list, detail header, entity summary, Settings types panel | `pickups/list/*`, `storybible/*`, `manuscript/EntitySummary.tsx`, `settings/page/StoryBibleTypesPanel.tsx`, `settings/CreditsPanel.tsx` | `pickups.md`, `story-bible.md`, `settings.md` and images |
| 7 | Statuses: Production, Schedule, Master/QC, Delivery, Settings tools and models (one `PILL` map), capability, engine chip | `production/*`, `schedule/*`, `master/*`, `masterqc/*`, `delivery/*`, `settings/analysis/*`, `settings/models/*`, `chapterStatus.ts` | `production.md`, `schedule.md`, `master-and-qc.md`, `delivery.md`, `settings.md` and images |

Each of PRs 2 to 7 follows [UI PRs update the how-to guide](../../CONTRIBUTING.md#ui-prs-update-the-how-to-guide): `pnpm --dir apps/ui visual:page <page>`, `atlas:page <page>`, and `node scripts/dev/guide-screenshots.mjs <page>` for the images. PRs 2 to 7 are disjoint file sets and can run in parallel after PR 1; PR 1 touches `styles.css` token blocks and `paletteContrast.test.ts` `PAIRS`, which the delivery rules serialise.

### 5.4 Owner decisions

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Mistakes family colour: red for misread, missing, extra, repeat | Yes; shares red with `Fail`, as the mock does |
| D2 | Extra words: red with an insertion bar, replacing Proof's green `ins` and the check card's info dot | Yes |
| D3 | Repeat / restart: red with a double underline (mock: copper or violet) | Yes |
| D4 | Long silence / pacing: `accent` (mock) or the amber audio family | Amber, to keep `accent` for decisions and positions; the mock says copper |
| D5 | The shape set in 4.1 (wavy, dashed box, bar, double, thin solid, dotted) | Accept after a screenshot pass on both themes |
| D6 | Speaker colour: the entry's own colour, no id hash; unknown speaker red dashed (mock) or neutral dashed | Entry colour; neutral dashed |
| D7 | Needs Review / Draft entries: warn, freeing `--review` from the entity role and banners | Yes |
| D8 | Narrator marks draw their style on Booth and Editing; end markers follow the mark colour | Yes |
| D9 | Find hit keeps its own `--search` hue (deviation from the mock) | Yes |
| D10 | Open pickup: warning | Yes |
| D11 | Take identity has no hue; Suggested take is accent | Yes |
| D12 | `--bookmark`: delete the unused token or adopt it | Delete |
| D13 | Entity tint helper (no new tokens) vs three new `-soft` tokens | Helper |

## 6. What could not be verified

- No page was rendered. Every colour and form above comes from reading source and CSS, not from screenshots of the mock or the app. Whether the shape set in 4.1 is distinguishable at reading size is unchecked (D5).
- Contrast for the new combinations in 4.5 was not computed and `paletteContrast.test.ts` was not run; only the recorded ratios in `colour-and-contrast.md` are cited. Dark-theme behaviour of the new marks is unchecked.
- The two audits were done by reading in parallel; I re-read the lines for Proof's `COUNT_COLOUR`, Editing's `Word.tsx` `MARK_CLASS`, `Highlight.tsx`, `pickupRows.ts` `typeTone`, `noteRows.ts` `TYPE_TONE`, the mock's `FINDING_COLOUR` and `.type` rules, and the count of `var(--line)` uses. The remaining file:line references (about 150) are as reported and not all re-read.
- Dynamic behaviour (a renamed or recoloured type, a user-set note colour, which `resolutionWords` row is reachable) was inferred from code, not exercised.
- The decisions register (issue #993) and the PRDs were not read, so a decision there may already settle one of D1 to D13.
- Settings overrides (`settingsForms.tsx:26-35`) can recolour entity hues and the note colour at runtime; the proposed map assumes the same override path stays.
- Maps in `docs/ui/` generated pages and `tests/visual` catalogues were not checked for kind-colour assumptions that PRs 2 to 7 would break.

## Maps to retire

`TYPE_COLOUR_VAR` (`storyBibleTypes.ts:6`); `SWATCH_OF_COLOUR` (`storybible/entryList.ts:66`); `ENTITY_BADGE_COLORS`, `CAT_DOT_BG` (`manuscript/EntitySummary.tsx:14,26`); `KIND_HUE`, `kindColours` (`script/page/rail/bible/kinds.ts:7,21`); `TOKEN`, `TEXT_TOKEN`, `FLAG_DECORATION` (`primitives/Highlight.tsx`); `entityColour`, `MARK_COLOUR` (`booth/side/decorations.ts:11,19`); `FLAG_HIGHLIGHT` (`booth/ReaderText.tsx:19`); `COLOUR_TOKEN` (`script/page/reader/markStyles.ts:5`); `SWATCH` (`script/page/rail/threads/markSwatch.ts:5`); `CHIP_LOOK` (`Para.tsx:27`); `MARK_CLASS` (`editing/script/Word.tsx:37`); `KIND_TONE` (`editing/flags/Legend.tsx:5`); `shape()` (`editing/flags/FlagCard.tsx:68`); `RIBBON_TOKENS` (`editing/ribbon/drawRibbon.ts:6`); `COUNT_COLOUR`, `STATE_TONE` (`proof/checkcard/CheckCard.tsx:39`); `PIN_COLOUR` (`proof/ProofPage.tsx:48`); `TYPE_TONE`, `resolutionWords` (`proof/notes/noteRows.ts`); `RESOLUTION` (`proof/resolution.ts:34`); `STATE_CLASS` (`proof/frame/ChapterStrip.tsx:16`); `typeTone` (`pickups/list/pickupRows.ts:61`); `STATUS_TONE` (`chapterStatus.ts:11`); `FILL` (`production/overview/StageBar.tsx:7`); `KIND_TONE` (`production/pipeline/PipelineTable.tsx:21`); `VERDICT_TONE` (`production/readiness/verdict.ts:17`); `TONE_MARK` (`production/pipeline/PageHeader.tsx:11`, `overview/overviewFigures.ts:18`); `DISC` (`production/pipeline/NextUp.tsx:19`); `KIND`/`LABEL` (`schedule/VerdictPill.tsx:12`); `STATUS_TONE` (`schedule/MilestoneTable.tsx:13`); `STATUS_TONE`, `LOOK`, `RESULT` (`master/RuleBadges.tsx:14-40`); `BADGE` (`masterqc/page/PackageChecks.tsx:11`); `TONE` (`delivery/page/Preflight.tsx:9`); `PILL` x3 (`settings/analysis/ToolRow.tsx:8`, `settings/models/AssetRow.tsx:11`, `settings/controls/DefinitionsBody.tsx:28`); `LEVEL` (`settings/CapabilitySection.tsx:10`); `STATUS_COLOR` (`engine/LinkChaptersDialog.tsx:20`); the hand-copied swatches in `booth/ReaderKey.tsx:20,29`.
