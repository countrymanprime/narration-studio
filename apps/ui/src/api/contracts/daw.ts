// The DAW port's capability payload (ADR 0300): what the launch's DAW can do right now, computed by
// the host's dawport.Resolver from the adapter's declaration, the bridge's reachability and the narrator's
// DAW.capability.<name> settings. apps/desktop/bindings_daw.go is the binding and the daw_capabilities_changed event;
// apps/desktop/internal/dawport/capability.go is the capability catalog this file's DAW_CAPABILITIES mirrors.

/** Which DAW the launch is talking to, 'Built-in' when the app's own recorder is the engine (a launch with no DAW whose project
 * records with it), or 'none' for a standalone launch (dawport.Kind.String() in Go). */
export type DawKind = 'REAPER' | 'Audacity' | 'Built-in' | 'none';

/** How far the launch's DAW supports a capability (port.Level.String() in Go). */
export type DawCapabilityLevel = 'unsupported' | 'not_yet_available' | 'experimental' | 'supported';

/** Why a capability is unavailable now (port.Reason in Go); absent when it is available. */
export type DawCapabilityReason = 'standalone' | 'not_running' | 'experimental_off' | 'failed' | 'turned_off' | 'not_yet' | 'unsupported';

/** How a change that needs several edits is made (port.Mode in Go): `native` (the DAW does it itself, one undo step), `app`
 * (the app makes it; the DAW keeps no project of its own) or `steps` (the app performs the edits one after another). */
export type DawCapabilityMode = 'native' | 'app' | 'steps';

/** One capability's answer. `reason` and `message` are set only when `available` is false; `message` is a whole sentence
 * for the narrator, worded by the resolver or the adapter (dawport.Explainer), never by the UI. `destructive` (sent only
 * when true: using it replaces audio that cannot be brought back, so ask first) and `mode` are what the adapter declares
 * (dawport.Describer), sent whether or not the capability is available now (ADR 0810). */
export type DawCapabilitySupport = {
  level: DawCapabilityLevel;
  available: boolean;
  reason?: DawCapabilityReason;
  message?: string;
  destructive?: boolean;
  mode?: DawCapabilityMode;
};

/** The most undo points one DawResult reports (dawport.MaxUndoSteps in Go). */
export const DAW_RESULT_MAX_UNDO_STEPS = 12;

/** The refusal codes a page branches on (dawport.CodeStale in Go, ADR 0861). `stale`: the call named an item, track or finding
 * the DAW no longer has where the app read it, so read the project again. A later ADR adds a value. */
export const DAW_REFUSAL_CODES = ['stale'] as const;
export type DawRefusalCode = (typeof DAW_REFUSAL_CODES)[number];

/** What one call to the DAW answered (dawport.Result in Go, ADR 0810). A refused call changed nothing: `refused` holds the
 * reason and `message` repeats it. `undoSteps` is 0 for a cursor move and 1 for one command; `steps` lists, in order, the
 * edits a multi-step change made. `code` is set only on a refusal the page branches on, never instead of the sentence (ADR 0861). */
export type DawResult = {
  ok: boolean;
  changed: boolean;
  message: string;
  undoSteps: number;
  refused?: string;
  code?: DawRefusalCode;
  steps?: string[];
};

/** The DAW port's capability names (dawport.Capability in Go). New ones may appear later (a new adapter capability);
 * this union is the ones this build knows, not a closed wire contract - `DawCapabilities['capabilities']` is a plain
 * string-keyed record for that reason. */
export type DawCapabilityKey =
  | 'review'
  | 'navigate'
  | 'markers'
  | 'pickups'
  | 'line_identity'
  | 'render_config'
  | 'cleanup_tools'
  | 'retake_lanes'
  | 'project_state'
  | 'take_create'
  | 'heartbeat'
  | 'project_read'
  | 'track_state'
  | 'track_select'
  | 'record'
  | 'punch'
  | 'regions'
  | 'takes'
  | 'fx_chains'
  | 'item_gain'
  | 'render_with_fx'
  | 'master_chain_read'
  | 'macro_render'
  | 'cut_range'
  | 'fx_range'
  | 'stack_takes'
  | 'backups'
  | 'file_preview'
  | 'file_reveal'
  | 'range_gain'
  | 'click_repair';

