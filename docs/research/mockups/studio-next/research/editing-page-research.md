# Editing page research

**Evidence caveat.** WebFetch was blocked (egress proxy) for reaper.fm, help.acx.com, manual.audacityteam.org. Only WebSearch snippets were available. Items marked [V] were confirmed in a search snippet. Items marked [K] come from my own knowledge of REAPER/ReaScript and must be verified against the live API doc (<https://reaper.fm/sdk/reascript/reascripthelp.html>) before design is locked. Items marked [A] are assumptions or proposals. Nothing here was read from the app repo.

Sources seen:
- ACX requirements (via forum/spec-checker snippets, not help.acx.com): <https://www.bookwriter.vip/acx-audio-spec-checker> , <https://forum.audacityteam.org/t/what-to-apply-to-meet-acx-check/51063> , <https://www.andrewnoske.com/wiki/Audio_Creation_Exchange>
- REAPER: <https://www.reaper.fm/guides/REAPER%20Quick%20Start.pdf> , <https://reaper.blog/2012/06/editing-audio-items-in-reaper/> , <https://reaper.fm/sdk/reascript/reascripthelp.html> (listed in search, not fetched), <https://python-reapy.readthedocs.io/en/stable/api_guide.html>
- iZotope RX: <https://s3.amazonaws.com/izotopedownloads/docs/rx8/en/rx-overview/index.html>
- Descript: <https://help.descript.com/script-editing/filler-words> , <https://help.descript.com/descript-tour/sound-good-tools>
- Audacity punch and roll: <https://support.audacityteam.org/au4/manual/manual-index/punch-and-roll-recording>
- Breath removal practice: <https://forum.librivox.org/viewtopic.php?p=2196842> , <https://community.adobe.com/t5/audition-discussions/how-do-i-remove-breaths-from-long-recordings-to-save-time/m-p/10447067/highlight/true>

---

## (A) What narrators do in the edit pass, in order

Time costs are rule-of-thumb figures from narrator community norms [K/A, not from a cited source]. Typical self-edit is 2-4 hours of edit per finished hour (PFH) of audio; a 50k-word book is ~5.5 finished hours, so 11-22 hours editing. Breaths/gaps and take cleanup are the bulk.

| # | Step | What happens | Rough cost per finished hour |
|---|---|---|---|
| 1 | Take selection / de-duplication | Narrator restarts lines ("stop, back up, re-read"). Delete the false starts, keep the last good take. Mark misreads for pickups. | 30-60 min |
| 2 | Proof listen (follow script) | Listen at 1x-1.5x with text; mark misreads, skips, wrong words, mouth noise. Often done by a second person. This is today's Proof page. | 1-1.5 h (real time) |
| 3 | Cut and splice | Remove marked noises, coughs, stumbles; join with crossfades. | 30-45 min |
| 4 | Gap / breath pass | Shorten long pauses, trim dead air, lower or remove loud breaths (not all: fully removed breaths sound unnatural). Done manually, or by threshold tools. Manual is the main time sink on long books. Sources: LibriVox and Audition forum threads above. | 30-60 min |
| 5 | Click / plosive / sibilance fixes | Mouth de-click, de-plosive (high-pass on the pop), de-ess. Mostly an automated plugin, plus spot-fix by hand. | 15-30 min |
| 6 | Noise reduction / room tone | Profile-based or adaptive denoise at light settings; paste room tone into gaps so silence is consistent (ACX needs room tone, see below). | 10-20 min |
| 7 | Pickups inserted | Re-record lines in the same room/mic position, drop in, match level/EQ, crossfade. | 15-30 min |
| 8 | Chapter processing chain (the "mastering" step, other page) | EQ, compression, limiter, loudness to ACX. | 10 min (template) |
| 9 | QC against ACX | RMS, peak, noise floor, room tone head/tail. Fix and re-run. | 10-20 min |

ACX numbers seen in snippets [V, secondary sources]: RMS between -23 and -18 dB; peak at most -3 dB; noise floor at most -60 dB RMS; 0.5-1 s room tone at head and 1-5 s at tail; MP3 192 kbps CBR 44.1 kHz; one chapter per file, under 120 min; free of plosives, mic pops, mouse clicks, excessive mouth noise and outtakes. Confirm on help.acx.com (blocked here).

Implication: the Editing page should be built around steps 1, 3, 4, 5, 6 and 7. Steps 8-9 stay in Master & QC.

---

## (B) Operation catalogue

Legend. DAW = can be done non-destructively through a REAPER bridge. APP = needs the app's own audio processing (analysis in the app, optional render to a new file). Function names are from ReaScript; [K] = not re-verified this session.

### 1. Takes

| Operation | Detect / fix | Route | REAPER API [K] |
|---|---|---|---|
| List takes of an item | Detect | DAW | `CountMediaItems`/`GetMediaItem`, `CountTakes` or `GetMediaItemNumTakes`, `GetMediaItemTake`/`GetTake`, `GetActiveTake`, `GetSetMediaItemTakeInfo_String(take,"P_NAME")`, `GetMediaItemTakeInfo_Value` (`D_STARTOFFS`, `D_PLAYRATE`) |
| Keep this take (make active) | Fix | DAW | `SetActiveTake(take)` then `UpdateArrange` |
| Delete unused takes ("crop to active take") | Fix, destructive-ish but undoable | DAW | `Main_OnCommand` with action "Item: Crop to active take" (command id to look up by name via `NamedCommandLookup` or action list) |
| Take comparison audio (A/B between takes) | Detect | DAW (set active + play via `OnPlayButton`/`SetEditCurPos`) or APP (decode via accessor) | `CreateTakeAudioAccessor`, `GetAudioAccessorSamples` |
| Group the takes of one passage | Detect | APP, matching on transcript/alignment [A]. REAPER stacks takes in one item only if recorded in "takes" record mode or user used "Item: Explode / Implode". When narrators restart, REAPER's default record mode makes new items, not takes | `Main_OnCommand` for "Item: Implode items across tracks into takes" / "Implode items on same track into takes" [K, names to verify] |
| Take lanes view | Display only | DAW | Track "Show take lanes" is a track option (`I_FREEMODE` on track, fixed lanes in v7) [K, v7 fixed lanes: `I_FIXEDLANES`, `C_LANEPLAYS` item property] |
| Audacity 3 | Takes arrive as separate clips on a track, no take stack | Not supported yet. Design the data model so a "take" is a clip region, not only a REAPER take [A] |

### 2. Gaps and breaths

| Operation | Detect / fix | Route | API |
|---|---|---|---|
| Find silences longer than N ms | Detect | APP (analysis from rendered/peaks) or DAW via `GetMediaItemTake_Peaks` / accessor | `GetMediaItemTake_Peaks`, `GetAudioAccessorSamples` |
| Dead-air shorten (cap pause to N ms, keep a floor so it breathes) | Fix | DAW: `SplitMediaItem` at silence edges, delete or move, ripple, set fades. Equivalent to REAPER's Dynamic split / Strip silence (dialog is UI-only; scripting uses `Main_OnCommand` for "Item: Dynamic split items..." which opens a dialog [K]; do own split instead) | `SplitMediaItem`, `SetMediaItemInfo_Value` (`D_POSITION`, `D_LENGTH`), `DeleteTrackMediaItem`, `D_FADEINLEN`/`D_FADEOUTLEN` |
| Breath detect (low-level broadband noise just before a phrase onset, 100-600 ms, spectral tilt) | Detect | APP [A: heuristics, expect false positives; user must confirm] |
| Breath reduce by N dB (not remove) | Fix | DAW: split around breath, lower item volume `D_VOL`, or a take volume envelope (`GetTakeEnvelopeByName("Volume")`, `InsertEnvelopePointEx`) | as listed |
| Breath remove | Fix | DAW: replace with room tone item | `AddMediaItemToTrack`, `AddTakeToMediaItem`, `SetMediaItemTake_Source` |
| Room tone fill | Fix | DAW: loop a captured room-tone clip into the cut. APP: just records the room tone clip at booth | same |

### 3. Clicks, pops, plosives

| Operation | Route | Notes |
|---|---|---|
| Detect (click = short HF transient; plosive = LF burst <120 Hz at word start; mouth noise = clicks in gaps/near words) | APP analysis | Flag regions; user reviews |
| Mouth de-click / de-plosive / de-ess | DAW if the user has a plugin (take FX via `TakeFX_AddByName`, params via `TakeFX_SetParam`/`TakeFX_SetParamNormalized`, `TakeFX_SetEnabled`); otherwise APP DSP then render a new take [A]. Built-in REAPER: ReaEQ high-pass, ReaXcomp, JS: "de-esser" [K, names to verify] |
| Spot repair of a single click | APP: interpolate over 2-5 ms, write a replacement take [A]. Spectral repair is RX-only |

### 4. Noise and room tone

| Operation | Route |
|---|---|
| Measure noise floor, per chapter and in room tone | APP (needed for ACX anyway; Master & QC probably already measures) |
| Denoise (ReaFIR-style subtract, or adaptive) | DAW via `TakeFX_AddByName("ReaFIR")` [K] on the item/take; or APP DSP render |
| Room tone consistency check at head/tail | APP |

### 5. Level and dynamics (take- or region-scale, not mastering)

| Operation | Route | API |
|---|---|---|
| Even out loud/quiet lines (clip gain) | DAW non-destructive | split at line/sentence, `D_VOL` per item, or volume envelope on take |
| Normalise a pickup to match neighbours | DAW | `D_VOL`; measure in APP |
| Per-take EQ match | DAW take FX (ReaEQ) | `TakeFX_*` |

### 6. Pitch and character-voice effects

| Operation | Route | API |
|---|---|---|
| Pitch shift (robot, giant, child) on a few lines | DAW non-destructive: take property `D_PITCH` (semitones) and `B_PPITCH` (preserve pitch with rate change) with `I_PITCHMODE` (algorithm); or take FX (JS pitch / ReaPitch) | `SetMediaItemTakeInfo_Value(take,"D_PITCH",x)` [K] |
| Robot, radio, telephone, reverb "in a cave" | DAW take FX or item FX chain on a split section | `TakeFX_AddByName`; FX chain file add `TakeFX_AddByName("FXADD:...")` or chain template [K] |
| Level of "item FX" vs "take FX" vs "track FX" | In REAPER, take FX lives with the take, so switching active take switches the FX; item-level FX chain is a REAPER 7 feature with "Item FX" [K; the item-FX search snippet only confirmed a view option]. Track FX applies to everything on the track | Recommend: apply character effects as take FX on a split-out item, never as track FX |

### 7. Crossfades and joins

| Operation | Route | API |
|---|---|---|
| Add 5-30 ms fades at every cut | DAW | `D_FADEINLEN`, `D_FADEOUTLEN`, `D_FADEINSHAPE`, `C_FADEINSHAPE` [K] |
| Overlapping crossfade between adjacent items | DAW (REAPER auto-crossfades overlapping items, option-dependent) | `D_POSITION`/`D_LENGTH` overlap |
| Zero-crossing snap on split | APP computes the position, DAW splits there | accessor to read samples |
| Click-at-join detector | APP |

### 8. Bookkeeping (needed for safe edits)

- One undo step per page action: `Undo_BeginBlock2` / `Undo_EndBlock2`; `PreventUIRefresh` around bulk edits [K].
- Store app metadata in the project: `SetProjExtState`/`GetProjExtState`; use markers/regions for coverage and take-group ids: `AddProjectMarker2`, `EnumProjectMarkers3`, `SetProjectMarker3` [K].
- Item ids: use `GetSetMediaItemInfo_String(item,"GUID")` since indices move [K].

**What needs APP processing, in short:** detection of breaths/clicks/plosives, take grouping by transcript, noise floor, room-tone measurements, spot repair, and every operation for users with no DAW (built-in recorder).

---

## (C) How comparable tools present takes and "how much has an effect"

| Tool | Takes | Effect coverage | Narrator takeaway |
|---|---|---|---|
| REAPER | Takes stack in one item; "show all takes in lanes" shows them as rows; active take plays; switch with a click or hotkey. Take FX travel with the take. Source: Quick Start guide above, reaper.blog editing article | None built in; FX shown as an "FX" badge on items (view option) | Lanes are good for comparison; no coverage view, which is our gap |
| Audacity (3.x) | Punch and roll leaves a clip boundary at each splice; there are no take lanes | Effects apply to a selection destructively; only visible via history | Easy mental model, little structure; need to infer takes from clip boundaries [A] |
| Adobe Audition | Multitrack takes via record-over, or "Waveform Editor" selection edits; Effects Rack per track/clip | Clip FX shown by "fx" badge on clips | Clip-level FX badge is the useful part |
| iZotope RX | No takes; Module Chain and Batch Processing apply a preset to selections or whole files; Spectral Repair is paint-and-preview | Edits are selections in a spectrogram; history list | Preview-before-apply on a selection, and presets for chain, are the patterns to copy |
| Descript | Text-based: select words, delete; filler removal can run on a selected range or all; "Studio Sound" is an on/off per clip with intensity slider (help.descript.com) | Per-clip effect shown as a coloured text mark | Selecting by transcript is the easiest "which line" interface; but only if we have alignment [A] |
| Hindenburg | Clip-based, with automatic loudness. [K, not sourced] | Per-clip FX in inspector | Simplicity: few controls |
| Studio One / Sound Forge / Auphonic | Studio One: layered takes lane with "listen to takes" and comping by range selection [K]. Sound Forge: destructive, offline FX with preview. Auphonic: whole-file only, with level/denoise "amount" sliders and a before/after | Auphonic is the opposite of what we want (whole-file) but its before/after is a good model | Comping by dragging a range across takes is the strongest take UX |

**Recommended approach for ours**
1. Take view: one row per passage (line or paragraph, from the script), with takes as horizontal lanes beneath, each a mini-waveform with duration, a play button and a "Keep" radio. The kept take is highlighted; others dim. Auto-guess the "last take wins" default, and make the guess visible [A].
2. Coverage: a **strip under the chapter waveform with one cell per second or per script line** coloured by the number of effects stacked there (none, 1, 2+). Plus a single number: "Effects on 4.2% of chapter (1 min 12 s of 28 min)". Cap configurable (default [A] 10%) with a warning state, not a block.
3. Heat strip legend uses lightness and an icon/label, not colour alone (accessibility).
4. Clicking a heat cell selects the FX region in the inspector.

---

## (D) Proposed page design (plain text)

Layout mirrors existing chapter-bar / waveform + overview strip / notes list / inspector pages (Proof is my assumption of what that looks like; I did not read it).

```text
+--------------------------------------------------------------------------------+
| Chapter bar:  [< Ch 7 "The Bridge" >]  28:14   Edits 42   Effects 4.2% [meter] |
|               Source: REAPER (connected)   [Undo in REAPER]                    |
+--------------------------------------------------------------------------------+
| Tabs:  Takes | Cleanup | Effects                                               |
+--------------------------------------------------------------------------------+
| WAVEFORM (zoomable)                                                            |
|  ~~~||~~|||~~~~~||~~~~~~|~~~||||~~~~~~~~~~~~~~~~|~~~|||~~~~~~~~~~~~~~~~~~~~~    |
|  markers:  ^take-group  .click  b breath  p plosive  [fx region]               |
| OVERVIEW STRIP (whole chapter)                                                 |
|  [   ][ x ][    ][ y ][                  ][ z ]    <- viewport box             |
| EFFECTS COVERAGE STRIP (one cell per script line)                              |
|  [_][_][1][1][_][_][_][2][1][_][_]  legend: none / 1 effect / 2+  cap 10%      |
+---------------------------------------+----------------------------------------+
| LIST (changes by tab)                 | INSPECTOR (selected row)               |
| Takes tab:                            | Passage 12: "She crossed the..."       |
|  12  "She crossed the..."  3 takes    |  Take 1  0:04.2  [play] ( ) keep       |
|  13  "He did not..."       1 take     |  Take 2  0:03.9  [play] ( ) keep       |
|  14  "The river..."        2 takes !  |  Take 3  0:04.1  [play] (*) keep       |
| Cleanup tab:                          |  [A/B Take 2 vs 3]  [Delete others]    |
|  [Gaps >1.2 s: 31] [Breaths: 188]     |  Compare in context: -2 s / +2 s       |
|  [Clicks: 14] [Plosives: 6]           |  Pickup needed? [Send to Pickups]      |
|  row: 0:12:03  Breath  -6 dB  [x]     |                                        |
| Effects tab:                          | Effect region: lines 41-44 (0:56 long) |
|  FX region list, each with scope tag  |  Preset: [Robot voice v]  Mix 100%     |
|  Take / Item / Track                  |  Scope: ( ) this take (*) these lines  |
|  41-44 Robot voice  0:56  take        |   ( ) whole track [warn: whole chapter]|
+---------------------------------------+----------------------------------------+
| Bottom bar: [Preview] [Apply to 188 selected] [Revert]  Preview plays 2 s pre-roll |
+--------------------------------------------------------------------------------+
```

**Simple vs advanced**
- Simple defaults: "Keep last take" button per chapter; Cleanup presets "Light / Standard / Heavy" (threshold values hidden), e.g. gap cap 0.8 s, breath reduce -8 dB, floor 0.3 s [A: starting values to tune with real recordings]; effects: pick a preset (Robot, Radio, Giant, Whisper [A]) and a line range.
- Advanced (collapsed): thresholds in dB/ms, breath detector sensitivity, fade lengths, crossfade shape, pitch algorithm, FX chain editor (opens REAPER's own FX window rather than rebuild it).

**Safeguards**
- Every list row is a proposal; nothing applies until "Apply". Per-row checkbox, A/B toggle (original vs edited, level-matched), pre-roll preview.
- Undo: one REAPER undo block per Apply (`Undo_BeginBlock2`...). Show "Undo in REAPER (Ctrl+Z)" with the block name. For recorder users, app keeps its own undo stack [A].
- Never delete audio in the DAW without a copy: prefer "mute / set inactive take / trim" over delete; "Delete unused takes" is a separate, confirmed action.
- Effects coverage meter in the chapter bar; amber at cap, red at 2x cap; cap per project setting. Applying an effect that would exceed the cap shows "this takes coverage from 4.2% to 11.8%" and requires confirm. Whole-track scope is always labelled "whole chapter" with 100% in the meter.
- Effects are only ever created as take/item FX on a split section, never on the track, unless the user chooses track scope explicitly.

**Empty / error states**
- REAPER not running (bridge down): "REAPER is not connected. Open your project in REAPER, or work from the last saved snapshot (read-only)." Buttons: [Retry] [Open project]. Detect/analysis tabs still work from rendered audio in read-only; Apply disabled with the reason.
- REAPER connected, wrong or no project: "Open the project for <book>".
- Takes tab with one take per passage: "No restarts found in this chapter." (a good state, not an error).
- Built-in recorder user (no DAW): same page, same tabs; "Source: built-in recorder". Takes come from the recorder's take list; Apply writes a new edited version and keeps the original; effects are limited to the app's own preset set; the coverage meter works the same. Show a one-line note: "Using REAPER unlocks per-take FX chains and your own plugins."
- Audacity project: "Audacity is not supported yet" with a list of what would work [A].

---

## (E) Data model sketch

```text
Passage   { id, chapterId, scriptRange (line ids), kind: "line|paragraph" }
Take      { id, passageId, source: "reaper-take|reaper-item|recorder|audacity-clip",
            dawRef: { itemGuid, takeGuid?, takeIndex? } | { file, startMs, endMs },
            durationMs, createdAt, label, keep: bool, score? [A] }
Edit      { id, chapterId, kind: "gap|breath|click|plosive|noise|level|join",
            startMs, endMs, proposedAction: {type, params}, status: "proposed|applied|dismissed",
            appliedUndoName?, confidence }
FxRegion  { id, chapterId, startMs, endMs, scope: "take|item|track", targetRef,
            presetId, fxGuids[], mix, enabledInDaw: bool }
Preset    { id, name, kind: "cleanup|character", params | fxChainRef, builtIn: bool }
EditorSettings { fxCoverageCapPct, gapCapMs, breathReduceDb, fadeMs, ... }
```

**Where it lives**
- DAW project (source of truth for audio state): which take is active; item splits, fades, volumes; FX instances and their params; undo history. Also a small `ProjExtState` blob with Take-group ids and FxRegion ids so a reopened project re-links (`SetProjExtState`) [A].
- App (project folder, so it survives DAW switching): Passages and alignment to script; Edit proposals and their dismissed state; presets; settings; cached analysis (peaks, noise floor); audit log of applied operations.
- Derived on demand, never stored: effects coverage % (computed by reading FX regions from the DAW each refresh, so the meter cannot lie after the user edits in REAPER).

---

## (F) Open questions for the owner (ranked) and risks

1. Is "Keep one take" destructive? Default proposed: no (set active take / mute), with a separate confirmed "Delete unused takes". Decide.
2. How do takes actually arrive from REAPER today: stacked in one item, or separate items from restart-recording? This decides whether the app must detect and implode them. Ask which record mode the bridge sets.
3. Effects coverage cap: default value, per-chapter or per-book, warn or block? And does a track-level FX count as 100%?
4. Which character effects must ship in v1 (pitch only, or a preset list)? Pitch via take property (`D_PITCH`) is the cheapest [K].
5. Does the app do its own DSP (breath/click repair, denoise) or only drive REAPER plugins? Own DSP means a testing and quality burden; ReaFIR/JS plugins are free but limit the recorder-only users.
6. Recorder-only users: edits non-destructive via sidecar edit list, or render a new file?
7. Is there a script-to-audio alignment (forced alignment or speech-to-text) available? Without it, take grouping falls back to timing and silence heuristics, and "select by line" is weaker.
8. Where does breath/gap cleanup stop and Proof's "Clean up" menu go: removed from Proof, or kept as a shortcut into Editing?
9. Audacity timing: design for clip-based takes now.

**Risks**
- Auto-breath removal sounding unnatural or clipping word onsets (mitigate: reduce, don't remove, by default; preview; confidence threshold).
- Index drift: item indices change when the user edits in REAPER; use GUIDs.
- User edits in REAPER while the page is open: stale state; re-read on focus and on the bridge's change event.
- ReaScript API names above are from memory ([K]); verify each before implementing. Behaviours that depend on REAPER version (v7 fixed lanes, item FX) need a minimum-version check.
- Plugin availability: third-party take FX may be missing on the user's machine; fall back to stock ReaPlugs and show a clear error.
- Heavy analysis on 100k-word books: run on rendered/peak data in a background worker and cache.
- Coverage meter wrong if FX are added outside the app: compute from the DAW, not from the app's own list.
