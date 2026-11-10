# Architecture audit, November 2026: duplicated components, data models and interfaces

**Audited 2026-11-10.** Issue: [#3279](https://github.com/countrymanprime/narration-studio/issues/3279). **Question:** where does the app model one concept more than once, skip a component, hook or type that already exists, or break the repo's own SOLID and design rules, and which of those explain the owner's reports (two Engine track lists, the Engine track list, the chapter linking and the Booth disagreeing on a chapter's tracks, icon and word buttons mixed in one panel, wording that follows a different rule on each screen, buttons that do nothing, truncated text without tooltips, slow unlink)?

**Status.** Read-only audit of `main` at `0ae1836`. Two reviewers split the app: A1 the UI and its data models (`src/studio/ui/src`), A2 the host, bridge, sidecars and wire. Each finding was written with file and line by one reviewer, then opened in the code by the other; the marks are in the [cross-check comments on #3279](https://github.com/countrymanprime/narration-studio/issues/3279). Nothing was run (the container lacks the Go version the host needs), so every cost claim comes from reading the code, not timing.

## Top ten

The ten worst places, in plain words, worst first. UI items are A1's, host items A2's; each points at its finding.

1. **The same chapter can be "linked" on one screen and "linked to several tracks" on another.** The host lets a chapter hold two links. Five screens quietly use the first one, and the Booth treats two as none. (UI-1, HOST-06, [#3363](https://github.com/countrymanprime/narration-studio/issues/3363), [#3288](https://github.com/countrymanprime/narration-studio/issues/3288))
2. **The Booth and the Engine page look at two different versions of your REAPER project.** Only the Engine page reads what REAPER has open now; nine other screens, and the host's Booth code, read the last saved file. Add or rename a voice track without saving and only the Engine page knows. (X-1, HOST-01, [#3307](https://github.com/countrymanprime/narration-studio/issues/3307), [#3286](https://github.com/countrymanprime/narration-studio/issues/3286))
3. **Linking a chapter to a track is written six times, so the app sometimes unlinks another chapter without a word.** Only two of the six tell you which chapter lost the track. (UI-9, [#3365](https://github.com/countrymanprime/narration-studio/issues/3365))
4. **Unlinking is slow because it re-measures the whole book first, and the screen then reloads everything two more times.** A cheaper lookup already exists and one line does not use it. (HOST-04, UI-6, [#3272](https://github.com/countrymanprime/narration-studio/issues/3272))
5. **Seven screens each ask for the chapter links on their own,** with their own loading, failure and out-of-date handling, so a link or rename made in one place reaches the others only when they reopen. (UI-2, [#3366](https://github.com/countrymanprime/narration-studio/issues/3366))
6. **The Engine page draws three track lists, and each works out "which chapter is on this track" its own way.** (UI-5, tracked with the Engine page work in [#3258](https://github.com/countrymanprime/narration-studio/issues/3258) and [#3282](https://github.com/countrymanprime/narration-studio/issues/3282); only A1 has opened these lists)
7. **The project file is re-read from disk on nearly every edit and every Booth refresh,** and the record button does work that grows with the number of takes. (HOST-02, HOST-03, [#3287](https://github.com/countrymanprime/narration-studio/issues/3287))
8. **"Not linked" is worded six ways and the state has five names,** so each screen says something slightly different about the same thing. (UI-3, UI-4, [#3368](https://github.com/countrymanprime/narration-studio/issues/3368), [#3295](https://github.com/countrymanprime/narration-studio/issues/3295))
9. **A track rename in REAPER makes a voice forget its characters, and the Tracks card shows an old chapter title after a rename.** The voice setup is saved by track name, and a chapter title is copied into the link when it is made. (HOST-07, UI-10, [#3289](https://github.com/countrymanprime/narration-studio/issues/3289), [#3370](https://github.com/countrymanprime/narration-studio/issues/3370))
10. **One function, `AppRoutes`, is 1040 lines and glues every page together; the REAPER scripts copy the same helper into 14 files.** Fixes to either go in one place and miss the rest. (UI-11, HOST-12, [#3371](https://github.com/countrymanprime/narration-studio/issues/3371), [#3291](https://github.com/countrymanprime/narration-studio/issues/3291))

How this maps to the owner's reports: two Engine track lists, and the Engine, the chapter linking and the Booth disagreeing, come from items 1, 2, 3 and 6; the slow unlink from item 4; per-screen wording from item 8; icon and word buttons mixed in one panel is UI-7 (A1 only, tracked in #3258); buttons that do nothing is #3276 and its follow-ups, which this audit did not cover; truncated text without tooltips is not shown to be a defect here (see UI-8).

## Summary table

Status is the cross-check result. **CONFIRMED** means both reviewers opened the code; **A1 only** means one reviewer has not opened it; **NEEDS MORE** means the claim was overstated or incomplete. Nothing was REFUTED. Host findings are A2's, marked by A1 on the halves A1 opened (the "(Lua half)", "(types)" and similar notes say which). A2's full table is in the comments linked under the host heading.

| id | area | finding | severity | status | tracked issue |
| - | - | - | - | - | - |
| UI-1 | UI | Five readers take a chapter's first mapping, the Booth treats two as none | high | CONFIRMED | [#3363](https://github.com/countrymanprime/narration-studio/issues/3363) |
| UI-2 | UI | Seven separate fetches of the chapter-track map | high | CONFIRMED | [#3366](https://github.com/countrymanprime/narration-studio/issues/3366) (related #3350, #3355) |
| UI-3 | UI | Link state in five vocabularies | high | CONFIRMED | [#3368](https://github.com/countrymanprime/narration-studio/issues/3368) |
| UI-4 | UI | Link wording differs per screen | medium | CONFIRMED (partly) | covered by [#3295](https://github.com/countrymanprime/narration-studio/issues/3295) and #3368 |
| UI-5 | UI | Three Engine track lists, three derivations | high | A1 only | in flight: #3258, #3282 |
| UI-6 | UI | One unlink triggers two reloads plus stage and live-track reads | medium | CONFIRMED (host half is HOST-04) | [#3272](https://github.com/countrymanprime/narration-studio/issues/3272) |
| UI-7 | UI | Word and icon buttons mixed in one Engine row | medium | A1 only | in flight: #3258 |
| UI-8 | UI | No truncation primitive; 83 hand-written sites | low | NEEDS MORE (overclaimed, see the section) | none |
| UI-9 | UI | Linking done six ways on two bindings; displaced chapter reported by two | high | CONFIRMED | [#3365](https://github.com/countrymanprime/narration-studio/issues/3365) |
| UI-10 | UI | Chapter title copied at link time, shown as live | medium | CONFIRMED | [#3370](https://github.com/countrymanprime/narration-studio/issues/3370) |
| UI-11 | UI | `AppRoutes` is about 1040 lines | medium | CONFIRMED (sizes) | [#3371](https://github.com/countrymanprime/narration-studio/issues/3371) |
| UI-12 | UI | Four UI shapes for a chapter, two types named `ChapterRef` | low | CONFIRMED | none (low) |
| UI-13 | UI | `FlagKind` differs between editing and proof; other names reused | medium (`FlagKind`), low (rest) | CONFIRMED (`FlagKind`) | [#3373](https://github.com/countrymanprime/narration-studio/issues/3373) |
| UI-14 | UI | Import fences hold; `types.ts` barrel still used | low | CONFIRMED (observation) | none |
| X-1 | boundary | Saved .rpp vs live DAW state split on both sides of the binding, including `withAddedVoices` | high | CONFIRMED | [#3307](https://github.com/countrymanprime/narration-studio/issues/3307), [#3286](https://github.com/countrymanprime/narration-studio/issues/3286) |
| X-2 | boundary | The UI says "tracks" for a count of links (`several_links` becomes `several_tracks`) | medium | CONFIRMED | with #3288 and #3368 |
| X-3 | boundary | `unmapped_track` worded three times in `stageText.ts` | low | CONFIRMED | with #3368 |
| HOST-01 | host | Booth reads the saved .rpp, Engine the live list | high | CONFIRMED | [#3286](https://github.com/countrymanprime/narration-studio/issues/3286) |
| HOST-02 | host | The saved .rpp is parsed on every call | high | CONFIRMED (13 call sites in the root package, 16 with `internal/`) | [#3287](https://github.com/countrymanprime/narration-studio/issues/3287) |
| HOST-03 | host | The record press does work that grows with takes | high | CONFIRMED (Lua half) | see A2's comments |
| HOST-04 | host | Unlink runs the measured chapter list | high | CONFIRMED | [#3272](https://github.com/countrymanprime/narration-studio/issues/3272) |
| HOST-05 | host | Evidence ledger and `Identify` uncached | medium | CONFIRMED (ledger half) | related #3273 |
| HOST-06 | host | "Linked to N tracks" counts links; `Confirm` adds a second link | medium | CONFIRMED | [#3288](https://github.com/countrymanprime/narration-studio/issues/3288) |
| HOST-07 | host | voice-tracks.json keyed by track name | medium | CONFIRMED | [#3289](https://github.com/countrymanprime/narration-studio/issues/3289), #3358 |
| HOST-08 | host | `resetDerived` hard-wires about 21 packages' files (23 internal imports) | medium | CONFIRMED | see A2's comments |
| HOST-09 | host | Track, item and take each modelled 4 to 8 times | medium | CONFIRMED (TS half) | see A2's comments |
| HOST-10 | host | Folder children answered five ways | medium | CONFIRMED (TS half) | see A2's comments |
| HOST-11 | host | Duplicated bridge and dawport structs | medium | CONFIRMED (types) | see A2's comments |
| HOST-12 | host | Lua helpers copied per module | medium | CONFIRMED | [#3291](https://github.com/countrymanprime/narration-studio/issues/3291) |
| HOST-13 | host | Tolerances mirrored in Lua and Go | medium | CONFIRMED (values) | see A2's comments |
| HOST-14 | host | Chapter has no Go type (`map[string]any`) | medium | CONFIRMED (count) | see A2's comments |
| HOST-15 | host | Python sidecars redefine `narration_common` | low | CONFIRMED | none (low) |
| HOST-16 | host | Boundary payloads with no host-side golden | low | CONFIRMED | none (low) |
| HOST-17 | host | Host god surface: 783 `Host` methods in the root package | low | CONFIRMED (count) | none (low) |
| HOST-18 | host | Small non-atomic write pairs | low | CONFIRMED (kind half) | none (low) |

Count of the 35 rows by severity: 10 high (UI-1, 2, 3, 5, 9, X-1, HOST-01, 02, 03, 04), 17 medium, 8 low. By area: UI 14, boundary 3, host 18. Medium-or-higher rows that have no tracked issue yet are HOST-03, 05, 08, 09, 10, 11, 13, 14 (A2 files them) and UI-5 and UI-7 (waiting on A2's mark, and in flight under #3258).

## UI and front-end data models (A1)

Method: reading each site, `grep` for every consumer of a concept, file sizes, `depcruise src --config .dependency-cruiser.mjs` (no violations over 2605 modules and 14841 dependencies). `jscpd` was not run: the auto-mode classifier refused the `npx --yes jscpd@4` download and the refusal was not worked around.

### UI-1: first mapping wins here, exactly one wins there

A chapter can hold more than one mapping in the list the UI reads (`chapterTrackMapList`). The readers disagree on what that means:

- Take the first mapping: `components/editing/page/useChapterSource.ts:75`, `components/proof/useChapterTimeline.ts:37`, `components/proof/ProofChapterPage.tsx:87`, `components/pickups/list/usePlayOriginal.ts:139`, `components/engine/chapterTrackRows.ts:21-24` (its comment says "shows its first mapping only").
- Take all, and treat two or more as unlinked: `components/booth/voices/useBoothVoices.ts:108-109`.
- List every chapter per track: `components/engine/TrackList.tsx:24`. Find the mapping for a chapter and a folder: `components/engine/VoicesCard.tsx:60`.

The same chapter reads Linked in the Engine panel, Editing and Proof, and "Linked to several tracks" in the Booth. `api/chapterTrackItems.ts:3-8` calls itself "the one place the UI turns a link into items", which is true of the items and not of the link. **Principle:** one component, hook or function per concept (`ponytail.md`), SRP. **Fix:** one `useChapterLink(chapterId)` that returns `{ state, trackGuid, items }` from one definition of "the chapter's link", used by all of them. **Effort:** M. The host can store more than one mapping per chapter (A2: `MappingStore.Confirm` upserts by track, `desktop/internal/evidence/mapping.go:172-188`; see UI-9 for who writes the second one). Tracked: [#3363](https://github.com/countrymanprime/narration-studio/issues/3363).

### UI-2: seven fetches of the same map

`chapterTrackMapList()` is called from `useChapterSource.ts:74`, `useBoothVoices.ts:93`, `useChapterLinks.ts:84`, `useChapterTimeline.ts:35`, `ProofChapterPage.tsx:82`, `usePlayOriginal.ts:138` and `ChapterLinkDialog.tsx:65`; `tracksList()` is read beside it at four. Each handles loading, failure and staleness its own way, and a link or rename made in one place reaches the others on their next mount. `useChapterLinks.ts:64` says every Engine list draws from the value it returns; only the Engine panel does. **Principle:** DIP and SRP. **Fix:** one project-scoped link store behind a port, invalidated by the link events. **Effort:** M.

### UI-3: five vocabularies for the link state

`'linked' | 'unlinked' | 'missing_track'` (`engine/chapterTrackRows.ts:7`), `'linked' | 'unlinked' | 'missing' | 'unknown'` (`editing/page/useChapterSource.ts:78`, `chapterSource.ts:35,59`), a `several` flag with `no_link` (`booth/record/ChapterLinkNotice.tsx:23`, `booth/record/fixtures.ts:18`), `not_linked` (`layout/EngineChip.tsx:16`, `production/ChapterTrackPanel.tsx:312`) and `unmapped_track` (`stages/stageText.ts:22,38,57`, `engine/EnginePanel.tsx:116`). **Fix:** one union, owned by the hook from UI-1. **Effort:** M, with UI-1.

### UI-4: the same state in six phrasings

"Not linked" (`ChapterLinksTable.tsx:30`, `TrackList.tsx:136`, `LinkChaptersDialog.tsx:173`, `EngineChip.tsx:16`, `ChapterTrackPanel.tsx:312`), "Not linked to a track" (`useChapterLink.tsx:33`, `ChapterLinkNotice.tsx:45`), "is not linked to a track in {daw}, so there is no audio to edit" (`editing/page/noAudioText.ts:23`), "no track linked" (`stages/stageText.ts:22`), "has no track to record on" (`booth/page/BoothNextPage.tsx:639`) and "Not linked yet. This track looks like the chapter" (`ChapterTrackPanel.tsx:153`). **Principle:** `ponytail.md` ("a change to a label … greps for every other place that builds the same string") and the display rules in `docs/design/design-system.md`. **Fix:** one wording module keyed by the UI-3 union. **Effort:** S after UI-3.

### UI-5: three lists, three derivations in one panel

`EnginePanel.tsx:210-231` composes the Tracks card (`TrackList.tsx`: every mapping per track), the Chapter links table (`ChapterLinksTable.tsx` through `chapterTrackRows`: first mapping per chapter) and the Voices card (`VoicesCard.tsx:56-63`: chapter and folder), and the picker in a link row finds "who holds this track" a fourth way (`mapping/trackChoices.ts:42,63`). **Fix:** all four read the UI-1 hook's data. **Effort:** M; coordinate with #3258, which is changing this page.

### UI-6: one unlink, several reads

`engine/useChapterLinks.ts:107-121` writes, then reloads chapters and the map, then calls `onChanged`; `EnginePanel.tsx:111` bumps `refresh`, which reruns the same reload (`useChapterLinks.ts:91-99`) and the stage recommendations (`EnginePanel.tsx:114`) and the live tracks. The host's cost is A2's to confirm. **Fix:** write returns the new map; one invalidation. **Effort:** S.

### UI-7: word and icon buttons in one row

`ChapterLinksTable.tsx:255` is a word `Button` beside icon buttons at `:259`, `:263`, `:269` and `:274`; `ChapterSyncPanel.tsx:183` is a word `Button` where `:90` is an icon button. **Principle:** `frontend-primitives`, "icon buttons with tooltips". **Effort:** S; overlaps #3258.

### UI-8: truncation without a primitive (overclaimed in the first draft)

83 `truncate`, `line-clamp` and `text-ellipsis` sites under `components/` (54 files) are written by hand; there is no shared truncation primitive that attaches a tooltip when the text overflows. The first draft claimed many of them lack a tooltip. That was a same-line grep and does not show it: a coarser per-file check (no `title=`, `Tooltip`, `aria-label=`, `IconButton` or `<Menu` anywhere in the file) leaves three files, `delivery/profile/ProfileMenu.tsx`, `primitives/StatTile.tsx` and `storybible/VoiceReferencesSection.tsx`. What stands is a consistency finding (low). "Truncated text without tooltips" needs a browser check of those three files before it is a defect. No issue filed.

### UI-9: one action, six implementations on two bindings

`chapterTrackSet` (replaces by chapter and by track) is called from `engine/useChapterLinks.ts:126`, `production/ChapterTrackPanel.tsx:99`, `connection/ChapterLinkDialog.tsx:97` and `engine/ChapterSyncPanel.tsx:118`; `chapterTrackMapConfirm` (upserts by track, so it can leave a chapter on two tracks) is called from `recordingcheck/CheckResult.tsx:211` and `editing/EditingCheckPanel.tsx:108`. Only two of the `chapterTrackSet` callers report the chapter that lost the track (`displaced`, `useChapterLinks.ts:110-112` and `ChapterTrackPanel.tsx:100`), in different words; the dialog the Booth and Editing open and the sync panel drop it, so another chapter becomes unlinked without a word. The two check panels re-implement the host's displacement rule in the UI (`mapping/trackHeldBy.ts:3-9`), and guard against the track being held by another chapter, not against the chapter already holding a different track, which is how a second link arises. Errors take three routes (inline text, toast, a "could not be made" line). `chapterTrackUnlink` is called from `useChapterLinks.ts:128` and `ChapterTrackPanel.tsx:112`. **Fix:** one `useChapterLinkActions` owning set, unlink, create, the displaced message and the error path. **Effort:** M. Tracked: [#3365](https://github.com/countrymanprime/narration-studio/issues/3365).

### UI-10: a copied title shown as live

`TrackMapping.chapterTitle` (`api/contracts/chapterTrackMap.ts:7`) is shown by `TrackList.tsx:24` while the other surfaces read the live chapter. A rename shows the old title in the Tracks card until the stored mapping is rewritten. **Fix:** join on `chapterId` against the live chapters. **Effort:** S; host half is A2's.

### UI-11: a 1040-line route component

`AppRoutes` spans `App.tsx:177-1220`, with about 36 state and effect lines and about 80 hook calls in the file. Other large units: `booth/page/BoothNextPage.tsx` (924 lines), `booth/page/useBoothPage.ts` (860), `editing/page/EditingBody.tsx` (806), `storybible/GuideDetail.tsx` (1126), `settings/registry/rows.ts` (1050) and `main.tsx` (743). **Principle:** SRP; `code-standards`. **Effort:** L, one route group at a time.

### UI-12 and UI-13: shapes and names

A chapter has four UI shapes (`api/contracts/manuscript.ts:25`, `primitives/ChapterStepper.tsx:12`, `pickups/list/pickupRows.ts:8`, `storybible/appearsInModel.ts:4`), two of them named `ChapterRef` with `name` versus `title`. Names reused with different meanings: `Scope` (three modules), `FlagKind` (`editing/model/doc.ts:439` and `proof/flags.ts:10` flag the same read problems in disjoint words), `Verdict`, `Gate`, `Span`, `Heard`, `Spot`, and view models that borrow a wire type's name (`editing/model/takes.ts:42` against `api/contracts/takeEvidence.ts:26`; `editing/voicesample/useVoiceSample.tsx:33` against `api/contracts/voiceSamples.ts:76`). Only `FlagKind` is more than a naming problem.

### UI-14: what holds

`depcruise` reports no violations, so the fences are not the problem. `types.ts:2-3` calls itself a compatibility barrel and still re-exports 56 contract modules.

### Not covered by A1 (see also the end of the document)

Dead controls (tracked by #3276), hook-level SRP of the Booth and teleprompter hooks, duplication inside `settings/registry`, drift between `api/*Mock.ts` and the wire, and duplicate detection by tool (`jscpd` was refused).

## Boundary findings (A1 and A2)

- **X-1 (high): saved file against live DAW state, on both sides.** The Booth host code reads the saved .rpp (`desktop/bindings_booth_voice.go:50-72`) while the Engine page reads live tracks (`desktop/tracks_live.go:108,176`). In the UI only the REAPER Engine panel reads `tracksLive()` (`engine/useLiveTracks.ts:91`); nine other readers use the saved-only `tracksList()`: `booth/voices/useBoothVoices.ts:92`, `editing/page/useChapterSource.ts:74`, `editing/EditingCheckPanel.tsx:72`, `recordingcheck/CheckResult.tsx:174`, `proof/useChapterTimeline.ts:35`, `pickups/list/usePlayOriginal.ts:138`, `production/ChapterTrackPanel.tsx:77`, `settings/controls/VoicesBody.tsx:41`, `engine/useDawToolsSource.ts:48`. The Booth patches the gap with its own overlay (`booth/voices/whoIsIn.ts:82` `withAddedVoices`, used at `useBoothVoices.ts:149`, mirrored by the host's `boothVoiceChoices.added`). Tracked: [#3307](https://github.com/countrymanprime/narration-studio/issues/3307), [#3286](https://github.com/countrymanprime/narration-studio/issues/3286).
- **X-2 (medium): the UI says "tracks" for a count of links.** The host reason `several_links` counts mapping rows (`desktop/readaloudreaper.go:94`); `booth/record/useRecordControl.ts:24-26` turns it into `tracks: 'several'` and `booth/record/recordCheck.ts:39` into the refusal `several_tracks`.
- **X-3 (low): one unknown cause, three sentences.** `stages/stageText.ts:22,38,57` words `unmapped_track` three times with different actions.

## Host, bridge, sidecars and the wire (A2)

A2's findings (HOST-01 to HOST-18, the symptoms by cause, the plain-words top ten for the host and the list of what A2 did not verify) are in A2's comments on #3279, which are the authoritative record of that section: [batch 1](https://github.com/countrymanprime/narration-studio/issues/3279#issuecomment-6758099171), [A2's cross-check of the UI findings](https://github.com/countrymanprime/narration-studio/issues/3279#issuecomment-6758115226), [corrections and answers](https://github.com/countrymanprime/narration-studio/issues/3279#issuecomment-6758158787), [tracked issues](https://github.com/countrymanprime/narration-studio/issues/3279#issuecomment-6758177897) and [its ten worst](https://github.com/countrymanprime/narration-studio/issues/3279#issuecomment-6758185608). Two attempts by A2 to push its own section to a branch were refused by the auto-mode classifier and were not worked around; A2's text is not copied into this file, which is why the summary table points to the comments for those rows. A2's findings keep the corrections made in the cross-check: HOST-02 has 13 call sites in the root package, not 21; HOST-08 has 23 internal imports, most only to name a file.

## Disagreements

None. Open items rather than disagreements: UI-5 and UI-7 are marked by A1 only (A2 did not open the files); UI-8 was overclaimed by A1 and is withdrawn to a low consistency finding; HOST-03, 05, 09, 10, 11, 13, 14, 16 and 18 were confirmed by A1 on the halves it opened only; A2's Go halves of HOST-09, 10 and 14 and the timing claims behind HOST-03 and 04 were not run by anyone.

## What was not covered

Dead controls (#3276 and its follow-ups), hook-level SRP of the Booth and teleprompter hooks, duplication inside `settings/registry`, drift between `api/*Mock.ts` and the wire, Audacity adapter internals, Windows-only files, Python unit tests, and duplicate detection by tool (`jscpd` was refused by the auto-mode classifier, "[Code from External]", and not worked around; the coordinator confirmed no detection tool is installed). Nothing in this audit was timed or run.