export type DawCapabilities = {
  daw: DawKind;
  /** Whether the DAW is answering now (the heartbeat), not per capability: a capability may still be unavailable for
   * another reason (turned off, experimental, not yet available) even while this is true. */
  reachable: boolean;
  capabilities: Record<string, DawCapabilitySupport>;
};

/** The capability catalog, in the order Settings lists them and the resolver's All() does (dawport.Capabilities() in
 * Go). The Settings mock fixture (mockFixtures.ts) and the DAW mock (dawMock.ts) both read this, so neither drifts
 * from the port's names or labels. */
export const DAW_CAPABILITIES: ReadonlyArray<{ key: DawCapabilityKey; label: string }> = [
  { key: 'review', label: 'Compare the recording with the manuscript' },
  { key: 'navigate', label: 'Go to and loop findings' },
  { key: 'markers', label: 'Add markers' },
  { key: 'pickups', label: 'Pickup list' },
  { key: 'line_identity', label: 'Line identity' },
  { key: 'render_config', label: 'Chapter render setup' },
  { key: 'cleanup_tools', label: 'Cleanup tools' },
  { key: 'retake_lanes', label: 'Retake lanes' },
  { key: 'project_state', label: 'Project change check' },
  { key: 'take_create', label: 'Create takes' },
  { key: 'heartbeat', label: 'Connection status' },
  { key: 'project_read', label: 'Read the saved project' },
  { key: 'track_state', label: 'Read track arm state' },
  { key: 'track_select', label: 'Select a track in REAPER' },
  { key: 'record', label: 'Record' },
  { key: 'punch', label: 'Punch and roll' },
  { key: 'regions', label: 'Chapter regions' },
  { key: 'takes', label: 'Choose the active take' },
  { key: 'fx_chains', label: 'FX chains' },
  { key: 'item_gain', label: 'Level matching' },
  { key: 'render_with_fx', label: "Mastering with the project's FX" },
  { key: 'master_chain_read', label: 'Master and track FX listing' },
  { key: 'macro_render', label: 'Mastering with an effect macro' },
  { key: 'cut_range', label: 'Cut words and audio' },
  { key: 'fx_range', label: 'Add an effect to words' },
  { key: 'stack_takes', label: 'Stack takes' },
  { key: 'backups', label: 'Audio backups' },
  { key: 'file_preview', label: 'Play part of a file' },
  { key: 'file_reveal', label: 'Show a file in the audio engine' },
  { key: 'range_gain', label: 'Lower stretches of a take' },
  { key: 'click_repair', label: 'Repair clicks in a take' },
];

/** The DAW's transport as of its last heartbeat (daw_transport_changed, ADR 0305;
 * apps/desktop/bindings_daw_transport.go). `recording` counts a paused recording too; `playing` is REAPER's play bit, so it
 * is also true while recording. `position` (project seconds, moving on about every 1.5 s) is sent only while playing or
 * recording. With no DAW, a DAW not answering, or a bridge script too old to report it, both are false. */
export type DawTransport = {
  playing: boolean;
  recording: boolean;
  position?: number;
};

export interface DawCapabilitiesApi {
  dawCapabilities(): Promise<DawCapabilities>;
  subscribeDawCapabilities(onUpdate: (state: DawCapabilities) => void): () => void;
  /** Pushed only: there is no request for it. The host pushes the current transport on its first tick after launch and
   * then only on a change, so a subscriber that joins later hears nothing until the next change. */
  subscribeDawTransport(onUpdate: (state: DawTransport) => void): () => void;
}

