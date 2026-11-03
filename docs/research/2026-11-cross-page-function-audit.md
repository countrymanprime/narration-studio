# Cross-page function audit: which tools belong on which page

Audit of 2026-11-03 at `38d00e1`, for the owner's question under [#2251](https://github.com/countrymanprime/narration-studio/issues/2251): the Engine panel has a **REAPER tools** section (chapter regions, cleanup tools for pops and clicks) that the narrator cannot reach from Editing or Proof, where the work happens. It lists every function by page, classifies it, and recommends where each group of related functions should also appear. It changes no code.

It extends the [UI function audit](ui-function-audit.md), which found functions that exist twice and disagree. This one finds functions that exist once, on the wrong page for the task. The standing rule applies to every recommendation: each place renders the **same shared component fed by one source**. A second implementation that disagrees is a bug.

## Result in short

- The Engine panel is a settings-like drawer opened from a header chip. Several things in it are narrator tasks that happen on other pages: creating chapter regions and preparing the render (after Proof, before Master), the two repair launchers (during Editing and Proof), embedding chapter tags (after encoding), retakes on lanes (a takes decision, which Editing already owns), and the connection and chapter-link actions (needed wherever the DAW is used).
- Two whole feature sets are reachable only through the Engine panel's row menu or a redirect: Proof's **Compare, Preview and Native takes** (`/proof/:chapterId`) and Editing's **Match levels…** (inside the Editing check panel).
- Three actions sit on the wrong side of the workflow: the multi-platform package build is on **Master** (before the files are measured), Delivery cannot start a measurement (it can only re-read), and **Embed chapter tags** needs the finished book MP3 but is hidden in a REAPER panel that says it does not talk to REAPER.
- No jump-menu command opens the Engine panel, links the DAW, checks the connection or creates regions. Master, Delivery and Schedule register no page commands at all.
- 15 recommended changes, in 12 groups. Ranked table in [Ranked recommendations](#ranked-recommendations); one issue per change.

## How to read this

- **Type** says what a function does. **Group** says which functions move together. A group renders from one shared component and one registry, in every place it appears. Both are defined in [Taxonomy](#taxonomy).
- Classes follow the brief: **(a)** belongs on its page only; **(b)** also reachable from another page, through the one shared component; **(c)** moves to another page.
- Inventories (Step 1) are in [`2026-11-cross-page-function-audit/`](2026-11-cross-page-function-audit/): one file per area, every action with its host binding, source file and other entry points. Line numbers are approximate; the ones marked `[audit]` were copied from the older audit and spot-checked. The older audit has drifted in places (listed at the foot of each file).
- The Studio Next mock does not draw any of these tools, so none of the placements contradicts a line of it. The [edit-and-proof workspace PRD](../prds/edit-and-proof-workspace.prd.md) (page inventory table) already says the project-level tools stay on a project page, which the Engine panel became, and that Retakes on lanes merges into the Takes panel. A recommendation here that adds a control the mock lacks must say so in its issue, as [`ui-spec-and-screenshots.md`](../../.claude/rules/ui-spec-and-screenshots.md) requires; each issue does.

## Taxonomy

### Types

| Type | One-line definition |
| - | - |
| **Connect** | Link, start or check the DAW and the project file the app reads. |
| **Map** | Tie a chapter to a DAW track, or a line to a DAW item. |
| **Structure** | Write chapters into the DAW project as regions, markers or render settings. |
| **Repair** | Change the audio itself to remove a defect (pop, click, breath, gap). |
| **Check** | Analyse recordings or files and report; changes nothing. |
| **Navigate** | Move the DAW's cursor or selection, or open a file in the DAW or another page. |
| **Preview** | Play audio to judge it (in the DAW or in the app). |
| **Decide** | Record a human decision about a finding, take or pickup. |
| **Edit** | Cut, mute, replace, add an effect, choose or stack takes. Undoable. |
| **Export** | Produce a file for someone else: render prep, mastered files, packages, reports, tags. |
| **Setup** | Choose how the app behaves; not tied to a chapter task. |

### Groups

Each group is a set of functions that always travel together. "Source" is the single registry or hook the group renders from; where none exists today, the issue creates it.

| Group | Type | Contents | Shared component and source |
| - | - | - | - |
| **G1 DAW connection** | Connect | Status chip; Start the DAW; Check again; Link the project file; Link the open project | `ConnectionResolveDialog` and `ConnectionIndicator` (exist), fed by one `useDawConnection()` that owns the bootstrap read, the capability read and the link action (today: three "Check again" state sources, four link routes, three Start implementations). |
| **G2 Chapter-track links** | Map | Link a chapter to a track; Create a track; Change; Clear | `ChapterLinkDialog` and `useChapterLinks` (exist); Production's `ChapterTrackPanel` and the check panels' `MappingConfirm` call the same hook. |
| **G3 Chapter regions and render prep** | Structure | Create chapter regions…; Prepare chapter render… | A DAW tools registry (`dawTools.ts`: id, label, gate, dialog) rendered by one `DawToolsMenu`. The two dialogs exist unchanged. |
| **G4 Repair tools** | Repair | Cleanup tools…: Open Repair Pops/Clicks, Open Magnolius DeClick | Same registry and menu as G3, section "Repair". `CleanupToolsDialog` exists unchanged. |
| **G5 Show in DAW** | Navigate | Show/Go to/Select in the DAW (chapter, passage, note, effect); Open file in the DAW | One `ShowInDawButton` with one label, "Show in {DAW}", over one host call (today: three labels, `workspaceGoTo`, `findingsGoTo`, `trackSelectInReaper`, `masterOpenInDaw`). |
| **G6 DAW markers** | Structure | Add marker (one finding); Add N pickups as markers | One `AddMarkersButton` taking a list of findings or pickups. |
| **G7 Recording check** | Check | Check recordings / Stop checking | `openCheckRecordings` (exists; already one dialog) behind one `CheckRecordingsButton`. Today nine entries with different labels and gates; Proof has two on one screen. |
| **G8 Proof compare tools** | Check | Compare the recording with the script; Preview; Native takes; Rendered file for proofing | The existing `CompareRun`, `PreviewPanel`, `NativeTakesPanel` and `RenderAssociationSection`, mounted by the Proof page as well as the chapter view. |
| **G9 File checks** | Check | Check files (loudness, peak, noise floor, ACX/QC) | `MeasureRun` and its `run.check()` (exist on Master), mounted on Delivery's preflight. |
| **G10 Book package** | Export | Multi-platform package build; single-profile build; Embed chapter tags; Open folder | `useDeliveryBuild` and the package panels; one build panel on Delivery. |
| **G11 Takes and levels** | Edit | Retakes on lanes; Match levels | The Editing takes list (lane choice) and the Editing drawer's Clean up tab (level match). |
| **G12 Command parity** | Navigate | Jump-menu commands for G1 to G10 | `usePageCommands` with entries generated from the same registries as the buttons. |

Functions that are not in a group because they belong to one page are listed under [Kept where they are](#kept-where-they-are).

## Group by page matrix

`●` offered today. `+` recommended to add. `−` recommended to remove (moved). `·` not offered. Pages: Prod = Production (Schedule is part of it for these groups), Script, Bible = Story Bible, Booth, Edit = Editing, Proof, Pick = Pickups, Master = Master & QC, Deliv = Delivery, Engine = Engine panel, Set = Settings. The Companion offers none of these groups; it is a read-along beside the DAW and stays that way.

| Group | Prod | Script | Bible | Booth | Edit | Proof | Pick | Master | Deliv | Engine | Set |
| - | - | - | - | - | - | - | - | - | - | - | - |
| G1 DAW connection | ● | · | · | ● | ●+ link action | +  | + | + | · | ● | ● |
| G2 Chapter-track links | ● | · | · | ● | ● | + | · | · | · | ● | · |
| G3 Chapter regions, render prep | · | · | · | · | + | + | · | + | · | ● | · |
| G4 Repair tools | · | · | · | · | + | + | · | · | · | ● | · |
| G5 Show in DAW | ● | · | · | · | ● | ● | + | ● | · | · | · |
| G6 DAW markers | · | · | · | · | + | ● | ● | · | · | · | · |
| G7 Recording check | ● | · | · | + | ● | ● (2 buttons) | ● | · | · | · | · |
| G8 Proof compare tools | · | · | · | · | · | + | · | · | · | ● via "Open in Proof" | · |
| G9 File checks | · | · | · | · | · | ● (chapter view) | · | ● | + | · | · |
| G10 Book package | ● status report only | · | · | · | · | ● proofer sheet | · | ●− multi-platform, ● master and encode | ● single build, + multi-platform, + tags | ●− tags | · |
| G11 Takes and levels | · | · | · | · | + | · | · | · | · | ●− lanes; `Match levels` reachable via Engine/Production only | · |
| G12 Command parity | ● | ● | ● | ● | ● | ● | ● | + | + | + | ● |

## Ranked recommendations

Ranking is narrator benefit first (tasks blocked or hidden today), then effort, then dependency. Effort: **S** under a day, **M** one to three days, **L** more. "Narrator sees" is what changes on screen. Every row is one issue.

| # | Change | Class | From | To | Effort | Narrator sees | Issue |
| - | - | - | - | - | - | - | - |
| 1 | **G3/G4 foundation: DAW tools registry and `DawToolsMenu`**; the Engine panel renders from it | (b) prerequisite | Engine panel (hard-coded buttons) | Engine panel, same buttons, from the registry | M | No change in the Engine panel; the menu exists for items 2 and 3 to mount. | [#2819](https://github.com/countrymanprime/narration-studio/issues/2819) |
| 2 | **G3 Chapter regions and render prep** on Editing, Proof and Master | (b) | Engine only | Editing and Proof headers (DAW tools menu), Master (the "no files yet" state) | M | A **DAW tools** icon button; its menu has **Create chapter regions…** and **Prepare chapter render…**, opening the existing dialogs. | [#2820](https://github.com/countrymanprime/narration-studio/issues/2820) |
| 3 | **G4 Repair tools** on Editing and Proof | (b) | Engine only | Editing (Clean up tab, beside Apply for clicks and plosives) and Proof (inspector, for click, breath and plosive notes) | M, plus the pending in-REAPER check | **Repair in REAPER** entries for Repair Pops/Clicks and Magnolius DeClick, off with the DAW's reason when the item is not selected, the tool is missing or the DAW is not REAPER. | [#2821](https://github.com/countrymanprime/narration-studio/issues/2821) |
| 4 | **G8 Proof compare tools** on the Proof page | (c) | Chapter view `/proof/:id`, reached only from Engine "Open in Proof" | Proof page: Compare joins Check recordings in the check card; the chapter view stays as its deep link | L | **Compare the recording with the script** next to **Check recordings**, without opening the Engine panel first. | [#2822](https://github.com/countrymanprime/narration-studio/issues/2822) |
| 5 | **G1 DAW connection** shared state, and its link action on every DAW page | (b) | Production, Booth, Editing, Engine, Settings, each with its own state | Add to Proof, Pickups, Master; Editing and Production gain the Link action | M | The same **{DAW} not connected** chip and dialog wherever an action needs the DAW; the dialog's **Link project file** works on Editing and Production (today it says "Link the project file first." with no button). | [#2823](https://github.com/countrymanprime/narration-studio/issues/2823) |
| 6 | **G10 Multi-platform package build** to Delivery | (c) | Master & QC | Delivery, beside the single-profile build | M | Building packages after the files are checked and mastered; Master keeps **Master and encode**. | [#2824](https://github.com/countrymanprime/narration-studio/issues/2824) |
| 7 | **G9 File checks** on Delivery | (b) | Master only | Delivery preflight | M | **Check files** on the page that blocks the build, instead of a re-read-only **Check again** and a trip to Master. | [#2825](https://github.com/countrymanprime/narration-studio/issues/2825) |
| 8 | **G5 Show in DAW**: one button, one label, one host call; add to Pickups rows | (b) | Production, Editing x2, Proof, Master | Same places, plus Pickups | M | One label, **Show in {DAW}**, on every row that has a spot; Pickups rows gain it. | [#2826](https://github.com/countrymanprime/narration-studio/issues/2826) |
| 9 | **G11 Match levels** on the Editing page | (c) | Editing check panel (Production row menu, Engine table) | Editing drawer, Clean up tab | S | **Match levels…** where the other clean-up actions are. | [#2827](https://github.com/countrymanprime/narration-studio/issues/2827) |
| 10 | **G2 Chapter-track links** on Proof | (b) | Proof "No linked track" with a link to the Engine panel | `ChapterLinkDialog` opened in place | S | **Link track** and **Create a new track** on Proof, as in the Booth and Editing. | [#2828](https://github.com/countrymanprime/narration-studio/issues/2828) |
| 11 | **G10 Embed chapter tags** to Delivery | (c) | Engine panel REAPER tools | Delivery output panel | S | **Embed chapter tags…** next to the package build, where the combined MP3 is known. | [#2829](https://github.com/countrymanprime/narration-studio/issues/2829) |
| 12 | **G6 DAW markers** | (b) | Proof (one finding), Pickups (many) | One component on both; Editing flag card added | S | The same **Add marker** button on Proof, Pickups and Editing's flag card; Proof's context menu gains it. | [#2830](https://github.com/countrymanprime/narration-studio/issues/2830) |
| 13 | **G11 Retakes on lanes** into Editing takes | (c) | Engine panel dialog | Editing takes list, lane rows | M | **Play this lane** on the line's takes, instead of a separate dialog. The PRD already plans this merge. | [#2831](https://github.com/countrymanprime/narration-studio/issues/2831) |
| 14 | **G12 Command parity**: jump-menu commands for the groups above; page commands for Master, Delivery and Schedule | (b) | Not in the jump menu | Jump menu on the pages that show the group | S | Ctrl+K lists **Create chapter regions**, **Open the audio engine**, **Check the DAW connection**, **Check files** and the like. | [#2832](https://github.com/countrymanprime/narration-studio/issues/2832) |
| 15 | **G7 Recording check**: one button, one label, Proof's duplicate removed; offered on the Booth after Stop | (b) | Nine entries, Proof has two on one screen; none in the Booth | One `CheckRecordingsButton`; Booth gets one offer after a take stops | S | One **Check recordings** per screen; the Booth offers a check of the chapter just recorded. | [#2833](https://github.com/countrymanprime/narration-studio/issues/2833) |

Items 1 to 3 answer the owner's two named candidates. Items 2 and 3 depend on 1; 8 and 12 share the DAW action wiring and should land in that order.

## Per-item notes

### 1 to 3: DAW tools and repair tools

**Today.** The Engine panel's **REAPER tools** card (`engine/EnginePanel.tsx:168`) draws six buttons when the project has tracks and the DAW is not Audacity; **Link chapters…** also needs chapters. The two repair launchers are inside **Cleanup tools…**. Nothing else in the app opens `CreateChapterRegionsDialog`, `RenderConfigDialog` or `CleanupToolsDialog`, except a hand-off inside the render dialog. The header chip opens the panel on every page except the Booth, so the tools are reachable in two clicks. They are not reachable where the narrator is thinking about them, and the panel closes on any route change.

**Where the task happens.**

- Regions and render prep: the narrator finishes proofing, then needs regions so REAPER can render one file per chapter, then goes to Master with the rendered files. The end of Proof and Editing, and Master's empty state ("check files" with no files yet), are the moments. Master has no DAW chip today, so the tool must carry its own gate reason.
- Repair launchers: Proof marks a click, breath or plosive; **Show in {DAW}** selects that item and puts the cursor on it; the launchers act on the items selected in REAPER. The natural next step is a repair button beside Show in {DAW}. On Editing the same applies beside the Clean up tab's **Apply**, which repairs with the app's own `repairClick`/`reduceRangeGain`; the launchers are the manual alternative for a defect the automatic repair left.

**Two repair paths, one story.** Editing's Clean up tab repairs in the app (`daw.repairClick`, `daw.reduceRangeGain`, `daw.trimRange`). The launchers open REAPER's own dialog. They overlap and nothing says which to use. Item 3 puts them in one place with one sentence of difference in the tooltip, not a second implementation.

**Verification gate.** `reaper-cleanup-launchers.md` records that every in-REAPER check for the launchers is still Pending, and that a REAPER whose action text differs reports "no Repair Pops/Clicks dialog". Placing the entries on Editing and Proof multiplies the exposure to that unknown, so item 3's acceptance includes running those checks first.

**Shared component plan.** Add `dawTools.ts` with entries `{ id, group: 'structure' | 'repair' | 'map', label, gate, dialog }` and a `DawToolsMenu` taking a `groups` prop. The Engine panel's six buttons render from it (item 1). Editing and Proof mount the menu in their header; Master mounts it in the empty state. Gates come from one place (today: `hasTracks && !forAudacity`, per button `links.chapters.length > 0`) and render through `CapabilityGate`, so a disabled entry says why.

### 4: Proof compare tools

`ProofChapterPage` is mounted at `/proof/:chapterId` (`App.tsx:954`). The only navigation to it in the UI is the Engine panel's chapter-links row menu **Open in Proof** and the retired `/tracks/chapter/:id` redirect. The main Proof page and Production's Proof cell go to `/proof?chapter=` instead, which is the one-chapter view of the notes, without the compare run. The [Proof guide](../guides/using-the-app/proof.md#the-chapter-view) says the chapter view is also opened from Production's Proof cell or row menu; the code (`ProductionPage.tsx:67`, `addressPath`) does not, so the guide is stale on that point. So the narrator who wants to compare a chapter's recording with its script must open the Engine panel and find a table row. The compare run is a stage-of-proofing action and belongs beside **Check recordings** in the check card. Effort is L because the chapter view holds the compare run, options, preview, native takes and the stage panel, and the Proof page's own layout has to take them without a second implementation.

### 5: DAW connection

Four link routes (Engine panel, Settings, the shared helper, Booth's own), three labels for the same action, three Start implementations and three state sources for "Check again" (bootstrap, `dawChoice`, capabilities) are in the [Engine inventory](2026-11-cross-page-function-audit/inventory-engine-settings-shell.md). Editing and Production open `ReaperOffDialog` without `onLink`, so the dialog tells the narrator to link the project file and offers no way to do it. Proof, Pickups and Master each have an action that needs the DAW (Hear it, Add marker, Add N as markers, Open in DAW, Play the quietest 5 s) and show a gate reason or an `EnginePanelLink`, not the connection chip.

### 6, 7, 11: package, checks and tags

Delivery's own text says the package is built from files mastered and encoded in Master & QC. Master hosts the multi-platform build (`MultiPlatformExportPanel`) before any file has been measured; Delivery hosts the single-profile build. Delivery cannot start a measurement: **Check again** only re-reads `measureState`, so a failing preflight sends the narrator to Master. **Embed chapter tags…** is under "REAPER tools" although the dialog says it does not talk to REAPER; it needs the combined book MP3, which exists only after render and encode. Moving the multi-platform build and the tags to Delivery, and mounting `MeasureRun` there, puts the end of the workflow on one page. Master keeps measuring, mastering and encoding.

### 8, 12: Show in DAW and markers

"Show in the DAW" (Editing takes footer), "Show in {DAW}" (Editing effect inspector, Proof inspector), "Go to {DAW}" (Proof context menu) and "Go to this chapter in {DAW}" (Production) are one idea on three host calls. Pickups rows have none, although a pickup has a spot in the recording. Proof's context menu lacks **Add marker** and **Open in Editing**, which the inspector has. One button type removes the inconsistent labels and makes adding Pickups a one-line mount.

### 9, 13: levels and lanes

`Match levels…` lives in `EditingCheckPanel`, opened only from Production's row menu and the Engine chapter table, not from the Editing page it edits. **Retakes on lanes** picks which lane plays per line, the same decision the takes list makes for takes; the workspace PRD plans to merge the dialog into the Takes panel.

### 14, 15: commands and the check

No catalog or page command opens the Engine panel, links the DAW, checks the connection, creates regions, shows in the DAW or refreshes the DAW. Master, Delivery and Schedule register no page commands, so **Check files**, **Master all to spec** and **Build** cannot be run from Ctrl+K. Generating command entries from the same registries as the buttons keeps them from drifting. For G7, Proof's check card button and the notes-panel icon on the same screen are the same action.

## Kept where they are

Class (a), with the reason:

| Function | Page | Why only there |
| - | - | - |
| Record, Stop, Punch and roll, Voice control, Levels | Booth | The recording task; other pages have no use for them. |
| Companion read-along | Companion | A narrow window beside the DAW; its purpose is to have no tools. |
| Link chapters… (line stamps), Read current stamps | Engine panel | One-time project setup; its result is read by the Retakes dialog and pickups. |
| Chapter sync on/off, sync consent | Engine panel | A project setting with its own consent dialog; the Undo log stays in Settings. |
| Audacity card, Record with (REAPER, Audacity, built-in) | Engine panel, Settings | Choosing the engine is setup. |
| Scan the manuscript, Import entries, Voice data | Story Bible | Batch jobs that need consent and a model download; Script's Bible tab already links to the entry. Not recommended elsewhere. |
| Find who speaks each line | Script | Part of preparing the script; Story Bible keeps per-cue correction. |
| Schedule, milestones, pay | Production, Schedule | Planning, not a chapter task. |
| Export status report | Production | A report of the book's progress; any time. |
| Master and encode, Report export, Diagnostics | Master & QC | The checking and mastering task. |
| Import and Export proofer sheet | Proof | Notes come from the proofer's sheet; Pickups receives the result. |
| Mark for pickup, Add a pickup by hand | Editing, Pickups | Same host call; both are early capture points and need no group. |

Stubs found along the way (**Record my own clip** in Script and Story Bible, Script's Bible-tab **Add a note**, the Booth **Input level** slider) are not placement problems and belong to their own issues if the owner wants them.

## Timing (offered too early or too late)

| Function | Where | Problem | Covered by |
| - | - | - | - |
| Multi-platform package build | Master | Offered before any file has been measured. | 6 |
| Check files | Delivery | Not offered; the page that needs it can only re-read. | 7 |
| Embed chapter tags | Engine panel | Hidden until the narrator knows to open a REAPER panel; needs the finished MP3. | 11 |
| Add marker, Trim the gap, Show in {DAW} | Proof inspector | Offered before a note is decided. Acceptable: each is an inspection aid, and Trim the gap is the same op as Editing's Clean up. | none (kept) |
| Mark for pickup | Editing | Writes a by-hand pickup before Proof decides. Intended: capture at the moment of hearing. | none (kept) |
| Chapter regions | none | Needed at the end of Proof, offered nowhere in the flow. | 2 |
| Prep steps, Keep take | Editing | Shown before the line's evidence is read. Not a placement issue. | none |

## Duplicates found

These are duplicate implementations, not placement gaps. The [UI function audit](ui-function-audit.md) tracks the clusters; the ones this audit's recommendations fix on the way are named in the issues. The rest are listed in the inventories:

- DAW link (four routes, three labels), "Check again" (three state sources), Start the DAW (three implementations), `chapterTrackSet` (four callers).
- "Show in the DAW": three components, two host calls, three labels.
- Check recordings: nine entry points.
- Stage Confirm, Dismiss, Revert: Production readiness panel and Proof stage panel, same host calls.
- Needs pickup and Fix in edit write the same `findingsReview(accepted)`.
- Gap trimming: Proof Trim the gap, Editing Clean up Gaps and Editing prep "Trim white space".
- Two de-click paths: Editing Clean up and the Engine repair launchers (see items 3).
- Entries in the inventories not listed here: the Booth and Companion resume selectors (#2601), speaker correction in three places, pronunciation stored twice, zoom in two implementations.

## What I did not verify

- No app run: this is a code and document audit. Behaviour claims (for example, that Master shows no DAW chip) come from reading the components.
- Line numbers in the inventories are within a few lines at `38d00e1`; those from the older audit are tagged.
- Per-page jump-menu rows for Production, Script, Editing, Proof and Pickups were taken from the older inventory and the registration files' names, not re-read line by line.
- Whether Master can mount the DAW tools menu without a layout change is untested; each issue that adds a visible control asks for a mockup first.
- The in-REAPER behaviour of the launchers (item 3).
