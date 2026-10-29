# UI function audit (2026-10-29)

**Question.** Which buttons and functions does every page have, and where does one capability exist in more than one place without the copies agreeing or connecting?

**Trigger.** The Engine page's "Link chapters…" dialog says no chapter is linked while the Chapter links table on the same page says they are.

**Method.** Six read-only passes over `src/studio/ui/src`, built from the code (handlers, command registry, `useApi()` calls, hooks, host bindings), then cross-checked against the guides. The inventories hold every control with file and line, the capability tags and the suspicious controls:

- [Script and Story Bible](ui-function-audit/inventory-script-storybible.md)
- [Booth, Companion, recording](ui-function-audit/inventory-booth.md)
- [Editing, Proof, Pickups](ui-function-audit/inventory-editing-proof.md)
- [Production, Schedule, Master, Delivery](ui-function-audit/inventory-production-delivery.md)
- [Engine, connection, Settings](ui-function-audit/inventory-engine-settings.md)
- [Shell, navigation, palette, host bindings](ui-function-audit/inventory-shell.md)

Findings come from reading. Only the ones marked **checked** were confirmed again by a second read or a run; the rest are the pass's claim and need a failing test before a fix.

## Worked example: "linked" on the Engine page

- `ChapterLinksTable` shows chapter → track links from `api.chapterTrackMapList()` (the confirmed manifest mapping). The Tracks list, Chapter sync card, Create regions, Render and Tags read the same mapping.
- `LinkChaptersDialog` keeps its own `mapping` state, which starts as `{}` on every open and is never seeded from that mapping, so each row reads "Not linked". It stamps REAPER items (`api.lineIdentityStamp`), which is a different fact from the manifest link, under the same word.
- Pattern to search for: one word, two stores, no reconciliation. A sibling worker fixes the dialog; the table below treats it as cluster 1 and does not fix it here.

## Ranked table

Severity: **A** a narrator is told two different things or an action silently does nothing; **B** a figure or gate is wrong in an edge case; **C** drift risk, no wrong answer today. "Agree today": no / yes / unknown.