/** The DAW project as last saved against the live one (DawProjectState and daw_project_state_changed;
 * apps/desktop/bindings_daw_projectstate.go). `savedAt` is the saved file's modification time, read by the host, as a local
 * date and time to the minute (`2026-09-26T08:40`), null when the DAW keeps no saved project or this one was never saved.
 * `unsavedChanges` is true when REAPER has edits its saved file does not have. `playPosition` is project seconds as of the
 * last heartbeat, 0 while stopped: a display value, never an anchor for a word. With no DAW, a DAW not answering or the
 * heartbeat capability off, it is stopped, 0, null, false. */
export type DawProjectState = {
  savedAt: string | null;
  unsavedChanges: boolean;
  playState: DawPlayState;
  playPosition: number;
};

export type DawPlayState = 'stopped' | 'playing' | 'recording';

/** WorkspaceHideTakes (SND-5b; apps/desktop/bindings_workspace_hide.go): mute the other takes of the passage between the two tokens
 * of the chapter's stored alignment, keeping `keepCandidateId`, an id `workspaceTakes` offered. The host reads the item and take
 * GUIDs itself; an id it does not offer is refused with code `stale`, and a capability refusal carries the capability's sentence.
 * One undo step when a take was muted; nothing is deleted. A token range outside the alignment rejects. */
export interface DawHideTakesApi {
  workspaceHideTakes(chapterId: string, firstToken: number, lastToken: number, keepCandidateId: string): Promise<DawResult>;
}

/** DawRoll (SND-6a; apps/desktop/bindings_daw_roll.go): stop the recording this app started on the chapter's linked track and record
 * again from `at` (project seconds), keeping the earlier audio as a take (ADR 0860). The host reads the track itself and checks `at`;
 * where the `punch` capability is `destructive` it refuses until `confirmed`, and elsewhere `confirmed` is ignored. A capability refusal
 * carries the capability's sentence and a gone track code `stale`. A chapter the manuscript does not have rejects. */
export interface DawRollApi {
  dawRoll(chapterId: string, at: number, confirmed: boolean): Promise<DawResult>;
}

/** A cut's mode as delete_range takes it: `close` moves the later audio up, `gap` keeps the length. */
export type DawCutMode = 'close' | 'gap';

/** DawDeleteRange (SND-6b; apps/desktop/bindings_daw_range.go): cut the words between the two tokens of the chapter's stored alignment
 * together with their audio (ADR 0860 point 2), with `fadeMs` (0 to 500) at each seam. `padMs` (0 to 500) cuts that much less at each end,
 * and `roomTone` (mode `gap` only) fills the gap with the chapter's room tone, which a DAW with none refuses, cutting nothing (SN-E97).
 * The host resolves the item and its project seconds itself, one item per request. A capability refusal carries the capability's
 * sentence; a mode, fade or pad it does not take, room tone with `close`, words not heard and words across two items are refused with a
 * sentence; a range outside the alignment (a chapter with none included) or a gone item is code `stale`; words already cut answer
 * `changed: false`. */
export interface DawDeleteRangeApi {
  dawDeleteRange(
    chapterId: string,
    firstToken: number,
    lastToken: number,
    mode: DawCutMode,
    fadeMs: number,
    padMs: number,
    roomTone: boolean,
  ): Promise<DawResult>;
}

/** DawApplyFxToRange and DawRemoveFxFromRange (SND-6c; apps/desktop/bindings_daw_fx_range.go): put one of the narrator's saved FX chains
 * on the words between the two tokens of the chapter's stored alignment, with `fadeMs` (0 to 500) at each new seam, and take it off again
 * (ADR 0860 point 3). The host resolves the item and its project seconds itself, one item per request; an apply's chain must be one
 * `workspaceListFXChains` lists, and a removal's a plain chain name. A capability refusal carries the capability's sentence; a fade it does
 * not take, words not heard, words across two items and a chain REAPER does not list are refused with a sentence; a range outside the
 * alignment (a chapter with none included) or a gone item is code `stale`. A removal from an item that does not carry the chain answers
 * `changed: false`: the piece is a new item, which the alignment names once the chapter is checked again. */
