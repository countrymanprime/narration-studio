# Architecture audit, November 2026: the host, the bridge, the sidecars and the wire (A2)

**Audited 2026-11-10.** Issue: [#3279](https://github.com/countrymanprime/narration-studio/issues/3279). This is the host half of the audit; the UI half is [architecture-audit-2026-11.md](architecture-audit-2026-11.md) (A1). Each finding here was opened in the code by its author and then by the other reviewer; the status column says where a finding stands. A1 marked all eighteen findings CONFIRMED; for HOST-09, 10, 11, 13 and 14 it opened one side of each. A2 marked A1's UI-1 to UI-7 and UI-9 to UI-14 CONFIRMED; the cross-check comments are on #3279. Nothing was run: the container had Go 1.27.2 and the module needs 1.27.3, so cost claims come from reading the code.

## Summary table

| id | area | finding | severity | status | tracked issue |
| - | - | - | - | - | - |
| HOST-01 | host | The Booth takes a chapter's voices from the saved project, direct children only; the Engine page uses the live list | high | confirmed | #3286 |
| HOST-02 | host | The saved project is parsed from disk on every call (13 sites); the one cache serves one provider | high | confirmed | #3287 |
| HOST-03 | host, bridge | The record press reads every item on the track, twice, to learn two booleans | high | confirmed | #3360 |
| HOST-04 | host | Unlink and link run the measured chapter list, which hashes every source file | high | confirmed | #3272 |
| HOST-05 | host | Evidence ledger and source identity are uncached; cost multiplies takes by records | medium | confirmed | #3361 |
| HOST-06 | host | "Linked to N tracks" counts links; the check and its sentence are written twice; `Confirm` adds a second link | medium | confirmed | #3288 |
| HOST-07 | host | voice-tracks.json keyed by track name; the Narrator rule written three times; two paths read it without a Reporter | medium | confirmed | #3289 |
| HOST-08 | host | `manuscript.resetDerived` hard-wires 23-import manuscript store hard-wiring other packages' files | medium | confirmed | #3362 |
| HOST-09 | host | Track, item and take modelled four to eight times and converted by hand | medium | confirmed | #3364 |
| HOST-10 | host, bridge | Folder children and layout answered five ways with different meanings | medium | confirmed | #3367 |
| HOST-11 | bridge | Bridge and DAW port declare the same structs; three tables to change together | medium | confirmed | #3369 |
| HOST-12 | bridge (Lua) | Lua helpers copied per module (`normalize_guid` in 14) | medium | confirmed | #3291 |
| HOST-13 | bridge | Judgement mirrored in Lua and Go (tolerances, stack and folder planning) | medium | confirmed | #3372 |
| HOST-14 | wire | The chapter has no Go type; manuscript.json has no file golden shared with Python | medium | confirmed | #3374 |
| HOST-15 | sidecars | Sidecars re-implement `narration_common`; `ui_bridge.py` has no production user | low | confirmed | |
| HOST-16 | wire | Payloads with no host-side golden (hints, guide create, words cache) | low | confirmed | |
| HOST-17 | host | One package holds the host: 793 methods, 32k lines, three lint fences | low | confirmed | |
| HOST-18 | host | Small write pairs (chapter kind and links; keeper and hidden) | low | confirmed (documented choice) | |

## Host, bridge, sidecars and the wire (A2)

Method (A2): reading each site; a grep-built import graph of `desktop/internal` (`go list` could not run, the module needs Go 1.27.3 and the container has 1.27.2); counts by `grep` and `wc`; the three `depguard` rules in `src/studio/desktop/.golangci.yml`; four read-only sweeps (duplicated concepts, cost per action, wire and data files, sidecars and Lua) whose headline claims were re-opened in the code before they were written here. Nothing was run. Paths below are under `src/studio/`; `D/` is `desktop/`.

### The owner's reports, by cause

- **Booth and Engine disagree on a chapter's voices (HOST-01).** `D/bindings_booth_voice.go:50-72` (`chapterVoices`) reads the saved .rpp through `selectedProject` (`D/tracks.go:162`) and keeps direct children only. The Engine page reads `tracksLive` (`D/tracks_live.go:108,176`), REAPER's live list laid over the saved file. The host already has a live path for links (`chapterTrackLinksLive`, `D/chapterlinks.go:161`); the Booth does not use it, and patches the gap with an in-memory list of voices added this session (`boothVoiceChoices.added`, and the UI's `withAddedVoices`, `components/booth/voices/whoIsIn.ts:82`).
- **"Single track only" on a two-track folder (HOST-06).** The sentence counts rows in `chapter-track-map.json`, not tracks: `D/readaloudreaper.go:94` and again `D/bindings_readaloud_record.go:90`. A folder is one link. A second row appears because `MappingStore.Confirm` upserts by track (`internal/evidence/mapping.go:172-188`; its comment: "consumers treat a chapter with several links as unknown, a consumer rule this store does not enforce"), so confirming the folder and then a child leaves two links. A link to a deleted track counts too. The only writer that can add a second row for a chapter is `ChapterTrackMapConfirm`, called from `recordingcheck/CheckResult.tsx:196` and `editing/EditingCheckPanel.tsx:94`; `SetChapter` replaces and `AutoLink` (chapter sync) skips a chapter that already has a link (`mapping.go:295-333`). The owner's exact repro was not reproduced.
- **Record press grows with takes (HOST-03).** The press asks REAPER for every item on the track to learn two booleans (`D/bindings_readaloud_record.go:206`; `integrations/reaper/narration_track_state.lua:149-155` emits a `TRACK_ITEM` per item), then `record_start` walks the track again (`narration_transport.lua:721`). `evidence.Identify` and the editing provider are not on this path; they are on the unlink path.
- **Slow unlink (HOST-04).** `chapterTrackUnlink` (`D/chapterlinks.go:61`) calls `chapterTitle` (`D/mapping.go:84`), which calls the measured `manuscript.Chapters()` (`internal/manuscript/reader.go:60,81-88`): every checked chapter is evaluated, `evidence.Identify` opens and hashes every source file (`internal/evidence/identity.go:45`) and the ledger directory is decoded again (`internal/evidence/ledger.go:240`). `ChaptersUnmeasured` exists for this and `chapterLinksFor` uses it; `chapterTitle` was missed. The UI then reloads the same list twice more (UI-6).
- **Take and item data read more than once per action (HOST-02).** `readProject` (`D/tracks.go:201`) parses the .rpp each call, with 13 call sites in the root package (16 with `internal/`) and no shared cache; the only cache, `projectParseCache` (`D/recordedlengths.go:85-99`), serves one provider.
- **voice-tracks.json keyed by track name (HOST-07).** `internal/voicetracks/voicetracks.go:7-9`. Everything else about a voice is keyed by GUID, so a rename in REAPER drops the assignment and keeps the chapter link.

### HOST-01 Booth reads the saved project, the Engine reads the live one (high)

Above. Principle 7 and 8 (a stale target; callers ask the port). **Fix:** `selectedProject` takes the lister and overlays the live list as `chapterTrackLinksLive` does; delete `unsavedVoices`, `boothVoiceChoices.added`, `BoothVoice.Added` and `withAddedVoices`; the Booth reads `tracksLive`. Eight UI sites read the saved-only `tracksList` (`useChapterSource`, `EditingCheckPanel`, `CheckResult`, `useBoothVoices`, `useChapterTimeline`, `usePlayOriginal`, `ChapterTrackPanel`, `VoicesBody`). **Effort:** S to M.

### HOST-02 The saved project is re-parsed on every call (high)

`readProject`/`selectedProject` have 13 non-test call sites in the root package (16 counting `internal/`). `chapterFolderOf` (`D/bindings_daw_ripple.go:49`) parses it for every edit (split, trim, ripple, repair click, reduce gain, stack) with no layout check; unstack parses twice. In a Voice-folders chapter every record press and every Booth poll tick parses it. Two readers do the same job (`readProject` through the resolver, `projectFileReader`, `D/tracks.go:215-224`), and the second branches on `audacity.IsSnapshot(path)`, which names an adapter by file name (principle 8). **Fix:** one cache keyed by path, mtime and size on `hostServices`, behind `selectedProject`; one reader. **Effort:** S.

### HOST-03 The record press reads every take (high)

Above, plus `TeleprompterReaperInput` (`D/teleprompterinput.go:83-86`) reading the same state twice on a stale link, and the polled `readAloudReaperStateIn` repeating it every tick while recording. The built-in recorder has the same shape: `recording/service.go:266` lists every take to find the highest number, and `listTakes` (`internal/recording/takes.go:68-111`) opens every WAV. **Fix:** an `items:none` option on `chapter_track_state` with a harness test (`reaper-command-add`); the recorder reads names only. **Effort:** S.

### HOST-04 Unlink and link run the measured chapter list (high)

Above. `chapterTrackSet` and `mappingConfirm` share `chapterTitle`, so linking is slow for the same reason. **Fix:** `chapterTitle` uses `ChaptersUnmeasured`. **Effort:** XS plus a test. The UI half is UI-6.

### HOST-05 Evidence ledger and source identity are uncached (medium)

`LedgerStore.All` reads and decodes every record file (`internal/evidence/ledger.go:240-259`); `List` is called twice per `EvaluateChapter` (`internal/evidence/staleness.go:392,456,474`) and per item by the editing provider (`internal/editing/provider.go:57-120`: three analyzers, N items, a ledger read each). `Identify` is cacheable by path, size and mtime because its hash derives from them. **Fix:** index the ledger by analyzer and chapter; cache `Identify`. **Effort:** S to M.

### HOST-06 Links counted as tracks (medium)

Above. The check and its sentence are written twice, and every other consumer decides 0, 1 or many again: `internal/editing/service.go:~316-334`, `internal/editing/signals.go:163`, `D/recordedlengths.go:59`, `internal/coverage/view.go:14`, `D/chapterregions.go:152`, and the UI (UI-1). **Fix:** one `chapterLink()` returning one of guid, none or several, resolved once per action; `Confirm` replaces by chapter or is retired for `SetChapter` (`mapping.go:226`, which already does); say "links". **Effort:** S to M.

### HOST-07 Voice assignments by name, and the rules around them (medium)

Besides the key: the Story Bible has `FollowMerge` and `UndoFollow` for voice samples (`D/bindings_voicesamples.go:122,138`) and nothing for voice tracks, and `voicetracks` does not import the guide, so a merge or delete leaves dangling character ids. "Narrator is key 0" is coded in `D/bindings_booth_voice.go:96`, `D/chaptertrackcreate.go:19` and the UI's `voices.ts`. `voicetracks.New` gets no `Reporter` at `D/bindings_booth_voice.go:48` and `D/chaptertrackcreate.go:274` (it does at `bindings_voicetracks.go:33` and `boothvoiceadd.go:116`), so a corrupt file is read as empty without a notice on those paths. Principle 11. **Fix:** decide the key (rename flows update the file, or a GUID override), send one host-computed narrator flag, pass the Reporter. **Effort:** M.

### HOST-08 The manuscript store knows every other store's files (medium)

`internal/manuscript/service.go:684` (`resetDerived`) lists the paths of evidence, chaptersync, coverage, stages, character, proofing, preview, editing (five files), bookmarks, gapreview, pickuplist, passagemap, marks and scriptprep. The package has 23 distinct non-test `desktop/internal/*` imports (`for f in internal/manuscript/*.go` minus tests, `grep -oE '"desktop/internal/[a-z/]+"' | sort -u | wc -l`), most of them only to name a file; that is the highest fan-out in `internal/`. A new persisted file that is not added there survives a manuscript replace with stale ids, against principle 11 ("a file kept for a different document reads as empty"). **Fix:** each package registers its reset with `persist`, or a test walks `docs/reference/data-files.md` and fails on a file with no retention class. **Effort:** M.

### HOST-09 Track, item and take modelled many times (medium)

Track: `tracks.Track` (`internal/tracks/tracks.go:140`), `bridge.LiveTrack` (`internal/bridge/tracks_read.go:22`), `trackSummary` (`D/chapterlinks.go:~109`), `trackOption` (`D/chaptermatch.go:91`), `chaptersync.TrackState` (`internal/chaptersync/plan.go:328`, a fingerprint snapshot that shares its name with `bridge.TrackState`, aliased `dawport.TrackState`, `internal/dawport/roles.go:29`) and the TS `Track`. Item: `tracks.Item` (`tracks.go:20-88`, with the active take's fields copied onto it), `bridge.TrackItem` (`internal/bridge/track_state.go:36`), `wordtimes.Live`, `coverage.ManifestItem` (`internal/coverage/manifest.go:30`) and `recordingcoverage.ManifestItem` (`internal/recordingcoverage/inputs.go:104`), field for field the same. Take: `tracks.Take`, `recording.Take`, `passagetakes.Candidate`, `retakelanes.Retake`. "What items has this chapter" has two answers: saved (`internal/coverage/manifest.go:68`, all descendants, by position) and live (`dawport.ChapterAudioState`, per track); `D/teleprompterlocate.go:~205` rebuilds the live shape from the saved one by hand. **Fix:** rename `chaptersync.TrackState`; embed `tracks.Track` in `trackSummary`; one `ManifestItem`; one chapter-items shape. **Effort:** M to L.

### HOST-10 Folder children and layout, five ways (medium)

Folder membership is computed in Lua (`narration_bridge_core.lua:281`, `narration_track_create.lua:55-70`), in Go (`tracks.WithDescendants`, `internal/tracks/tracks.go:277`; depth in `internal/tracks/parse.go:41-44` and again in `D/tracks_live.go:187-190`) and in TS (`voices.ts`). Coverage, recorded length and the Lua union count all descendants; Booth and Engine voices count direct children, so a nested sub-folder's audio counts for the chapter and its tracks are not voices. The layout is a project-wide flag (`voicetracks.Layout`) while a chapter's real shape is whether its link is a folder, which every consumer re-detects. **Fix:** one direct-children function beside `WithDescendants`; the host sends the voices; the layout comes from the link. **Effort:** M.

### HOST-11 Bridge and DAW port declare the same structs (medium)

`MasterChain`, `TrackFX`, `TrackMix`, `FXSlot` and `PlaceTarget` are the same in `internal/bridge` and `internal/dawport/roles.go` (`MasterChain`: `internal/bridge/masterchain.go:38`, `roles.go:126`); `Place` and `StackMove` differ by one renamed field; five more request and result types are converted by hand in `internal/dawport/reaper/`. Three tables must change together for a command: `experimentalCommands` (`internal/bridge/actions.go`), `commandCapability` (`internal/dawport/reaper/reaper.go`) and `eventSpecs` (`internal/bridge/wire.go:39`); `stack_takes` is in the first two at `actions.go:100` and `reaper.go:147`. Go has four GUID normalizers (`internal/bridge/actions.go:382`, `D/tracks_live.go:198`, `D/bindings_daw_split.go:96`, `internal/passagetakes/stack.go:339`). Principle 3 promises promotion is "two small edits". **Fix:** dawport owns the types; one table. **Effort:** M.

### HOST-12 Lua helpers copied per module (medium)

In `integrations/reaper/narration_*.lua`, `normalize_guid` is defined in 14 modules, `find_item` in six, `item_guid` in seven, `take_guid` in five, `track_guid` in three, `find_track` in six, `find_cuts` three times line for line, and `CUTS_KEY` and `EDGE_TOLERANCE` three or four times. `narration_bridge_core.lua` exports `encode`, `decode`, `split`, `with_descendants` and others, but none of these; `reaper_common_core.lua` defines `file_exists` and `dirname` again with different `dirname` behaviour. **Fix:** move the helpers into the core module; the harness covers the commands that use them. **Effort:** S, mechanical.

### HOST-13 Judgement mirrored in Lua and Go (medium)

`PICKUP_TOLERANCE 0.15` (`narration_pickups.lua:18`) equals `internal/pickuplist/pickuplist.go:63`; `POSITION_TOLERANCE 0.05` (`narration_takes.lua:181`) equals `internal/passagetakes/stack.go:29`; `REGION_TOLERANCE 0.01` equals `D/chapterregions.go:35`; the level curve (`narration_levels.lua`) mirrors `internal/dawport/roles.go:924`; stack planning in Lua (`narration_takes.lua:486,674`) mirrors `internal/passagetakes/stack.go`; chapter-folder lift planning is judgement in Lua (`narration_track_create.lua:227,281`) with Go only relaying. Principle 10 puts thresholds and judgement in Go. Comments cite the Lua value; no test ties the two. **Fix:** send the tolerance in the request, or one table checked by a test. **Effort:** S per value.

### HOST-14 The chapter has no Go type (medium)

`manuscript.json` is built from `map[string]any` (`internal/manuscript/service.go:635`, `internal/manuscript/reader.go:298`); the root package has about 695 `map[string]any` uses and 48 inline `encodeBinding(map...)` sites. Go and Python (`libs/python/narration_common/manuscript.py:35`) read the file with no shared definition and no file golden (the 20 `manuscript-*.json` goldens are binding answers, `docs/reference/data-files.md:52`). The same facts have two wire shapes: `ChapterTrackMapList` and `TracksDiscover` return maps, `ChapterTrackLinks` and `TracksList` return structs. Principle 9. **Fix:** a typed `Chapter`; a file golden the Python tests read; convert the two map bindings (their goldens exist). **Effort:** M to L.

### HOST-15 Sidecars re-implement `narration_common` (low to medium)

`SAMPLE_RATE = 16000` lives in `narration_common/ports/capture.py:29` and is redefined in `sidecars/transcript-compare/core/compare.py:65`, `coverage_chunks.py:39` and `sidecars/manuscript-teleprompter/core/locate.py:35`, `live_asr.py:138`. The PyAV mono 16 kHz decode is written four times (`compare.py:143`, `locate.py:51`, `live_asr.py:446`, `capture_dshow.py:53`); atomic write five times (only `narration_common/progress.py` retries on Windows); the narration-chapter filter three times; two `TAG|json` line builders emit different bytes. `narration_common/ui_bridge.py` has no production importer (only `libs/python/tests/test_ui_bridge_and_config.py`); the Go bridge owns that protocol. The teleprompter uses neither `narration_common.config` nor `progress`. **Fix:** move each into `narration_common`; delete `ui_bridge.py`. **Effort:** S to M.

### HOST-16 Payloads with no host-side golden (low to medium)

`TranscriptHints` and `TranscriptSuggestHints` (`D/bindings.go:834,859`) and `GuideCreate` (`D/bindings.go:140-149`) answer inline maps with no golden; the words cache that Python writes (`coverage_mode.py`) and Go reads (`internal/evidence/cache.go`) has unit tests only. The baseline is good: 555 goldens, none unreferenced by the UI. **Fix:** a golden each. **Effort:** S.

### HOST-17 One package holds the host (low to medium)

The root package has 793 `Host` methods, 189 non-test files and 32,296 lines (`app.go` 2,421, `bindings.go` 995), and imports 104 `internal/*` packages. `.golangci.yml` has three `depguard` rules (no network outside the download flow, analyzers do not write, the script tracker reads engine events only) and none between layers, so a store imports analyzers (HOST-08). Fan-in: `persist` 51, `brand` 44, `port` 20, `dawport` 19, `tracks` 17. **Fix:** `go-package-split`; add a layering rule. **Effort:** L, incremental.

### HOST-18 Small write pairs (low)

`ManuscriptSetChapterKind` writes the kind and then clears links (`D/chapterkind.go:23-47`); a failure leaves the kind changed, and its comment says asking again clears them, so this is a documented choice. `hideOtherTakes` writes `keeper.json` then `hidden.json` (`internal/recording/keeper.go:132-155`), and `writeSidecar` (`keeper.go:45`) is a private temporary-name-and-rename, not `persist.WriteFile`.

### Not covered by A2

Audacity adapter internals, `coverage.NewSignalProvider` use at press time, read cost in `retakelanes` and `passagetakes`, the read side of `chapterTrackCreates.made`, the Python unit tests, Windows-only files, and a full read of `internal/tracks/parse.go`. Cost claims come from reading code; nothing was run or measured.
