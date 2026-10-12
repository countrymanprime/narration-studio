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
  | 'silence_trim'
  | 'item_gain'
  | 'render_with_fx'
  | 'master_chain_read'
  | 'macro_render'
  | 'cut_range'
  | 'fx_range'
  | 'stack_takes'
  | 'backups';

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
  { key: 'silence_trim', label: 'Silence trim' },
  { key: 'item_gain', label: 'Level matching' },
  { key: 'render_with_fx', label: "Mastering with the project's FX" },
  { key: 'master_chain_read', label: 'Master and track FX listing' },
  { key: 'macro_render', label: 'Mastering with an effect macro' },
  { key: 'cut_range', label: 'Cut words and audio' },
  { key: 'fx_range', label: 'Add an effect to words' },
  { key: 'stack_takes', label: 'Stack takes' },
  { key: 'backups', label: 'Audio backups' },
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
 * together with their audio (ADR 0860 point 2), with `fadeMs` (0 to 500) at each seam. The host resolves the item and its project
 * seconds itself, one item per request. A capability refusal carries the capability's sentence; a mode or fade it does not take, words
 * not heard and words across two items are refused with a sentence; a range outside the alignment (a chapter with none included) or a
 * gone item is code `stale`; words already cut answer `changed: false`. */
export interface DawDeleteRangeApi {
  dawDeleteRange(chapterId: string, firstToken: number, lastToken: number, mode: DawCutMode, fadeMs: number): Promise<DawResult>;
}

export interface DawProjectStateApi {
  dawProjectState(): Promise<DawProjectState>;
  /** The host pushes the current project state on its first tick after launch and then only on a change. */
  subscribeDawProjectState(onUpdate: (state: DawProjectState) => void): () => void;
}