| # | Capability | Locations | Implementations | Agree today | Sev | Proposed single source |
| - | - | - | - | - | - | - |
| 1 | "Chapter is linked to a track" | Engine Link chapters dialog; Chapter links table; Tracks list; Chapter sync "Links N"; Booth "Linked to several tracks"; Production "2+ tracks" | `lineIdentityStamp` state (dialog, starts `{}`) vs `chapterTrackMapList` (table, list, regions, render, tags) vs `chapterSyncState` snapshot; the table shows only the first mapping per chapter | **no** | A | `chapterTrackRows` over `chapterTrackMapList`; the dialog seeds from it and says "stamp", not "link" |
| 2 | Proof open count | Rail Proof badge (`useNavCounts.ts:35`); Proof page (`ProofPage.tsx:407`); Proof pipeline cell; Editing "Clean up · N" tab | rail passes `0` open pickups to `proofProgress`; page adds `openPickupsBeyondNotes`; cell uses `findingsList`; Editing uses `useTabCounts` | **no** (**checked**: rail passes `0`, page adds pickups) | A | one `proofOpenCount(summary, pickups)` selector used by rail, page and cell |
| 3 | Kept take | Proof spot (`proof/spot/spot.ts:61`); Editing (`takes/keepTake.ts`) | host-active take vs session-local state | **no** after a reload the same take reads "✓ Kept" in Proof and "To choose" in Editing | A | host-active take everywhere; Editing's local state is a pending overlay only |
| 4 | Open Settings | Jump menu row "Open Settings" (`nav.settings`); Ctrl+, ; rail; category rows | `shellCommands` (`App.tsx:575-585`) has no entry for `nav.settings`, so the row does nothing; two `SETTINGS_ANCHORS` lists; "Back to <page>" appears only on some routes | **no** | A | register the row to the same handler as Ctrl+,; one anchors list |
| 5 | Production rate basis | Schedule basis toggle (`TargetPopover.tsx:62`); every hours figure | toggle saves `rateBasis`; `wphOf` (`pace.selectors.ts:41`) has no caller; all figures use `WPH=9300` | **no** (**checked**: no caller) | A | call `wphOf` from the figures, or remove the toggle |
| 6 | "Narrated chapters" set | Production (`ProductionPage.tsx:67`, drops `opening`); Schedule `scheduleChapters` (keeps them); Master (narration only plus unclaimed files); rail Master badge (all kinds); ~20 pages with their own narration-only lists; palette (unfiltered `slots.chapters`); AddressGate (accepts chapters pages reject) | per-page filters | **no** | A | one `narratedChapters` selector in `studio/selectors` |
| 7 | "Mastered" / failing | `usePipelineSources.ts:38` (`mastered = verdict !== 'none'`, so FAIL counts as Delivered); Delivery "Fails N checks"; rail Master badge; Master KPI | separate counts | **no** (**checked**: line 38) | A | `masterState(verdict)` with `fail` distinct from `mastered` |
| 8 | "% recorded" / recorded figures | Production Record cell; Next up and stage bar (`recordedSeconds / WPH`); Booth, Editing, Proof (`recordedThrough.ts`); Booth side panel "Recorded mm:ss" | host reads `manuscriptChapters` vs `productionOverview` plus page-local | **no** | A | `recordedThrough.ts` over one host read |
| 9 | "Is recording" | `useRecordControl`; command router and toast queue (DAW `transport.recording`); `quietWhileRecording`; Story Bible and Editing sample players (no guard) | 5–6 readers | unknown | B | one `useIsRecording()` from the DAW event stream; players consult it |
| 10 | "Can record" | Booth `recordCheck`; Production and Companion `capabilities.record.available`; `SetupChip` `dawChoice` | 3 sources | **no** (Booth also checks track and project) | B | one `canRecord` selector returning the reason |
| 11 | Link DAW file / Start DAW / Check connection | App `linkDawFile` (Engine, Settings); `dawLinkFound`; Booth direct `project.linkDawFile` (outside the pending guard); Audacity bindings | 4 routes; Start DAW 3; Check reads 4 stores | unknown | B | route Booth through `App.linkDawFile` |
| 12 | Speaker attribution | Script (journal); Story Bible `DialogueCueAttribution` and Booth (`guideCorrectCue`, no undo) | 3 | **no** (a cue to a non-speaking entry is "unknown" in Script, "Attributed" in Story Bible) | B | one `attributeCue` command through the journal |
| 13 | Pronunciation | Script flagged-word list; Story Bible entry; Hear (toast stub on Script, real in Story Bible) | 2 stores; `chapterWords` lets the flagged word win | unknown | B | one resolver; wire Hear on Script |
| 14 | Entries and types cache | Script (shared cache); Story Bible `Guide` and `GuideDetail` | 3 caches; Story Bible edits never refresh Script's | **no** after an edit until a `job:ended` | B | one store slot |
| 15 | Credits state | Script "My prep"; Production `setCreditsStatus`; unresolved tokens | 3; `creditsRows` discarded | unknown | B | one `creditsState` selector |
| 16 | "In this chapter" for an entry | Script `mentionsIn` (text regex); Story Bible host `appearances` | 2 | **no** (regex misses aliases) | B | host `appearances` |
| 17 | Finding review status | Inspector; CheckCard Accept/Ignore; Pickups "Fine"; Editing accept | 4 writers; "Needs pickup" and "Fix in edit" are one call | unknown | B | one `reviewFinding` command |
| 18 | DAW capabilities gating | ~15 Editing hooks read `daw.capabilities()` once on mount; header follows DAW events | stale after connect | **no** until remount | B | `useDawCapabilities()` subscribed to events |
| 19 | Resume | `resumeStart`; Booth offer line; Companion `ResumePrompt` (+1 unused) | 3 | unknown | B | one resume selector |
| 20 | Two recording paths | Companion Play (`readAloudRecordStart`); Booth Record (`daw.recordStart`); Record-in-REAPER toggle, no caller | unreachable confirm dialog | n/a | C | delete or wire |
| 21 | Undo | History panel, Ctrl+Z, toast Undo | toasts without `{entry}` outlive their change; Ctrl+Z undoes older entry after off-journal actions; two toast queues | unknown | B | one journal; toasts always carry an entry |
| 22 | Stale pointers | `/tracks` links, "Tracks page", "Settings > General", "Link the project file first." with no button (Editing, Production) | copy | **no** | B | `addressPath` links; add the action |
| 23 | Settings written elsewhere | mic, punch, zoom, narrator, delivery profile, background checks; three zoom-level lists | duplicate writers | unknown | C | one settings hook per key |
| 24 | Stage order, chapter names | stage order copied in four places; `chapterName` vs `headingName` | copies | yes today | C | one constant; one name function |
| 25 | Unused host bindings | 44 of 454 bindings have no UI caller; sync activity hidden for Audacity | — | n/a | C | delete or wire per binding |

## Connect tests (one per cluster)

Each is a class-wide test: render every location from one mocked project and assert one answer. They live next to `crossPage.matrix.test.tsx`.

| Cluster | Test |
| - | - |
| 1 | Mock project with chapters linked in `chapterTrackMapList`: Link chapters dialog, Chapter links table, Tracks list and Chapter sync all list the same linked chapters. |
| 2 | Mock project with findings and open pickups: rail badge, Proof page, pipeline cell give one open count. |
| 3 | Keep a take, remount Editing (new session state): Proof and Editing both show Kept. |
| 4 | Every command with a `jumpMenu` surface in the catalog has a handler; running each changes the route or state. |
| 5 | Switching the schedule basis changes the hours shown on Production and Schedule. |
| 6 | Mock project with an `opening` chapter: Production, Schedule, Master, rail, palette and AddressGate agree on the chapter list. |
| 7 | Chapter with a FAIL master verdict: no surface calls it Delivered. |
| 8 | Same project: every recorded figure is derived from one value. |
| 9–10 | A DAW event sequence: every reader of recording and can-record flips together. |

## Fix plan

Fixed in separate small PRs, each deleting the duplicate logic and adding the connect test: clusters 2, 4, 5, 7 and 3, in that order (clear single sources, small diffs). Cluster 1 belongs to the sibling worker. Everything else is listed above for follow-up issues; clusters 6 and 8 need an owner call on the narrated-chapter definition first.