export interface DawFxRangeApi {
  dawApplyFxToRange(chapterId: string, firstToken: number, lastToken: number, chainName: string, fadeMs: number): Promise<DawResult>;
  dawRemoveFxFromRange(chapterId: string, firstToken: number, lastToken: number, chainName: string): Promise<DawResult>;
}

/** DawStackTakes and DawUnstackTakes (SND-7b; apps/desktop/bindings_daw_stack.go): stack the later reads of the named passages on the
 * first read's spot as takes, and move them back (ADR 0860 point 4). The page sends a chapter id and passage ids only: the host rebuilds
 * the groups, moves and shift itself from the Booth's passage map, the chapter's track as the DAW reports it now and, to move back, the
 * offsets the saved project's stacked takes recorded, so the plan a dialog showed is never sent. A capability refusal carries the
 * capability's sentence; a passage id the chapter does not list, a track that is gone, and an item that changed since the host read it
 * are code `stale`; a kept take, reads two passages share and nothing to move are refused with a sentence. */
export interface DawStackTakesApi {
  dawStackTakes(chapterId: string, passageIds: string[]): Promise<DawResult>;
  dawUnstackTakes(chapterId: string, passageIds: string[]): Promise<DawResult>;
}

/** DawSplitTake (SN-E94; apps/desktop/bindings_daw_split.go): cut `takeId`, a take of the chapter that reads its line twice, into two
 * takes of one item at `at` (project seconds), in one undo step of the DAW's own; nothing is deleted. `takeId` is the take's id as the
 * DAW reports it on the chapter's linked track now: the host looks it up there and sends the item and take it read itself. A capability
 * refusal carries the `takes` capability's sentence; an engine that cannot split, and a time that is not one, are refused with a
 * sentence; a take the track no longer holds, a cut outside it and a take that changed since the host read it are code `stale`. */
export interface DawSplitTakeApi {
  dawSplitTake(chapterId: string, takeId: string, at: number): Promise<DawResult>;
}

/** A stretch of a take to lower: `start` to `end` seconds into the take's own audio file. */
export interface DawGainStretch {
  start: number;
  end: number;
}

/** DawReduceRangeGain (SN-E100; apps/desktop/bindings_daw_reduce_range_gain.go): lower `stretches` of `takeId`, a take of the chapter, by
 * `reduceDb` (1 to 24), in one undo step of the DAW's own: Clean up's Breaths, Plosives and Noise. `takeId` is the take's id as the DAW
 * reports it on the chapter's linked track now: the host looks it up there, checks every stretch (1 to 500) is inside the part of the
 * file the take plays, and sends the item and take it read itself. A capability refusal carries the `range_gain` capability's sentence; a
 * reduction or stretches out of bounds are refused with a sentence; a take the track no longer holds, a stretch outside it and a take
 * that changed since the host read it are code `stale`. */
export interface DawReduceRangeGainApi {
  dawReduceRangeGain(chapterId: string, takeId: string, stretches: DawGainStretch[], reduceDb: number): Promise<DawResult>;
}

/** A click in a take to repair: `start` to `end` seconds into the take's own audio file, at most 50 ms long. */
export interface DawClick {
  start: number;
  end: number;
}

/** DawRepairClick (SN-E101; apps/desktop/bindings_daw_repair_click.go): smooth `clicks` in `takeId`, a take of the chapter, in one undo
 * step of the DAW's own: Clean up's Clicks. `takeId` is the take's id as the DAW reports it on the chapter's linked track now: the host
 * looks it up there, checks every click (1 to 500, each at most 50 ms) is inside the part of the file the take plays, and sends the item
 * and take it read itself. A capability refusal carries the `click_repair` capability's sentence; clicks out of bounds are refused with
 * a sentence; a take the track no longer holds, a click outside it and a take that changed since the host read it are code `stale`. */
