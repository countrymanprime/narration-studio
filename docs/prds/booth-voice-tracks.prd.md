# Booth Voice Tracks: Record Each Character on a Child Track of the Chapter's REAPER Folder

**Source:** owner request on [#2251](https://github.com/countrymanprime/narration-studio/issues/2251), the design note [Recording to character sub-tracks in the Booth](../research/2026-10-30-booth-sub-track-recording.md) and the owner's answers to its section 8 (2026-11-02).

**Constraints:** [Design principles](../architecture/principles.md), [Wire contracts](../architecture/wire-contracts.md), [REAPER reference](../reference/daw/reaper.md), [DAW capabilities](../reference/daw/capabilities.md), [Data files](../reference/data-files.md), [frontend-primitives](../../.claude/skills/frontend-primitives/SKILL.md).

**Status (2026-11-03):** in delivery. Phase 0 (real-REAPER scenarios) ran ([#2716](https://github.com/countrymanprime/narration-studio/pull/2716)). The owner approved the mock in [`mockups/booth-voices/`](../research/mockups/booth-voices/README.md) and answered its decisions on 2026-11-03.

## Problem Statement

A narrator voicing several characters wants each character's lines on that character's own REAPER track, so an FX chain on the track (the owner's example: drone chirps) covers every item the character speaks with no per-item FX. Today a chapter links to one track and every take lands on it.

## Evidence

- Owner request on #2251 and the eight answers recorded in section 8 of the design note.
- Phase 0 in REAPER 7.82 on Linux ([section 6a](../research/2026-10-30-booth-sub-track-recording.md#6a-phase-0-results)): a child records with its folder unarmed; FX on a child act on that child's items only and FX on the folder on all; REAPER keeps recording through an arm change mid-take, with one undo point for the take; solo in place on the folder plays its children.
- Phase 0 also shows what breaks: `play_range` naming a folder with items only on children is refused, and `chapter_track_state` lists such a folder as empty (rows 12 and 13).

## Proposed Solution

A project chooses its layout: **Flat** (a chapter is one track, as today) or **Voice folders** (a chapter is a folder whose children are its voices). Nothing converts a project. In a Voice folders project:

1. A chapter links to its folder. The link stays one GUID in `chapter-track-map.json`.
2. Each child is a voice. A child whose name matches a character (or an alias) records that character; the narrator can assign characters to a child by hand, several to one child ("Extras"), and a character to the Narrator child for a first-person book.
3. In the Booth, `Numpad0` arms the Narrator child, `Numpad1`–`Numpad9` the others in REAPER's order, `NumpadAdd` and `NumpadSubtract` the next and previous voice, and `NumpadDecimal` opens the voice list. A key during a take switches the armed child live. The armed voice never follows the speaker tag.
4. A character with no track, or a key with no track, follows the rule in [section 8](../research/2026-10-30-booth-sub-track-recording.md#8-owner-decisions) of the design note: while stopped, a dialog makes or assigns a track; while recording, the take goes on (on the Narrator child, with a notice, or refused with a toast for a key).
5. Editing play, live items, word times and the recording check read the folder's children as the chapter's audio.

## Key Hypothesis

If the voice change is one key and never stops the transport, the narrator records a multi-voice chapter in one pass and the FX follow the character. We are wrong if the 64 ms unrecorded at a switch (phase 0, row 7) is heard, or if narrators find the folder setup in REAPER harder than per-item FX.

## What We're NOT Building

- Following the script: the armed voice never changes by itself (decision 6).
- Converting a flat chapter into a folder (decision 7).
- Recording once and splitting by speaker afterwards (option C of the design note).
- Folder voices for Audacity or the built-in recorder: they have no folders, so the layout setting is off there ([DAW capabilities](../reference/daw/capabilities.md)).
- A stems render per voice.

## Success Metrics

- A multi-voice chapter recorded with only number-pad presses ends with each character's items on its child, checked by a real-REAPER scenario.
- No flat project changes: every existing real-REAPER and harness test passes unchanged.
- The Booth shows the armed voice REAPER reports, never an assumed one (`thisArmed`, `armedCount`).

## Open Questions

None. The mock's five questions and two more (key order, default layout) were answered on 2026-11-03 ([#2251 comment](https://github.com/countrymanprime/narration-studio/issues/2251#issuecomment-6594214485)); the answers are [the mock's decisions](../research/2026-10-30-booth-sub-track-recording.md#8-owner-decisions) in the design note.

## Users & Context

Narrators who voice several characters and use REAPER, and the owner, whose example is a robot character with drone-chirp FX. Maintainers of the bridge and the Booth.

## Solution Detail

| Priority | Capability |
| --- | --- |
| Must | Layout setting per project; folder link; union reads; voice keys and the live switch; name matching; the no-track rule; the voice control and list |
| Should | Hand assignment, several characters per child, the Narrator as a character; nested `track_create`; "Who is in it?" |
| Won't | Follow the script; conversion; split by speaker; making a chapter's missing tracks with no press (decision B) |

## Technical Approach

### Wire-contract changes

Each walks [wire-contract-change](../../.claude/skills/wire-contract-change/SKILL.md): schema, golden payload (`UPDATE_CONTRACTS=1`), a row in `wireContracts.test.ts`, the mock, the `hostAPIVersion` rule.

| Change | Where | Shape |
| --- | --- | --- |
| Layout per project | `voice-tracks.json` (below) | `layout`: `flat` (default when the file is absent) or `folders`. Kept with the voice setup it governs, not in `settings.json`: one file per project holds everything the Voices card saves. |
| Folder link vs child | `chapter-track-map.json` | Unchanged shape: a chapter's link is the folder's GUID in a folders project, the track's in a flat one. The host tells the two apart by `isFolder` on the tracks list (already on the wire). |
| Voice assignments | New `voice-tracks.json` in `<project>/<app>/` | `{ schemaVersion, layout, narratorCharacter, tracks: { "<child track name>": { characters: ["<character id>"] } } }`. Keyed by name, so one assignment holds for every chapter folder with a child of that name. A child absent from `tracks` matches by name and alias. Bindings `VoiceTracksGet`, `VoiceTracksSetLayout`, `VoiceTracksSetCharacters`, `VoiceTracksSetNarrator`; golden, schema and a `data-files.md` row. |
| Voices of a chapter | New binding `BoothVoices(chapterId)` | `{ layout, folderGuid, voices: [{ key, trackGuid, trackName, characters: [{ id, source: "name" \| "alias" \| "assigned" }], armed }], unmatched: [{ characterId, lines }] }`. |
| Chapter items across children | REAPER `chapter_track_state` | A `children` flag; `TRACK_ITEM` gains the item's track GUID as a new last field, so an older reader that stops at `muted` still reads. A row change in `internal/bridge/wire.go`. |
| Live switch | New REAPER command `switch_voice(track)` and event `VOICE_SWITCHED\|run\|trackGuid\|at` | Accepted only while a recording this bridge started runs ([section 6b](../research/2026-10-30-booth-sub-track-recording.md#6b-what-phase-0-changes-in-the-bridge-plan)). `RECORD_STOPPED` and `RECORD_ENDED` keep their fields. |
| Nested track | `track_create` gains an optional parent GUID | Inserts after the folder's last child and moves its closing delta (row 2). |

No new trust boundary: `voice-tracks.json` is written and read back by the host and names no path, command or URL, so it gets a `data-files.md` row and no threat-model row. Track names already cross to REAPER through `track_create`.

### Risks

- **The one-track take model.** `record_start`, `stopped_at`, `record_take` undo and the Booth's take record assume one track. A switch keeps one undo point (row 7), so `undo_last` needs no new cap; the take record gains the list of voices.
- **The stop guard.** `set_cursor` and `punch_to` sent within half a second of a stop were moved back (row 4). Fixed in phase 4a, for flat chapters too: both now end the guard.
- **Key conflicts.** `NumpadAdd` and `NumpadSubtract` are text size today; `findConflicts.test.ts` guards the catalog.
- **Union reads** touch Editing play, live items, word times and the recording check: the largest regression surface.

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends |
| --- | --- | --- | --- | --- | --- |
| 0 | Real-REAPER proof | Scenarios, measurements, design note | complete (#2716) | n/a | n/a |
| 1 | Mock | This PRD and the mock, approved by the owner | complete (#2718, approved 2026-11-03) | n/a | 0 |
| 2 | Union reads | `chapter_track_state` children; Editing play solos the folder; live items, word times, recording check read the union | 2a complete (#2783: bridge, Editing play, live items, word times); 2b pending (recording check from the saved project) | with 3 | 1 |
| 3 | Layout and assignments | `voice-tracks.json` (layout and assignments), folder links, Engine Voices card, nested `track_create` | 3a complete (#2791, nested `track_create`); 3b and 3c in review (#2799) | with 2 | 1 |
| 4 | Booth voices | Catalog rows, voice control and list, `switch_voice`, stop-guard fix, the no-track rule for a key (its notice and dialog are phase 5) | 4a complete (#2811: `switch_voice` in the bridge, stop-guard fix); 4b in review (the Booth's keys, control and list, `BoothVoiceSet`) | no | 2, 3 |
| 5 | Who is in it | The dialog on an empty key, making a chapter's missing tracks, the Voices card's "No track" row and its make-track press, the side list's voice keys and add-track press (decision B), the record control's notice for a character with no track (decision 5) and its after-stop offers, `BoothVoices` | pending | no | 4 |

### Phase details

| # | Size | Files | Collision risk |
| --- | --- | --- | --- |
| 2 | L | `narration_track_state.lua`, `narration_transport.lua` (`plays_at`, `isolate`), `tests/track_state_test.lua`, `tests/transport_sync_test.lua`, `internal/bridge/wire.go`, `bindings_daw_liveitems.go`, `bindings_workspace_wordtimes.go`, `internal/coverage/workspace.go`, `internal/bridge/workspace.go`, UI schemas and mocks; real-REAPER scenarios 8 and the folder play | Anything on Editing play or word times; the record-press timeline (#2697) shares `narration_transport.lua` |
| 3 | M | A new `internal/voicetracks` package, `chapterlinks.go`, `chaptertrackcreate.go`, `narration_track_create.lua` and its test, `components/engine/EnginePanel.tsx`, `TrackList.tsx`, `components/mapping/TrackSelect.tsx`, `components/tracks/trackTree.ts`, `api/chapterTrackMatchMock.ts`; Engine guide and screenshots | Folder-tracks follow-ups on the Engine panel |
| 4 | M | `input/commands.catalog.ts`, `input/findConflicts.test.ts`, `components/booth/frame/BoothFooter.tsx`, `components/booth/page/BoothNextPage.tsx`, `components/booth/side/VoicesNearby.tsx`, `components/booth/reading/SpeakerChip.tsx`, `bindings_readaloud_record.go`, `narration_transport.lua`, `tests/transport_test.lua`, `fake_reaper.lua` and `fake_fidelity_test.lua` (live arm rows); Booth guide | Open #2691 and #2713 touch the Booth; serial with any other change to `narration_transport.lua` |
| 5 | S | The Booth dialog, `BoothVoices`, nested `track_create` | Low |

Each phase follows the CLAUDE.md workflow: harness test first for each bridge change, a real-REAPER scenario for what the fake cannot prove, the narrator walkthrough and `qa-breaker` before merge.

Phase 3 as built (#2799): the layout is kept in `voice-tracks.json` with the assignments it governs, not in `settings.json`. The layout switch is Chapter sync's Layout row, as the mock draws it; while Chapter sync draws nothing (consent not yet given) the Voices card carries it. The Voices card's "No track" row and `BoothVoices` move to phase 5, with the make-track press that needs them.

Phase 4 as built: the Booth records a folder-linked chapter on its chosen voice, the track named Narrator until the narrator chooses another, and the host remembers the choice per chapter until the app closes or another project opens. `BoothVoiceSet(chapterId, trackGuid)` chooses a voice, refused unless the GUID is a direct child of the chapter's folder; during a take this app started it sends `switch_voice`. `BoothVoiceGet(chapterId)` reads the voice the host records on, so the control never shows a voice the page assumed, and `ReadAloudReaperState` reads REAPER's arms on that voice rather than the folder: the control's arm dot and its several-armed warning come from that read (during the app's own take, from the start and switch answers). The voice list is built in the page from the tracks, the links and the Story Bible, as the Voices card is; `BoothVoices` and its `unmatched` list stay in phase 5. The list is the speaker picker's search-and-list body, extracted as the `SearchList` primitive. Num 0 to Num 9 choose a voice by key, Num + and Num − step through them and Num . opens the list, so text size keeps only = and -. A key with no track says "No track on Num N." and changes nothing, while stopped too: the "Who is in it?" dialog, the side list's add-track press and the notice for a character with no track while recording move to phase 5 with the track making they need.

## Decisions Log

| Date | Decision | By |
| --- | --- | --- |
| 2026-11-02 | The eight answers in [section 8](../research/2026-10-30-booth-sub-track-recording.md#8-owner-decisions) | Owner |
| 2026-11-02 | Live switch (option B) for phase 4, since phase 0 showed REAPER supports it | Plan |
| 2026-11-03 | The mock is approved; decisions A to G in [section 8](../research/2026-10-30-booth-sub-track-recording.md#8-owner-decisions): the voice control on the record bar, add-track buttons with no automatic tracks, a brief message for an empty key while recording, the Voices card on the Engine panel, arm and disarm together on a switch, keys in REAPER folder order with the Narrator at 0, flat by default | Owner ([#2251 comment](https://github.com/countrymanprime/narration-studio/issues/2251#issuecomment-6594214485)) |
