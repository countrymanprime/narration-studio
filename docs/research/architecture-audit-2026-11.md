# Architecture audit, November 2026: duplicated components, data models and interfaces

**Audited 2026-11-10.** Issue: [#3279](https://github.com/countrymanprime/narration-studio/issues/3279). **Question:** where does the app model one concept more than once, skip a component, hook or type that already exists, or break the repo's own SOLID and design rules, and which of those explain the owner's reports (two Engine track lists, the Engine track list, the chapter linking and the Booth disagreeing on a chapter's tracks, icon and word buttons mixed in one panel, wording that follows a different rule on each screen, buttons that do nothing, truncated text without tooltips, slow unlink)?

**Status.** Read-only audit of `main` at `0ae1836`. Two reviewers split the app: A1 the UI and its data models (`src/studio/ui/src`), A2 the host, bridge, sidecars and wire. Each finding was opened in the code by the reviewer who wrote it and then by the other. Findings the other reviewer has not yet marked are listed as `proposed` and are not counted as confirmed.

## Top ten

The plain-words list is written last, once the cross-check has settled the statuses. See [the summary table](#summary-table) for the current state.

## Summary table

| id | area | finding | severity | status | tracked issue |
| - | - | - | - | - | - |
| UI-1 | UI | Five readers take a chapter's first mapping, the Booth takes all and treats two or more as no link | high | proposed | |
| UI-2 | UI | Seven call sites each fetch the chapter-track map themselves; no shared source | high | proposed | |
| UI-3 | UI | Link state modeled in five vocabularies | high | proposed | |
| UI-4 | UI | Link wording differs per screen | medium | proposed | |
| UI-5 | UI | Three track lists in the Engine panel, three derivations of chapter and track | high | proposed | |
| UI-6 | UI | One unlink triggers two reloads plus stage and live-track reads | medium | proposed | |
| UI-7 | UI | Word and icon buttons mixed in one Engine row | medium | proposed | |
| UI-8 | UI | No truncation primitive; 83 hand-written sites | medium | proposed | |
| UI-9 | UI | `chapterTrackSet` called from four places; the displaced chapter is reported by two | high | proposed | |
| UI-10 | UI | A copied chapter title rides on the link and is shown as live | medium | proposed | |
| UI-11 | UI | `AppRoutes` is about 1040 lines | medium | proposed | |
| UI-12 | UI | Four UI shapes for a chapter, two types named `ChapterRef` | low | proposed | |
| UI-13 | UI | Same type name, different meaning, in several modules; `FlagKind` differs between editing and proof | low | proposed | |
| UI-14 | UI | Import fences hold (0 violations); `types.ts` barrel still used | low | observation | |

## UI and front-end data models (A1)

Method: reading each site, `grep` for every consumer of a concept, file sizes, `depcruise src --config .dependency-cruiser.mjs` (no violations over 2605 modules and 14841 dependencies). `jscpd` was not run: the auto-mode classifier refused the `npx --yes jscpd@4` download and the refusal was not worked around.

### UI-1: first mapping wins here, exactly one wins there

A chapter can hold more than one mapping in the list the UI reads (`chapterTrackMapList`). The readers disagree on what that means:

- Take the first mapping: `components/editing/page/useChapterSource.ts:75`, `components/proof/useChapterTimeline.ts:37`, `components/proof/ProofChapterPage.tsx:87`, `components/pickups/list/usePlayOriginal.ts:139`, `components/engine/chapterTrackRows.ts:21-24` (its comment says "shows its first mapping only").
- Take all, and treat two or more as unlinked: `components/booth/voices/useBoothVoices.ts:108-109`.
- List every chapter per track: `components/engine/TrackList.tsx:24`. Find the mapping for a chapter and a folder: `components/engine/VoicesCard.tsx:60`.

The same chapter reads Linked in the Engine panel, Editing and Proof, and "Linked to several tracks" in the Booth. `api/chapterTrackItems.ts:3-8` calls itself "the one place the UI turns a link into items", which is true of the items and not of the link. **Principle:** one component, hook or function per concept (`ponytail.md`), SRP. **Fix:** one `useChapterLink(chapterId)` that returns `{ state, trackGuid, items }` from one definition of "the chapter's link", used by all of them. **Effort:** M. **Host question for A2:** whether the host can store more than one mapping per chapter.

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

### UI-8: truncation without a primitive

83 `truncate`, `line-clamp` and `text-ellipsis` sites under `components/` are written by hand, and the `Tooltip` primitive is not attached to them by construction. The first 25 whose line carries no `title=` or tooltip include `booth/voices/VoiceControl.tsx:112,131,186,196`, `booth/frame/LevelsMenu.tsx:366`, `engine/ChapterSyncConsentDialog.tsx:67`, `delivery/profile/ProfileMenu.tsx:35`, `primitives/ChapterStepper.tsx:72,107`, `primitives/StatTile.tsx:52` and `primitives/StageGrid.tsx:139`. The check is by line, so a wrapper above may supply the tooltip; each site needs confirming. **Fix:** a `Truncated` primitive that shows a tooltip when the text overflows, and a guard test that bans bare `truncate` in `components/`. **Effort:** M.

### UI-9: one action, four implementations

`chapterTrackSet` is called from `engine/useChapterLinks.ts:126`, `production/ChapterTrackPanel.tsx:99`, `connection/ChapterLinkDialog.tsx:97` and `engine/ChapterSyncPanel.tsx:118`. Only the first two report the chapter that lost the track (`displaced`, `useChapterLinks.ts:110-112` and `ChapterTrackPanel.tsx:100`), in different words; the dialog the Booth and Editing open and the sync panel drop it, so another chapter becomes unlinked without a word. Errors take three routes (inline text, toast, a "could not be made" line). `chapterTrackUnlink` is called from two places the same way. **Fix:** one `useChapterLinkActions` owning set, unlink, create, the displaced message and the error path. **Effort:** M.

### UI-10: a copied title shown as live

`TrackMapping.chapterTitle` (`api/contracts/chapterTrackMap.ts:7`) is shown by `TrackList.tsx:24` while the other surfaces read the live chapter. A rename shows the old title in the Tracks card until the stored mapping is rewritten. **Fix:** join on `chapterId` against the live chapters. **Effort:** S; host half is A2's.

### UI-11: a 1040-line route component

`AppRoutes` spans `App.tsx:177-1220`, with about 36 state and effect lines and about 80 hook calls in the file. Other large units: `booth/page/BoothNextPage.tsx` (924 lines), `booth/page/useBoothPage.ts` (860), `editing/page/EditingBody.tsx` (806), `storybible/GuideDetail.tsx` (1126), `settings/registry/rows.ts` (1050) and `main.tsx` (743). **Principle:** SRP; `code-standards`. **Effort:** L, one route group at a time.

### UI-12 and UI-13: shapes and names

A chapter has four UI shapes (`api/contracts/manuscript.ts:25`, `primitives/ChapterStepper.tsx:12`, `pickups/list/pickupRows.ts:8`, `storybible/appearsInModel.ts:4`), two of them named `ChapterRef` with `name` versus `title`. Names reused with different meanings: `Scope` (three modules), `FlagKind` (`editing/model/doc.ts:439` and `proof/flags.ts:10` flag the same read problems in disjoint words), `Verdict`, `Gate`, `Span`, `Heard`, `Spot`, and view models that borrow a wire type's name (`editing/model/takes.ts:42` against `api/contracts/takeEvidence.ts:26`; `editing/voicesample/useVoiceSample.tsx:33` against `api/contracts/voiceSamples.ts:76`). Only `FlagKind` is more than a naming problem.

### UI-14: what holds

`depcruise` reports no violations, so the fences are not the problem. `types.ts:2-3` calls itself a compatibility barrel and still re-exports 56 contract modules.

### Not covered by A1

Dead controls (tracked by #3276), hook-level SRP of the Booth and teleprompter hooks, duplication inside `settings/registry`, drift between `api/*Mock.ts` and the wire, and duplicate detection by tool (`jscpd` was refused).

## Host, bridge, sidecars and the wire (A2)

A2's section is added here by A2 on this branch.

## Disagreements

None recorded yet.