export interface DawRepairClickApi {
  dawRepairClick(chapterId: string, takeId: string, clicks: DawClick[]): Promise<DawResult>;
}

/** DawBackupAround, DawRestoreBackup and DawBackups (SN-D82, ADR 0863; apps/desktop/bindings_daw_backups.go): clone the audio around a
 * chapter's words before an edit, put a backup back, and list the backups. The page sends a chapter id, two token indices and the label
 * the list shows, or a backup id DawBackups listed; the host resolves the words' times and the chapter's track itself, and the DAW adds
 * the narrator's window either side. A capability refusal carries the capability's sentence; a backup changes no audio (`changed:
 * false`); an id the table does not have is refused with `changed: false`. DawBackups reads the table only, newest first. */
export interface DawBackupsApi {
  dawBackupAround(chapterId: string, firstToken: number, lastToken: number, label: string): Promise<DawResult>;
  dawRestoreBackup(backupId: string): Promise<DawResult>;
  dawBackups(): Promise<DawBackupsFile>;
}

/** DawPreviewFileRange, DawStopFilePreview and DawRevealFile (SN-B98; apps/desktop/bindings_daw_files.go): play `length` seconds (at
 * most 60) of a file on disk from `start`, in the file's own seconds, stop that preview, and show a file in the DAW's own file browser,
 * all leaving the project unchanged (no undo step). The path is one the host's measurement result named: the host plays or shows only a
 * file the narrator picked to measure in this session, and only an absolute local path to an audio file that is there. A capability
 * refusal carries the capability's sentence; a path or stretch the host refuses, and a refusal the DAW answers, carry a sentence. */
export interface DawFilesApi {
  dawPreviewFileRange(path: string, start: number, length: number): Promise<DawResult>;
  dawStopFilePreview(): Promise<DawResult>;
  dawRevealFile(path: string): Promise<DawResult>;
}

/** MasterPlayQuietest and MasterOpenInDaw (SN-M97; apps/desktop/bindings_master_files.go): Master & QC's Play the quietest 5 s and Open
 * in the DAW. `fileId` is a file's path as the host's last measurement answered it; any other id is refused with code `stale`. The host
 * plays the 5 s centred on the quietest window that measurement found (refused, with a sentence, when it found none) and shows the file
 * in the DAW's own file browser, through the `file_preview` and `file_reveal` capabilities, leaving the project unchanged. */
export interface MasterFilesApi {
  masterPlayQuietest(fileId: string): Promise<DawResult>;
  masterOpenInDaw(fileId: string): Promise<DawResult>;
}

export interface DawProjectStateApi {
  dawProjectState(): Promise<DawProjectState>;
  /** The host pushes the current project state on its first tick after launch and then only on a change. */
  subscribeDawProjectState(onUpdate: (state: DawProjectState) => void): () => void;
}

/** The most rows `narration-utils/backups.json` holds (`audacity.MaxBackups`). */
export const DAW_BACKUPS_MAX = 500;

/** One row of the Audacity backups table (SN-D81, ADR 0863; apps/desktop/internal/dawport/audacity/backups_store.go): a window of a
 * track's audio the adapter cloned to its own muted track, named for `id`, before an edit. `id` is a GUID in braces; `guid` is the
 * source track as the request named it (Audacity reports no track ids, so its name); `start` and `end` are the window in project
 * seconds; `createdAt` is when it was made, in UTC. `label` says what it was made for ("Roll at ¶ 3") and `restored` is when it was last
 * put back (SN-D82): both were added within version 1 and are absent from a row without them. DawBackups answers the file. */
export type DawBackup = {
  id: string;
  guid: string;
  chapterId: string;
  start: number;
  end: number;
  createdAt: string;
  label?: string;
  restored?: string;
};

/** `narration-utils/backups.json` in the app's project folder (ADR 0863). */
export type DawBackupsFile = {
  schemaVersion: number;
  backups: DawBackup[];
};
