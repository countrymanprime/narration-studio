# Editing page: FX chain research and best-in-class proposal

Tags: **[V]** verified from a source I read this session (named inline). **[K]** my knowledge, not re-checked. **[A]** assumption or proposal.

**Evidence caveat.** The sandbox blocks most hosts (reaper.fm, cockos.com, musehub.com, vendor help sites). What I could actually read in full:
- The ReaScript API reference (Ultraschall's rendered copy, same text REAPER generates): <https://github.com/Ultraschall/ultraschall-lua-api-for-reaper/blob/master/ultraschall_api/Documentation/Reaper_Api_Documentation.html> (read via raw.githubusercontent.com).
- The repo itself (`/home/user/narration-utils`).
- iZotope RX 8 help: <https://s3.amazonaws.com/izotopedownloads/docs/rx8/en/module-chain/index.html> and <https://s3.amazonaws.com/izotopedownloads/docs/rx8/en/module-controls/index.html>.
- VST3 SDK licence (MIT), JUCE licence, CLAP README on GitHub.

Everything else is from web-search snippets. Those are labelled "[V, snippet]" and are weaker than a full read. Vendor UI behaviour for Logic, Pro Tools, Studio One, FL, Hindenburg, Waves and Slate is mostly [K].

**Two findings to read first**
1. **The owner's new request reverses a recorded decision.** ADR 0234 (`/home/user/narration-utils/docs/adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md`) (repo, accepted 2026-09-25) says: *chains go only on tracks and the master track; takes and items get single plug-ins, one at a time, never a chain.* The owner now wants to see FX on master, track and take items and to apply saved chains. Applying a chain to a take is not allowed today. This needs an explicit owner ruling and a new ADR (see risks, #1).
2. **The bridge already covers more than the Studio mock assumes.** `list_fx_chains`, `apply_fx_chain` (track or `master`), `list_fx`, `add_take_fx`, `set_active_take`, `pick_retake_lane` and `master_chain_read` exist, all experimental per ADR 0230 [V, repo]. The big gap is READ: nothing reports the FX on a track, on takes, or input FX, with enabled/offline state, apart from `master_chain_read`, which prints names plus enabled for every track and the master.

---

## A. REAPER FX architecture and how to read and write it

### A1. The five places FX live

| Place | What it is | Read | Write | Notes |
|---|---|---|---|---|
| **Track FX chain** | Normal insert chain, runs in order, after items/take FX | `TrackFX_GetCount`, `TrackFX_GetFXName`, `TrackFX_GetEnabled`, `TrackFX_GetOffline`, `TrackFX_GetFXGUID`, `TrackFX_GetNamedConfigParm` | `TrackFX_AddByName(track,name,false,-1)`, `TrackFX_Delete`, `TrackFX_SetEnabled`, `TrackFX_SetOffline`, `TrackFX_CopyToTrack(src,i,dest,j,is_move)` (reorder if src=dest) | [V] all in API ref. |
| **Master track chain** | Same calls on `GetMasterTrack(0)`; it is not in `CountTracks`/`GetTrack` | same | same | [V] repo: `apply_fx_chain` accepts `master`; `master_chain_read` lists it. |
| **Input FX (record FX)** | Per track, runs on the incoming signal and is printed into the recording | `TrackFX_GetRecCount`; address FX with index `0x1000000 + n` in all `TrackFX_*` calls | `TrackFX_AddByName(track,name,true,-1)` for rec FX | [V] API ref: "record input FX... use FX indices [0x1000000..0x1000000+n)". Not needed for editing; show read-only or hide. |
| **Monitoring FX** | Global chain, heard by the narrator but not rendered. It is the *master track's input FX* | `TrackFX_GetRecCount(master)`; `0x1000000+n` | `TrackFX_AddByName(master,name,true,-1)` | [V] API ref: "monitoring FX are on master track". Show as a separate "Monitoring (not rendered)" row so the page never claims it is in the exported audio. |
| **Take FX** | Per take of an item. There is no `ItemFX_*` family in the API | `TakeFX_GetCount`, `TakeFX_GetFXName`, `TakeFX_GetEnabled`, `TakeFX_GetOffline`, `TakeFX_GetFXGUID`, `TakeFX_GetNamedConfigParm` | `TakeFX_AddByName(take,name,-1)`, `TakeFX_Delete`, `TakeFX_SetEnabled`, `TakeFX_SetOffline`, `TakeFX_CopyToTake`, `TrackFX_CopyToTake` / `TakeFX_CopyToTrack` | [V] function names in API ref list (`TakeFX_*` block). |

- **"Item FX" is the active take's chain.** [K] In the REAPER UI the item's FX button opens the chain of the *active* take. The API has only `TakeFX_*`. One web-search answer claimed a separate item-level chain that persists across take switches; I could not confirm it and the API says otherwise. Treat as unverified and check in REAPER (spike).
- **Signal order** [K]: take FX, then item/volume/pan/fades, then track FX, then track send/fader, then master FX. Verify in REAPER before drawing a flow strip that claims it. Take FX being *pre-fade/pre-track* is the reason a "robot voice" on one line is a take-level concern.
- **Active take changes the audible take FX** [K]. Take FX travel with the take. That is what makes "choose between takes" interact with FX: two takes of the same line can have different FX.
- **Containers (v7.06+)** [V]: FX can sit inside an FX container (`fx_type` Container; `container_count`, `container_item.X`, `parent_container` via `TrackFX_GetNamedConfigParm`, v7.06+). A chain read that ignores containers will miss FX or mis-index them. `EnumInstalledFX` returns index 1 = "Container" and index 0 = "Video processor" [V].
- **FX addressing:** indices can have `0x2000000` added for container addressing [V]. `0x1000000` for input FX [V].

### A2. Read-side calls the Editing page needs

| Need | Call | Status |
|---|---|---|
| Name, type, original name, vendor/ident | `TrackFX_GetFXName`, `TrackFX_GetNamedConfigParm(…,"fx_type" / "fx_ident" / "fx_name")` | [V] `fx_type : type string`, `fx_ident : type-specific identifier`, `fx_name` listed under supported read values |
| Latency per plug-in and chain | named parm `pdc`; chain: `chain_pdc_reporting`, `chain_pdc_actual` | [V] `chain_pdc_reporting` "always valid", `chain_pdc_actual` "only valid after playback has commenced" |
| Bypassed vs offline | `TrackFX_GetEnabled`, `TrackFX_GetOffline`, take equivalents | [V]; offline = unloaded, not just bypassed. A plug-in that failed to load is shown offline/missing [K] |
| Current preset | `TrackFX_GetPreset(track,fx)` | [V] returns the preset name, or the full path of a VST3 factory preset (.vstpreset), and **returns false when parameters no longer match the preset** (i.e. "modified" flag for free) |
| Parameters | `TrackFX_GetNumParams`, `…GetParamName`, `…GetParamNormalized`, `…FormatParamValue` | [V] names in API list |
| Automation / envelopes on FX params | `GetFXEnvelope(track,fx,param,create)`, `TakeFX_GetEnvelope` | [V] `create=false` reads without creating; `create=true` creates (and un-bypasses a bypassed envelope), so read with `false` |
| GUID for stable ID | `TrackFX_GetFXGUID`, `TakeFX_GetFXGUID` | [V] in API list. Use these; FX index drifts when anything is added |
| Installed plug-ins | `EnumInstalledFX(i)` → name, ident (path+filename of the plug-in) | [V] |
| Saved chains | files `<GetResourcePath()>/FXChains/**/*.RfxChain` via `EnumerateFiles`/`EnumerateSubdirectories` | [V] repo `list_fx_chains`; cache must be cleared with index `-1` first (repo notes REAPER 7.80 caches listings) |
| Resource path | `GetResourcePath()` | [V] repo |

### A3. Write-side

- **Add a single FX:** `TrackFX_AddByName(track, fxname, recFX, instantiate)` and `TakeFX_AddByName(take, fxname, instantiate)`. Negative `instantiate` always creates a new instance, 0 queries, positive adds only if absent. Returns -1 on failure [V].
- **Add a saved chain by file:** pass the full `.RfxChain` path as `fxname`. The API text for **TakeFX_AddByName** says verbatim "This allows also adding .FXChain-files. Just provide the full path+filename" [V]. So the API documents chain files on takes as well as tracks. The **repo's EP0 spike deliberately did not test the take case** because ADR 0234 forbade it, and the track/master case (row A8) is the first evidence for the path load [V, repo `docs/research/edit-and-proof-spike-ep0.md`]. Whether a multi-FX chain returns the first new index, and how a missing plug-in inside a chain is reported, is **unknown** until a real run [V, repo doc says so].
- **Reorder / copy / move:** `TrackFX_CopyToTrack` (src=dest to reorder), `TakeFX_CopyToTake`, `TrackFX_CopyToTake`, `TakeFX_CopyToTrack` [V].
- **Bypass / offline:** `*_SetEnabled`, `*_SetOffline` [V].
- **Presets:** `TrackFX_SetPreset`, `TrackFX_SetPresetByIndex`, `TrackFX_NavigatePresets` [V names]. Preset names are per plug-in.
- **Save a chain:** no function for it in the API list I read [V by absence]. Options: (a) chunk route: `GetTrackStateChunk`/`SetTrackStateChunk` with `<FXCHAIN>` text, which the repo's spike used to produce chain text from REAPER's own output [V, repo]; (b) let the user press "Save FX chain" in REAPER. Chunk edits can drop unknown fields and reset undo state [V, repo research doc]; prefer API calls.
- **Undo:** wrap each Apply in `Undo_BeginBlock2`/`Undo_EndBlock2`; the repo already does this with labels like "Narration Utils: apply FX chain <name> to <track>" [V, repo ADR 0234]. `PreventUIRefresh` for bulk edits [K].
- **Track templates (.RTrackTemplate):** `Main_openProject("….RTrackTemplate")` or `InsertTrackAtIndex` + `SetTrackStateChunk` [V, repo `reaper-automation-surface.md`]. A template carries FX *and* routing, so it is the wrong unit for "just the voice FX". Prefer `.RfxChain`.
- **Render with FX / apply FX to items:** action 40209 "apply track/take FX to items" [V, repo]; repo's `render_with_fx` exists (ADR 0435).

### A4. Gotchas

- **Item index drift:** use item and take GUIDs (`GetSetMediaItemInfo_String(item,"GUID")`), never indices [V, repo already does]. FX index drifts too; carry the FX GUID.
- **FX count changes on a split:** `add_take_fx` splits the item first, then adds the plug-in to the middle piece; the left piece keeps the original GUID [V, repo spike plan]. What happens to take FX already on an item when it is split is a stated open question in the repo spike [V]. **For the take-FX read model: after a split, each piece has its own take with its own FX; verify whether FX are duplicated to both halves** [A, to test].
- **Fixed lanes (v7):** on fixed-lane tracks, comping takes live as separate *items* in lanes, not as takes of one item. Track `C_LANEPLAYS:N` is read/write (0 no, 1 exclusive, 2 plays with others). Item `C_LANEPLAYS` is **read-only**, `I_FIXEDLANE` item lane is read-only [V API ref]. The repo's `pick_retake_lane` already sets the *track's* `C_LANEPLAYS:<lane>` to 1 and never the item's [V, repo]. A "take picker" must model both: stacked takes in one item (`SetActiveTake`) and lanes (`pick_retake_lane`).
- **Take FX vs lanes:** because lane items are separate items, "FX on this take" can be on the item in lane 2 rather than on a take of the lane-1 item. The data model has to say "candidate = item+take".
- **Plug-in missing:** a chain or take can reference a plug-in that is not installed (a collaborator's project). Expect an offline/placeholder slot [K]. Detect by `fx_ident`/name not in `EnumInstalledFX` or `TrackFX_GetOffline` true [A].
- **Cache:** `EnumerateFiles` caching in 7.80, clear with `-1` [V repo].
- **Recording:** repo's `apply_fx_chain` refuses while REAPER records [V repo].
- **Bridge thread:** ReaScript runs on the main thread; heavy walks of every track × every FX (500-FX cap in `master_chain_read`) should be paged [V repo cap; A paging].

### A5. What the repo bridge exposes today vs what to add

Read from `/home/user/narration-utils/integrations/reaper` [V]:

| Exists | Command | Behaviour |
|---|---|---|
| Yes (experimental) | `list_fx_chains` | `.RfxChain` files under FXChains, relative names, ≤500, 4 folders deep |
| Yes | `list_fx` | `EnumInstalledFX` names ≤2000, excludes Container and Video processor |
| Yes | `apply_fx_chain(track|master, name)` | `TrackFX_AddByName` with full path, one undo block, checks FX count grew |
| Yes | `add_take_fx(item, take, srcStart, srcEnd, name)` | splits, adds **one** plug-in to the middle piece, one undo block |
| Yes | `set_active_take`, `pick_retake_lane`, `apply_item_gain`, `create_take` | take/lane selection |
| Partial | `master_chain_read` | events `MASTER_CHAIN_FX(guid, trackName, fxName, enabled)` for every track then master; no take FX, no input FX, no offline, no preset, no FX GUID, no latency, no containers |
| Spike evidence | `spike_ep0_workspace.lua` A8 | track+master chain load, undo points, reject `../reaper.ini` |

**To add** (each needs a harness test first per CLAUDE.md and ADR 0066, plus a Zod schema + golden fixture + `wireContracts.test.ts` row per the wire-contract rule; each is a new REAPER event in `wire.go`):

| New command | Purpose | Notes |
|---|---|---|
| `fx_read(scope)` | Chain snapshot for `master`, a track GUID, or a chapter's items: per FX {fxGuid, index, name, type, ident, enabled, offline, preset, presetModified, pdcSamples, container path} | One event per FX, then a summary; extends `master_chain_read`. Read take FX per take GUID for the chapter's items on the passage's track |
| `fx_read_takes(passage)` | For each candidate take (stacked takes and fixed-lane items): {itemGuid, takeGuid, isActive, lane, plays, fxCount, fx names, bypass} | Feeds take picker with FX badges |
| `fx_set_enabled / fx_set_offline / fx_remove / fx_move` | Bypass, offline, delete, reorder by FX GUID | One undo block each; refuse while recording |
| `fx_set_param` (later) | Macro knobs | `TrackFX_SetParamNormalized`; envelopes need care |
| `apply_take_fx_chain` (**needs owner ruling**) | `TakeFX_AddByName(take, chainPath, -1)` | API documents it [V]; unverified in practice; conflicts with ADR 0234 |
| `fx_installed_info` | Add vendor/format/path to `list_fx` using `ident` | `ident` is path+filename [V] so format is derivable from extension [A] |
| `fx_chain_save` (later) | Save selected FX as `.RfxChain` | No API function [V by absence]; chunk route or ask user to save in REAPER |

---

## B. Plugin hosting and sourcing

### B1. Formats and facts

- **VST3**: Steinberg's VST3 SDK is now **MIT-licensed** ("MIT License, Copyright (c) 2026, Steinberg Media Technologies GmbH") [V: <https://raw.githubusercontent.com/steinbergmedia/vst3sdk/master/LICENSE.txt>]. Older SDKs were dual GPLv3 / proprietary [K]. Default locations: macOS `/Library/Audio/Plug-Ins/VST3` [V snippet, Steinberg help <https://www.steinberg.help/r/vst-plug-in-locations-on-mac-os-x-and-macos>]; Windows `C:\Program Files\Common Files\VST3` [V snippet, FabFilter forum thread <https://prod.fabfilter.com/forum/topic/6284/cubase-cant-find-old-fabfilter-plugin-locations>]; Linux `~/.vst3`, `/usr/lib/vst3` [K].
- **VST2**: legacy; Steinberg stopped licensing new VST2 SDK use in 2018 [K]. Still the most common in user folders. REAPER still loads it [K]. Do not build new on it.
- **CLAP**: open standard, host and plug-in interfaces as C headers; "a plugin binary compiled with CLAP 1.x can be loaded by any other [host]" later versions; has state extension (save/load plug-in state) [V: <https://github.com/free-audio/clap> README, read in full]. REAPER supports CLAP [V: API ref lists `clap_chunk` read/write in `TrackFX_Get/SetNamedConfigParm`]. License MIT [K].
- **AU / AAX**: macOS-only / Pro Tools-only. Out of scope.
- **REAPER state blobs:** `vst_chunk` / `clap_chunk` base64 read/write via named config parm [V]. This means REAPER can export a plug-in's *state* as a blob, which the app can store opaque (not interpret) to re-apply the same settings later [A].

### B2. Who loads a plug-in

| Option | What it means | Cost / risk |
|---|---|---|
| **1. DAW hosts it, app references it** (recommended v1) | App lists installed plug-ins from REAPER (`EnumInstalledFX`), adds by name, REAPER loads and runs them. No plug-in code runs in our process | Our app never touches plug-in binaries, licences or crashes. Depends on REAPER having scanned the plug-in |
| 2. App discovers VST3s itself (filesystem scan of standard folders) | Show "installed but not yet scanned by REAPER" and guide user to REAPER's Rescan | Cheap read-only; no hosting. Folder scan only: **no loading** |
| 3. App hosts plug-ins in-process (JUCE or VST3 SDK) for preview/A-B without REAPER | Needed for the built-in recorder users and for audition outside REAPER | JUCE is **AGPLv3 or commercial** [V: <https://raw.githubusercontent.com/juce-framework/JUCE/master/LICENSE.md>]. Plug-ins crash hosts; sandboxing is the norm for commercial hosts [V snippet: Bitwig crash protection <https://www.bitwig.com/support/technical_support/what-is-plug-in-crash-protection-26/>; Ardour tracker <https://tracker.ardour.org/view.php?id=8223>]. In a Wails/Go + React stack, hosting needs a native sidecar. Large cost |
| 4. Out-of-process host sidecar | One process per plug-in or group, shared-memory audio | Isolation but IPC/memory overhead and latency; still our code to ship and maintain [V snippet, VSL/Ardour threads in the search] |

- **Scanning safely** [V snippet, JUCE forum <https://forum.juce.com/t/plugin-loader-ways-of-handling-plugins-that-crash/50730>]: scan in a separate process, blacklist before load and un-blacklist on success, cache results by path+mtime. REAPER does its own scan and caches it (`reaper-vstplugins64.ini`; "Clear cache and rescan" in Preferences > Plug-ins > VST) [V snippet, Slate support <https://support.slatedigital.com/hc/en-us/articles/115005963308-How-To-Rescan-Plugins-In-Reaper> and Cockos wiki <https://www.cockos.com/wiki/index.php/Preferences_Plugins_VST>]. The ini format is not officially documented [V snippet states this], so do not parse it.
- **Licensing:** most commercial plug-ins are licensed per user and tied to an activation. Loading them is the host's business; redistributing the binary is not allowed. The app must never copy plug-in binaries. [K/A]

### B3. MuseHub

- **What it is** [V snippet]: Muse Group's free desktop hub for MuseScore Studio, Muse Sounds, effects plug-ins and third-party developers' plug-ins (Muse FX effects such as reverb, delay, compressor; partners named in the snippet include Baby Audio, LANDR, Solid State Logic). Sources: <https://www.musehub.com/de-de/app/audacity>, <https://www.audacityteam.org/blog/introducing-musehub>, <https://www.soundonsound.com/news/muse-group-update-muse-hub-audacity>.
- **How plug-ins install** [V snippet]: native VST3 and AU, into each format's default folder unless the user set another one. macOS `/Library/Audio/Plug-Ins`; Windows `C:\Program Files\Common Files\VST3`. Sources: <https://support.musehub.com/en/articles/15070600-where-does-musehub-install-things>, <https://developer.musehub.com/muse-partners-help/adding-products/product-types/plugins>. Content (Muse Sounds) goes elsewhere: macOS `~/Library/Application Support/Muse Hub/`, Windows `C:\Users\{USER}\Muse Hub\` [V snippet].
- **Works in any DAW** [V snippet, MuseHub says plug-ins compatible with "any third-party DAW"]. Log-in activation is needed for some [V snippet, French tutorial <https://www.elephorm.com/formation/maitriser-audacity-4-pour-lenregistrement-le-nettoyage-et-le-mixage-audio/installer-des-plugins-dans-audacity-musehub>].
- **Public API / terms:** I found **no** public API for listing or installing MuseHub products programmatically and no stated terms on third-party apps driving the Hub [V by absence in snippets; the developer site pages could not be fetched]. [A] Treat MuseHub as a *source of installed VST3s the user installs themselves*. The app does not install from it. Ask Muse for permission before any deeper integration.
- **So for "take raw FX from MuseHub and push them to the DAW":** realistic and low-risk = the user installs in MuseHub, REAPER rescans, our app lists the VST3 via `EnumInstalledFX`, shows it with a "MuseHub" origin badge if its path/vendor says so [A, heuristic], and adds it by name. We do not download, copy or load the binary.
- **Other sources** [K]: vendor installers (iZotope Product Portal, Waves Central, Slate Digital connect, Native Access), free REAPER stock plug-ins (ReaPlugs, JS effects) which are always present in REAPER, and the REAPER FXChains folder for saved chains. Some chains will reference plug-ins only the owner has.

### B4. Mapping FX across DAWs ("compatibility")

- **v1: no mapping.** The unit is "a saved REAPER chain" (opaque file the app applies by name). It works only in REAPER and only if its plug-ins are installed [A].
- **Later:** an app-level portable chain = ordered list of {plug-in identity (format + vendor + name + VST3 class ID), state blob (`vst_chunk`/`clap_chunk`), enabled}. Identity matches across DAWs more reliably than state. State blobs are plug-in-specific and not guaranteed to load across versions [K]. Compatibility states: *supported* (all identities installed and recognised by the target DAW), *partial* (some missing, or format differs, e.g. only VST2 present), *unsupported* (target DAW has no bridge), *missing plug-in* (named but not installed) [A].
- Audacity 4 supports LV2, VST3, AU and integrates MuseHub [V snippet <https://www.musehub.com/de-de/app/audacity>], so a portable chain model eventually has a second target. The repo says Audacity launches open no REAPER bridge (ADR 0144/0660) [V, repo names].

---

## C. Best-in-class FX UIs, and what to steal

| Product | Concrete pattern | Tag |
|---|---|---|
| **REAPER FX chain window** | One list of FX per target, one row per FX with a power checkbox, drag to reorder, right-click for add/offline/copy; chain title shows the target ("FX: Track 3 - Chapter 1"). Saved chains `.RfxChain`; FX browser has All plug-ins, by type/developer/category, **Favorites**, **Recent**, custom folders, and a filter box; right-click filter = "scan for new plug-ins". Take FX opened from the item's FX button | [K], FX browser folders/filter + rescan [V snippet, Slate support pages above] |
| **Cockos Effects Dialog** | Saving a chain stores all FX on that track in their current bypassed/active state; can save only selected FX; extension `*.RfxChain` | [V snippet: <https://www.cockos.com/wiki/index.php/Effects_Dialog>] |
| **iZotope RX Module Chain** | Series list of modules; per module: **power button (enable/disable)**, **drag to reorder** ("Click and drag a module panel up or down within the Module Chain to change its order in the signal flow"), **remove X**, **View module** (opens module with that step's settings), **[+] add module at end**, **preset menu** (factory + saved chains). Also per-module "frequency selection" so a module only processes a band | [V: RX 8 Module Chain help] |
| **iZotope RX presets and preview** | Preset menu per module: add/remove/rename/**set keyboard shortcut for a preset**/import/reload/reveal folder; **asterisk "dirty flag"** when a preset is modified, with Update vs Add; **Preview [Shift-Space]** plays a short pre-rendered preview of current settings on the selection, settings adjustable during preview; **Compare** where preview is too slow; pre/post-roll 1 s default | [V: RX 8 Common Module Controls] and [V snippet: pre/post-roll 1 s default, preview buffer about 0.5 s, from the search result on RX module controls] |
| **iZotope Ozone / Neutron** | Ozone signal chain = reorderable module row; global presets can change contents and order; **Master Assistant** analyses audio and builds a starting chain you can edit afterwards. Neutron Visual Mixer controls pan/gain/width of every Neutron instance in the session from one pad | [V snippet: Ozone 9 help <https://s3.amazonaws.com/izotopedownloads/docs/ozone9/en/getting-started/index.html>, Visual Mixer pages above]. Per-module bypass/solo in the chain not confirmed |
| **Adobe Audition Effects Rack** | Each **clip and track keeps its own rack**, saved in the session; up to **16 slots**; slot popup to choose an effect; power button per slot; **Mix (wet/dry)** slider and input/output meters in the rack; **rack presets** store groups of effects; **copy/paste effects between racks** (Ctrl+C / Ctrl+V); Waveform Editor has an **Apply** button (destructive) vs Multitrack rack (non-destructive); Pre-render Track and FX Pre/Post-Fader buttons | [V snippet: <https://helpx.adobe.com/audition/using/effects-controls.html>, <https://www.ask.video/video/adobe-audition-cc-101-absolute-beginner-s-guide/8-8-the-effects-rack>] |
| **Logic Pro channel strip** | Inserts in series, up to 15 per strip; sends parallel (up to 12) with pre/post-fader choice; save/copy/paste/reset **channel strip settings**; move plug-ins between strips with the hand tool | [V snippet: <https://support.apple.com/guide/logicpro-ipad/lpip1f682b4b/ipados>, <https://support.apple.com/en-al/guide/logicpro/lgcpf6d40f1d/mac>]. A/B compare: not found; plug-in windows have a compare control [K] |
| **Ableton Live Racks** | Audio Effect Rack: **Chain List** with per-chain activator, solo, hot-swap; signal feeds every chain at once (parallel); **8 Macro knobs** mapped to any parameters across devices; Show/Hide Macro button | [V snippet official manual <https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/> for Chain List/activators; Macro details from third-party <https://violetrecording.com/how-to-use-racks-in-ableton-live/>] |
| **Studio One / Pro Tools / FL Studio** | Studio One: inserts plus "Macro Controls" panel on the channel and track presets that include FX. Pro Tools: Inserts A-J + sends, Master fader, Avid's preset "libraries", AudioSuite (offline, destructive, preview) vs real-time inserts. FL: Mixer insert slots (10) with per-slot mix knob and wet/dry | [K] only |
| **Descript** | One toggle "Studio Sound" per clip with an intensity slider; coloured clip marks; text selection chooses the range | [V snippet from earlier doc: <https://help.descript.com/descript-tour/sound-good-tools>] |
| **Hindenburg** | Few controls, per-clip "Clip FX"/"Track FX" inspector, auto levelling and loudness, voice profile presets | [K]; low confidence |
| **Waves / Slate** | Waves: preset browser with A/B + "Compare" buttons in the header of every plug-in, undo/redo in the plug-in toolbar; Slate: per-plug-in presets, license-activation and Connect app | [K]; low confidence |

### Patterns worth copying (concrete)

1. **Chain per target, shown as a vertical list with a visible target header and a count badge** (REAPER, Audition: every clip/track has its own rack and the rack header names the target).
2. **Signal-flow strip with a fixed order of levels**: Take > Track > Master, drawn left to right or top to bottom, with the selected take's effective chain highlighted. No tool does the "effective chain for this clip" view well in one place; Audition's separate clip and track racks and REAPER's separate windows are the nearest. [A] This is our differentiator.
3. **Per-row: power (bypass), offline, drag handle, name, vendor/format chip, preset name with an asterisk when modified** (RX Module Chain + RX preset dirty flag; REAPER `TrackFX_GetPreset` returns false when modified so we can show the asterisk [V]).
4. **Preview with pre/post-roll on a selection and a Compare** (RX: 1 s pre/post by default). We cannot render preview in the web app for REAPER plug-ins; preview means "loop the passage in REAPER with the FX active, then bypass for A/B" [A, uses bridge play + bypass].
5. **Presets with shortcuts, import, favourites** (RX). Favourite = star on a plug-in or a saved chain; Recently used = last 8 [A, REAPER's browser has Favorites and Recent folders [K]].
6. **Macro knobs** (Ableton) later: expose 1-4 named parameters per chain item (e.g. "Strength", "Mix") in our UI by mapping `TrackFX_SetParamNormalized`. v1: none; rely on REAPER's own FX window ("Open in REAPER" button, uses `TrackFX_Show`/`TakeFX_Show` [V names]).
7. **Wet/dry Mix per slot** (Audition). Many plug-ins have their own mix; do not invent a universal one.
8. **Latency/CPU**: show a latency chip per chain from `chain_pdc_reporting` [V]. CPU usage per plug-in is not exposed by an API call I found [V by absence]; do not promise it.
9. **Missing-plug-in row**: greyed with "not installed" and the original name; offer *Replace* and *Remove*, never silently dropping it [A].
10. **Coverage meter** (ours): compute from the DAW. A master-chain FX is 100% by definition; a track FX is 100% of that chapter track; a take FX is the fraction of the chapter covered by that item. Show as "Chapter fraction affected" next to each row, and flag any row over the cap.

---

## D. Proposal for OUR Editing page

### D1. Information architecture

Three **levels**, always visible as a vertical stack in the FX tab, ordered by signal flow:

```text
Level 3  MASTER   (the whole mix: applies to every chapter)       <- read-only by default, 100%
Level 2  TRACK    (this chapter's track)                           <- applies to the chapter, 100% of chapter
Level 1  TAKE     (this item/take: one passage, or a stretch)      <- % of chapter = item length / chapter length
```

Plus **Input / Monitoring FX** in a collapsed row under "Not in the export" [V: monitoring FX are not rendered per search snippet <https://reaper.blog/2016/02/5-quick-tips-for-recording-workflow-in-reaper/>; input FX are printed into the recording [V snippet, same]].

Two views, selectable:
- **Chain view** (default): the selected level's FX list, editable.
- **Effective chain** for the selected take: read-only strip `[Take FX] > [Track FX] > [Master FX]` (order to be verified in REAPER, A1) with FX counts, total latency and coverage, and warnings.

Takes tab and FX tab share one **Take picker** (see D3).

### D2. Data model changes

Replace the FxRegion/FxPreset-only model with a chain model. Keep `FxRegion` as the app-created record that remembers *which* of the user's changes we made.

```ts
FxLevel   = 'master' | 'track' | 'take'          // + 'input' | 'monitor' read-only
FxSource  = 'reaper-chain' | 'reaper-plugin' | 'vst3' | 'clap' | 'builtin' | 'clip' // clip = app's own DSP (recorder)
Compat    = 'supported' | 'partial' | 'unsupported' | 'missing'

FxInstance {
  id            // our id
  dawGuid?      // TrackFX_GetFXGUID / TakeFX_GetFXGUID
  level         // FxLevel
  targetRef     // 'master' | trackGuid | {itemGuid, takeGuid}
  position      // index in chain at read time (not identity)
  name          // TrackFX_GetFXName
  pluginRef?    // {format, vendor?, ident, classId?}  from fx_type/fx_ident
  enabled       // GetEnabled
  offline       // GetOffline
  presetName?   // GetPreset ; presetModified?: boolean (retval false)
  pdcSamples?   // 'pdc' named parm
  origin?       // 'musehub' | 'reaper-stock' | 'other'   (heuristic)
  compat        // Compat
  params?       // later: exposed macros {index,label,value}
}
FxChain {
  id, level, targetRef,
  source        // FxSource
  savedChainName?  // 'Voice/Robot.RfxChain' when applied from a file
  instances: FxInstance[]
  latencySamples?, readAt, stale: boolean
}
FxLibraryItem {            // what the browser shows
  kind: 'saved-chain' | 'plugin' | 'preset'
  name, path?, plugin?, favourite: boolean, lastUsedAt?, compat
}
FxRegion (keep) = our intent: {id, chapterId, start, end, scope: 'take'|'track'|'section', chainId|instanceIds, appliedUndoLabel}
EditorSettings.fxCapPct (keep)
```

Rules:
- **DAW is the source of truth for what is on the chain.** The app reads it on focus and on the bridge change event; the cached copy is flagged `stale` when REAPER is off. Only app-created `FxRegion`s are stored by us [A, consistent with the earlier doc's "derived on demand, never stored"].
- Replace `FxScope 'section'|'take'|'track'` with `FxLevel` plus a time range. `section` is a take-level FX on a split piece (what `add_take_fx` does) [V repo].
- `EffectId` enum (pitch/deess/…) becomes a *category tag* for library items, not the identity of an effect.

### D3. Take picker (comping)

Per passage row: take chips in a row with, per take, duration, FX badge ("2 FX"), lane number, "plays" dot, and a Keep radio.
- Stacked takes (one item, several takes) → `set_active_take` [V repo].
- Fixed-lane items (v7) → `pick_retake_lane` sets the track's `C_LANEPLAYS` [V repo]. If the track is not fixed-lanes, show "Lanes off" and a link to open in REAPER.
- **When the kept take changes, the effective chain changes** because take FX belong to the take [K]. Show a one-line diff in the picker: "Take 3 has 1 FX (De-esser). Take 2 has none." and a warning "Switching to take 2 drops De-esser" [A]. Offer "Copy FX to this take" (`TakeFX_CopyToTake` [V name]).
- A/B between takes: play-in-REAPER buttons (existing `loop_context`/transport commands) [V repo list]; the page never auto-plays.

### D4. FX browser (right drawer or modal)

Tabs: **Saved chains** | **Plug-ins** | **Presets** | **Favourites** | **Recent**.
- **Saved chains**: `list_fx_chains` (folders as groups). Each shows plug-in names inside, if we can read the `.RfxChain` text. Reading the file text is a plain file read, not a REAPER call [A]. Compat per chain = all inner plug-ins exist in `list_fx` (supported) or not (missing, with names).
- **Plug-ins**: `list_fx`/`EnumInstalledFX`, filtered by format, vendor, category; search box; "Rescan in REAPER" button points to REAPER Preferences (we cannot trigger a rescan through the documented API [V by absence]).
- **Presets**: v1 hidden. Later: `TrackFX_GetPresetIndex`/`SetPresetByIndex`.
- **Favourites/Recent**: ours, stored in project/app settings (ADR 0234 says favourites are a Settings row [V repo]).
- Row actions: *Add to master | Add to track | Add to this take* with the disabled reasons spelled out; *Open in REAPER*.

### D5. Apply / create flow

1. Pick level → pick item (chain, plug-in) → **Review** step: shows resulting effective chain, coverage % before/after, latency, compat states.
2. **Preview**: "Play this passage in REAPER" with the FX added in **bypassed** state then toggled A/B [A]. Needs `fx_set_enabled`.
3. **Apply** = one undo block; toast "Undo in REAPER: Narration Utils: apply …" [V repo label pattern].
4. Rules by level (v1 proposal, **owner to confirm**):
   - Master: add/remove allowed but behind a confirm ("changes every chapter"); default read-only [A].
   - Track: chain files and single plug-ins allowed.
   - Take: single plug-ins always; **chain files only if owner lifts ADR 0234**.
5. "Create new FX" in v1 = add a plug-in (any compat=supported), then adjust in REAPER's own window; "Save as chain" = deferred (no API [V by absence]).

### D6. Safeguards

- Coverage cap check per apply ("takes coverage from 4.2% to 11.8%") from the earlier doc [V, earlier doc as proposal]. Track/master = 100%/100% and that row is amber by default.
- Never run plug-ins we do not list; reject paths ([V repo ADR 0234] already refuses non-FXChains paths and `../reaper.ini`).
- Refuse while REAPER records [V repo].
- Show bypass/offline separately; a bypassed FX does not count toward coverage but stays in the list.
- All writes through undoable blocks; Undo happens in REAPER, the app re-reads after (ADR 0210 says sync watches saved .rpp and the edit counter and sends REAPER nothing [V repo name]).

### D7. Empty / error states

- **REAPER off:** FX tab shows last-known snapshot, greyed, with "Last read 14:02, REAPER not connected" and no Apply. [A]
- **Built-in recorder (no DAW):** hide Master/Track levels; show "FX are applied in REAPER. Your recording keeps the original." Offer the app's own presets (pitch/de-ess/etc., `source: clip`) with the existing `reaper-off` path. [A, current mock behaviour]
- **Chain refers to missing plug-in:** `missing` pill, lists which; Apply disabled for that chain unless user chooses *Apply what is available* [A].
- **Nothing on this level:** "No FX on this take. Take 3 inherits the track chain (3 FX) and the master chain (2 FX)." with link buttons.
- **Experimental switch off (ADR 0230):** "FX commands need the experimental switch" [V repo ADR 0230 title].
- **Audacity:** bridge absent [V repo ADR 0144]; show "Audacity does not expose FX through the bridge" [A].

### D8. Wireframes (plain text)

**Desktop (≥1440)**

```text
+-----------------------------------------------------------------------------------------------+
| Chapter 7 "The Bridge"  28:14   Effects touch 4.2% of chapter [meter]  cap 10%   REAPER: ok   |
+-----------------------------------------------------------------------------------------------+
| Takes | Cleanup | Effects                                                                      |
+-----------------------------------------------------------------------------------------------+
| WAVEFORM  with take/FX region markers                                                          |
| COVERAGE STRIP  [__][T][T][_][TR....................................................]          |
+--------------------------+-------------------------------------------+-------------------------+
| PASSAGES / TAKES         | CHAIN (selected level)                    | FX BROWSER              |
| 12 "She crossed..."      | Level: ( ) Master  ( ) Track  (*) Take    | [Saved chains|Plug-ins  |
|  [T1 4.2s 0FX]           |                                           |  |Fav|Recent] [search]   |
|  [T2 3.9s 1FX] (*keep)   | Take 2  item 12  lane 2  covers 0.2%      | Voice/                  |
|  [T3 4.1s 0FX]           |  1  [on] De-esser  ReaXcomp  VST  pdc 0   |  * Narrator Warm  OK    |
| 13 "He did not..."       |  2  [on] ReaEQ     preset: "Hi-pass*" ...  |  Radio phone  OK        |
|                          |      [+ add FX ▾]  [open in REAPER]        |  Robot       missing:   |
|                          |                                            |        "Acme Vox"       |
|                          | EFFECTIVE CHAIN for Take 2                 | Plug-ins (212)          |
|                          | [Take: 2 FX] > [Track: 3 FX] > [Master: 2] | [Add to take][to track] |
|                          | latency 1,024 smp   FX hear in export: yes |                         |
+--------------------------+-------------------------------------------+-------------------------+
| [Preview in REAPER (A/B)]   [Apply: 1 FX to Take 2]   undo: Narration Utils: add take FX …      |
+-----------------------------------------------------------------------------------------------+
```

**1280 breakpoint** (browser becomes a slide-over; passages collapse into a dropdown)

```text
+-------------------------------------------------------------------------------+
| Ch 7 · Effects 4.2% [meter] · REAPER ok                                       |
| Takes | Cleanup | Effects                                                     |
+-------------------------------------------------------------------------------+
| WAVEFORM / COVERAGE STRIP                                                     |
+-----------------------------+-------------------------------------------------+
| Passage 12 ▾  [T1][T2*][T3] | Level: Master | Track | Take*                  |
|                             |  1 [on] De-esser  VST  ...                      |
|                             |  2 [on] ReaEQ   Hi-pass*                        |
|                             |  [+ Add FX]  (opens slide-over browser)         |
|                             | Effective: Take 2 > Track 3 > Master 2          |
+-----------------------------+-------------------------------------------------+
| [Preview A/B]  [Apply]                                                         |
+-------------------------------------------------------------------------------+
```

### D9. v1 vs later

| v1 (build now, needs bridge read commands + harness tests) | Later |
|---|---|
| Read-only FX on master, track and each take of the selected passage, with enabled/offline/preset/latency (`fx_read`) | Edit parameters in-app (macros) |
| Take picker with FX badges and effective-chain diff | Compare tool A/B inside the app with level-matched audio |
| Apply existing `.RfxChain` to track/master (exists) | Apply chains to takes (needs ADR change + spike) |
| Add one listed plug-in to a take (exists) | Save current FX as new chain; templates |
| Bypass/offline/remove/reorder via GUID | Input/monitoring FX controls |
| Saved chains browser with compat from inner plug-in names; plug-in browser with search, favourites, recents | Portable chain model across DAWs (identity + state blob) |
| Coverage meter from the DAW | App-hosted plug-ins/preview (JUCE/VST3 sidecar) |
| MuseHub plug-ins appear automatically once REAPER scans them; origin chip | Any MuseHub integration beyond "user installs it" |

---

## E. Risks and open questions for the owner (ranked)

1. **ADR 0234 conflict.** Owner said "FX chain... on the specific take items". ADR says chains never go on takes. Decide: (a) keep it (take = single plug-ins only), or (b) allow `.RfxChain` on a take. The API documents (b) [V], but the repo has no evidence of how REAPER behaves with it (e.g. missing plug-in inside; what is returned). Needs a spike row (A8c).
2. **Is master/track write allowed from this page?** Changing master changes every chapter and the ACX mastering (Master & QC page). Default proposal: master is read-only here, editable only from Master & QC.
3. **Take FX vs "which take plays".** If the narrator picks a different take, the take FX change. Is that the wanted behaviour, or should the chosen FX follow the passage? (Copying FX to the new take is possible via `TakeFX_CopyToTake` [V name].)
4. **Source of truth.** The page will read FX from REAPER every time. If REAPER is off, do we show a last snapshot or nothing? (Proposed: snapshot marked stale.)
5. **MuseHub scope.** Confirm "user installs via MuseHub, REAPER scans, we list". No programmatic install/download without Muse's agreement; no public API found [V by absence]. Is a Muse partner contact available?
6. **Compat definition for v1.** Is "plug-ins named in the chain are installed on this machine" enough, or do we need version/format checks (VST2 vs VST3 duplicates)?
7. **App-hosted preview/hosting (in-app VST3).** Large cost, licence choice (JUCE AGPL or commercial [V]; VST3 SDK MIT [V]), crash isolation. Not v1. Confirm.
8. **Coverage cap with track/master FX.** Does a track-level FX count as 100%? (Earlier doc open question #3.)
9. **Recorder-only users.** Do they get any FX in v1, or only "use REAPER to unlock"?
10. **Fixed lanes vs stacked takes.** Which does the owner's REAPER setup use? Decides which picker path is primary (earlier doc open question #2).

**Technical risks**
- Item index drift and FX index drift; always carry GUIDs [V].
- Containers (v7.06+) change FX addressing; read must handle them or be explicit that it flattens [V].
- `TrackFX_GetPreset` returns false when modified, so "preset name present but retval false" must show as modified, not as "no preset" [V].
- Splitting an item with take FX: behaviour unverified in the repo (spike lists it as a question) [V]; the apply flow for "section" scope depends on it.
- Heavy reads on projects with many tracks: page and cap (existing 500 FX cap in `master_chain_read`) [V].
- Plug-in names are not unique across formats (VST2 vs VST3 of the same plug-in); use `fx_ident` (path) plus `fx_type` as identity, not display name [V fields exist; uniqueness is A].
- Any new REAPER command ships with a harness test first, golden fixture, Zod schema, `wire.go` table row, threat-model re-check (row 5h for FX chain/plug-in code running in REAPER) [V repo CLAUDE.md and ADR 0234].
- UI PRs need before/after screenshots against the benchmark mock (CLAUDE.md rule).

---

## Sources

- ReaScript API reference (Ultraschall copy, read in full): <https://github.com/Ultraschall/ultraschall-lua-api-for-reaper/blob/master/ultraschall_api/Documentation/Reaper_Api_Documentation.html>
- Repo: `integrations/reaper/narration_workspace.lua`, `narration_master_render.lua`, `narration_retake_lanes.lua`; `docs/adr/0234-…`, `0230`, `0144`, `0210`; `docs/research/reaper-api-for-planned-commands.md`, `edit-and-proof-spike-ep0.md`, `reaper-automation-surface.md`; `docs/operations/reaper-verification-pass.md` (rows A7, A8, A8b)
- iZotope RX 8 Module Chain: <https://s3.amazonaws.com/izotopedownloads/docs/rx8/en/module-chain/index.html> ; RX 8 module controls: <https://s3.amazonaws.com/izotopedownloads/docs/rx8/en/module-controls/index.html>
- VST3 SDK MIT licence: <https://raw.githubusercontent.com/steinbergmedia/vst3sdk/master/LICENSE.txt>
- JUCE licence: <https://raw.githubusercontent.com/juce-framework/JUCE/master/LICENSE.md>
- CLAP: <https://github.com/free-audio/clap>
- Search-snippet sources (not read in full): MuseHub install support <https://support.musehub.com/en/articles/15070600-where-does-musehub-install-things> ; MuseHub partner help <https://developer.musehub.com/muse-partners-help/adding-products/product-types/plugins> ; Audacity+MuseHub <https://www.audacityteam.org/blog/introducing-musehub> ; Steinberg macOS VST3 location <https://www.steinberg.help/r/vst-plug-in-locations-on-mac-os-x-and-macos> ; Cockos Effects Dialog <https://www.cockos.com/wiki/index.php/Effects_Dialog> ; Cockos VST prefs <https://www.cockos.com/wiki/index.php/Preferences_Plugins_VST> ; REAPER input/monitoring FX <https://reaper.blog/2016/02/5-quick-tips-for-recording-workflow-in-reaper/> ; Audition effects controls <https://helpx.adobe.com/audition/using/effects-controls.html> ; Logic channel strip <https://support.apple.com/guide/logicpro-ipad/lpip1f682b4b/ipados> ; Ableton Racks <https://www.ableton.com/en/manual/instrument-drum-and-effect-racks/> ; Bitwig crash protection <https://www.bitwig.com/support/technical_support/what-is-plug-in-crash-protection-26/> ; JUCE plugin loader forum <https://forum.juce.com/t/plugin-loader-ways-of-handling-plugins-that-crash/50730>
