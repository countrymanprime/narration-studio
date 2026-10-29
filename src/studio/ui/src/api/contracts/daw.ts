// The DAW port's capability payload: what the launch's DAW can do right now, computed by
// the host's dawport.Resolver from the adapter's declaration and the bridge's reachability; no setting turns a capability on or
// off. src/studio/desktop/bindings_daw.go is the binding and the daw_capabilities_changed event;
// src/studio/desktop/internal/dawport/capability.go is the capability catalog this file's DAW_CAPABILITIES mirrors.

/** Which DAW the launch is talking to, 'Built-in' when the app's own recorder is the engine (a launch with no DAW whose project
 * records with it), or 'none' for a standalone launch (dawport.Kind.String() in Go). */
export type DawKind = 'REAPER' | 'Audacity' | 'Built-in' | 'none';

/** How far the launch's DAW supports a capability (port.Level.String() in Go). */
export type DawCapabilityLevel = 'unsupported' | 'not_yet_available' | 'experimental' | 'supported';

/** Why a capability is unavailable now (port.Reason in Go); absent when it is available. */
export type DawCapabilityReason = 'standalone' | 'not_running' | 'failed' | 'not_yet' | 'unsupported';

/** How a change that needs several edits is made (port.Mode in Go): `native` (the DAW does it itself, one undo step), `app`
 * (the app makes it; the DAW keeps no project of its own) or `steps` (the app performs the edits one after another). */
export type DawCapabilityMode = 'native' | 'app' | 'steps';

/** One capability's answer. `reason` and `message` are set only when `available` is false; `message` is a whole sentence
 * for the narrator, worded by the resolver or the adapter (dawport.Explainer), never by the UI. `destructive` (sent only
 * when true: using it replaces audio that cannot be brought back, so ask first) and `mode` are what the adapter declares
 * (dawport.Describer), sent whether or not the capability is available now. */
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

/** The refusal codes a page branches on (dawport.CodeStale in Go). `stale`: the call named an item, track or finding
 * the DAW no longer has where the app read it, so read the project again. A later ADR adds a value. */
export const DAW_REFUSAL_CODES = ['stale'] as const;
export type DawRefusalCode = (typeof DAW_REFUSAL_CODES)[number];

/** What one call to the DAW answered (dawport.Result in Go). A refused call changed nothing: `refused` holds the
 * reason and `message` repeats it. `undoSteps` is 0 for a cursor move and 1 for one command; `steps` lists, in order, the
 * edits a multi-step change made. `code` is set only on a refusal the page branches on, never instead of the sentence. */
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
  | 'track_create'
  | 'follow_position'
  | 'transport_sync'
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
  | 'click_repair'
  | 'undo_last'
  | 'monitor_level'
  | 'input_level'
  | 'punch_preroll'
  | 'daw_meters'
  | 'replace_range';

export type DawCapabilities = {
  daw: DawKind;
  /** Whether the DAW is answering now (the heartbeat), not per capability: a capability may still be unavailable for
   * another reason (not yet available, or a capability it requires is unavailable) even while this is true. */
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
  { key: 'track_select', label: 'Select a track in the recording tool' },
  { key: 'track_create', label: 'Add a track for a chapter' },
  { key: 'follow_position', label: "Follow the narrator's place in the project" },
  { key: 'transport_sync', label: "Play and follow the project's transport" },
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
  { key: 'undo_last', label: "Undo the app's last action" },
  { key: 'monitor_level', label: 'Set the monitor level' },
  { key: 'input_level', label: 'Set the input level' },
  { key: 'punch_preroll', label: 'Punch pre-roll' },
  { key: 'daw_meters', label: 'Show the input and output levels' },
  { key: 'replace_range', label: "Replace words with another narrator's audio" },
];

/** The DAW's transport as of its last heartbeat (daw_transport_changed, docs/architecture/reaper-bridge.md;
 * src/studio/desktop/bindings_daw_transport.go). `recording` counts a paused recording too; `playing` is REAPER's play bit, so it
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

/** An engine the narrator can choose for a project (DawChoose). */
export type ChoosableDaw = Exclude<DawKind, 'none'>;

/** Why the project records with its engine: the launch's `--daw` (an override), the narrator's saved choice, the project's linked
 * DAW file, a REAPER project file found in its folder, or the default for a folder with none (dawport.ProjectKind). */
export type DawChoiceSource = 'launch' | 'chosen' | 'linked' | 'found' | 'default';

/** The project's engine as the Booth's chip words it: `connected` (the DAW answers), `starting` (the app opened REAPER and waits for
 * its bridge), `not_running` (its bridge was opened but it stopped answering, or a DAW with no file to link that is not answering),
 * `linked` (its project file is linked; starting it from the app connects it), `not_linked`, `app` (the built-in recorder) or `none`. */
export type DawChoiceState = 'connected' | 'starting' | 'not_running' | 'linked' | 'not_linked' | 'app' | 'none';

/** Where the app's bridge in REAPER stands (src/studio/desktop/reaperbridge.go): whether its files are in REAPER's Scripts folder, whether
 * REAPER runs it when it opens (Scripts/__startup.lua), and the sentence to show when either is false or a start failed. */
export type ReaperBridgeStatus = { installed: boolean; startsWithReaper: boolean; problem: string | null };

/** One engine Settings > Recording lists: whether the app found it on this computer (null when it cannot tell) and its record
 * capability as the resolver answers it, with the resolver's own sentence when it is not available now. */
export type DawChoiceOption = { daw: ChoosableDaw; installed: boolean | null; record: DawCapabilitySupport };

/** DawChoice, DawChoose and DawLinkFound (src/studio/desktop/bindings_dawchoice.go): what the project records with, why, and every
 * engine the narrator can choose. `chosen` is the saved choice (null when none); it differs from `daw` only while a launch's
 * `--daw` overrides it. `linkedFile` and `foundFiles` are file names in the project folder, never paths. */
export type DawChoice = {
  hasProject: boolean;
  daw: DawKind;
  source: DawChoiceSource;
  chosen: ChoosableDaw | null;
  state: DawChoiceState;
  reachable: boolean;
  linkedFile: string | null;
  foundFiles: string[];
  launcherAutoStart: boolean;
  options: DawChoiceOption[];
  /** Set while a REAPER start the app made has not answered: when it started (RFC 3339). */
  starting: { since: string } | null;
  /** The app's bridge in REAPER; null for a project that does not record with REAPER, or before the app checked it. */
  bridge: ReaperBridgeStatus | null;
};

export interface DawChoiceApi {
  dawChoice(): Promise<DawChoice>;
  /** Saves the project's engine; the host refuses the built-in recorder where it cannot run, and any change while a take records. */
  dawChoose(daw: ChoosableDaw): Promise<DawChoice>;
  /** Links the one REAPER project file in the project folder and chooses REAPER; refused when the folder holds none or several. */
  dawLinkFound(): Promise<DawChoice>;
}

/** Where the app is on the way to Audacity 3 (src/studio/desktop/internal/audacitylink): `unsupported` (not Windows), `not_installed`,
 * `not_running`, `module_off` (scripting is not turned on, or Audacity has never started so it has no settings yet),
 * `needs_restart` (scripting is on and Audacity is open but does not answer: it was started before), `audacity4` (the program looks
 * like Audacity 4, which has no scripting pipe), `dialog` (Audacity did not answer and may be waiting on a dialog),
 * `no_project` (it answers and has no project open) and `answering`. */
export type AudacityLinkState =
  'unsupported' | 'not_installed' | 'not_running' | 'module_off' | 'needs_restart' | 'audacity4' | 'dialog' | 'no_project' | 'answering';

/** The one thing the app can do for the state: start Audacity, turn scripting on in its settings, or nothing. */
export type AudacityLinkAction = 'none' | 'launch' | 'enable_module';

/** How the project open in Audacity relates to this one: `linked` (it carries this project's link label), `other` (another
 * project's), `unlabelled` (none) or `unknown` (Audacity is not answering). */
export type AudacityOpenProject = 'unknown' | 'linked' | 'other' | 'unlabelled';

/** One line of the first-start walk-through. */
export type AudacityLinkStep = { id: 'installed' | 'started_once' | 'scripting_on' | 'answering'; label: string; done: boolean };

/** AudacityLink and its audacity_link_changed event (src/studio/desktop/bindings_audacity_link.go). `chosen` is whether the project
 * records with Audacity; nothing is read from Audacity while it does not. `message` is a whole sentence worded by the host.
 * `linkedFile` is a file name, never a path. `heardSecondsAgo` is how long since Audacity last answered, null when it has not
 * since the app opened the project; a page shows "last heard N s ago" from it, never a stale fact as if it were current. */
export type AudacityLink = {
  hasProject: boolean;
  chosen: boolean;
  state: AudacityLinkState;
  message: string;
  action: AudacityLinkAction;
  steps: AudacityLinkStep[];
  installed: boolean;
  running: boolean;
  openProject: AudacityOpenProject;
  linked: boolean;
  linkedFile: string | null;
  heardSecondsAgo: number | null;
};

export interface AudacityLinkApi {
  /** The last heartbeat's state, or a fresh read when there is none yet. */
  audacityLink(): Promise<AudacityLink>;
  /** Asks Audacity now ("Check again"); can take as long as the pipe's timeout while Audacity shows a dialog. */
  audacityLinkCheck(): Promise<AudacityLink>;
  /** Turns scripting on in Audacity's settings file; refused with a sentence while Audacity is open. */
  audacityEnableModule(): Promise<AudacityLink>;
  /** Opens a file dialog for the project's .aup3, records it and chooses Audacity; cancelling changes nothing. */
  audacityLinkFile(): Promise<AudacityLink>;
  /** Writes this project's link label into the project open in Audacity. */
  audacityLinkOpenProject(): Promise<AudacityLink>;
  /** Forgets the linked Audacity project; the label stays in the Audacity project. */
  audacityUnlink(): Promise<AudacityLink>;
  /** The host pushes the link state on a change (the heartbeat asks every 2 s) and not otherwise. */
  subscribeAudacityLink(onUpdate: (state: AudacityLink) => void): () => void;
}

/** The DAW project as last saved against the live one (DawProjectState and daw_project_state_changed;
 * src/studio/desktop/bindings_daw_projectstate.go). `savedAt` is the saved file's modification time, read by the host, as a local
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

/** WorkspaceHideTakes (SND-5b; src/studio/desktop/bindings_workspace_hide.go): mute the other takes of the passage between the two tokens
 * of the chapter's stored alignment, keeping `keepCandidateId`, an id `workspaceTakes` offered. The host reads the item and take
 * GUIDs itself; an id it does not offer is refused with code `stale`, and a capability refusal carries the capability's sentence.
 * One undo step when a take was muted; nothing is deleted. A token range outside the alignment rejects. */
export interface DawHideTakesApi {
  workspaceHideTakes(chapterId: string, firstToken: number, lastToken: number, keepCandidateId: string): Promise<DawResult>;
}

/** DawRoll (SND-6a; src/studio/desktop/bindings_daw_roll.go): stop the recording this app started on the chapter's linked track and record
 * again from `at` (project seconds), keeping the earlier audio as a take. The host reads the track itself and checks `at`;
 * where the `punch` capability is `destructive` it refuses until `confirmed`, and elsewhere `confirmed` is ignored. A capability refusal
 * carries the capability's sentence and a gone track code `stale`. A chapter the manuscript does not have rejects. */
export interface DawRollApi {
  dawRoll(chapterId: string, at: number, confirmed: boolean): Promise<DawResult>;
}

/** A cut's mode as delete_range takes it: `close` moves the later audio up, `gap` keeps the length. */
export type DawCutMode = 'close' | 'gap';

/** DawDeleteRange (SND-6b; src/studio/desktop/bindings_daw_range.go): cut the words between the two tokens of the chapter's stored alignment
 * together with their audio (docs/reference/daw/capabilities.md), with `fadeMs` (0 to 500) at each seam. `padMs` (0 to 500) cuts that much less at each end,
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
  /** DawTrimRange (SN-E112; same file): shorten a gap between words by hiding `start`..`end` project seconds of `itemId`, an item of the
   * chapter, with `fadeMs` (0 to 500) at the seam, as a cut of no words in mode `close` (Clean up's Gaps). The host looks the item up on the
   * chapter's track as the DAW reports it now and sends the item it read. A capability refusal carries the capability's sentence; times or
   * a fade out of bounds are refused with a sentence; an item the track no longer holds or a gap outside it is code `stale`. */
  dawTrimRange(chapterId: string, itemId: string, start: number, end: number, fadeMs: number): Promise<DawResult>;
}

/** DawApplyFxToRange and DawRemoveFxFromRange (SND-6c; src/studio/desktop/bindings_daw_fx_range.go): put one of the narrator's saved FX chains
 * on the words between the two tokens of the chapter's stored alignment, with `fadeMs` (0 to 500) at each new seam, and take it off again
 * (docs/reference/daw/capabilities.md). The host resolves the item and its project seconds itself, one item per request; an apply's chain must be one
 * `workspaceListFXChains` lists, and a removal's a plain chain name. A capability refusal carries the capability's sentence; a fade it does
 * not take, words not heard, words across two items and a chain REAPER does not list are refused with a sentence; a range outside the
 * alignment (a chapter with none included) or a gone item is code `stale`. A removal from an item that does not carry the chain answers
 * `changed: false`: the piece is a new item, which the alignment names once the chapter is checked again. */
export interface DawFxRangeApi {
  dawApplyFxToRange(chapterId: string, firstToken: number, lastToken: number, chainName: string, fadeMs: number): Promise<DawResult>;
  dawRemoveFxFromRange(chapterId: string, firstToken: number, lastToken: number, chainName: string): Promise<DawResult>;
  /** DawFxRangeParams (SN-E104): the settings of the chain on the words, read and nothing changed. The same refusals as a removal, then
   * a chain the DAW no longer has on the words (code `stale`); an engine that bakes an effect into the audio refuses with a sentence. */
  dawFxRangeParams(chapterId: string, firstToken: number, lastToken: number, chainName: string): Promise<DawFxRangeSettings>;
  /** DawSetFxRangeParam (SN-E104): set setting `index` of effect `fx` of the chain on the words (as `dawFxRangeParams` numbers them) to
   * `value`, in one undo step of the DAW's own; a setting already at the value answers `changed: false`. A setting the effect does not
   * have and a value outside its range are refused with a sentence. */
  dawSetFxRangeParam(chapterId: string, firstToken: number, lastToken: number, chainName: string, fx: number, index: number, value: number): Promise<DawResult>;
  /** DawBypassFxRange (SN-E104): bypass every effect of the chain on the words, or turn them back on, in one undo step of the DAW's own;
   * a chain already as asked answers `changed: false`. */
  dawBypassFxRange(chapterId: string, firstToken: number, lastToken: number, chainName: string, bypass: boolean): Promise<DawResult>;
  /** DawCompareFxRange (SN-E113): the effect inspector's Compare in the DAW. The DAW plays the words with the chain on, then bypassed, and
   * puts the chain back as it was; it answers once the first pass has started, with no undo step. The same refusals as a bypass, then an
   * engine that cannot compare, with a sentence. */
  dawCompareFxRange(chapterId: string, firstToken: number, lastToken: number, chainName: string): Promise<DawFxRangeCompare>;
  /** DawStopFxCompare (SN-E113): end the Compare the DAW is playing and put the chain back as it was; with none playing, `changed: false`. */
  dawStopFxCompare(): Promise<DawResult>;
  /** DawChooseFxForRange (#2251, the Effects tab's Choose in REAPER): the DAW splits the words off, with `fadeMs` at each new seam, in one
   * undo step of its own, and opens its own FX window on them for the narrator to choose any plug-in it has. Nothing is recorded. The same
   * refusals as an apply without the chain, then an engine with no such window, with a sentence. */
  dawChooseFxForRange(chapterId: string, firstToken: number, lastToken: number, fadeMs: number): Promise<DawResult>;
  /** DawChosenFxForRange (#2251): what the narrator chose in that window for the words, read and nothing changed. The same refusals as
   * `dawFxRangeParams`; a refusal has no plug-ins. Take the choice off with `dawRemoveFxFromRange` and DAW_CHOSEN_CHAIN, which also joins
   * the words back when nothing was chosen. */
  dawChosenFxForRange(chapterId: string, firstToken: number, lastToken: number): Promise<DawFxRangeChoice>;
}

/** The chain name a choice made in the DAW's own FX window is kept under (dawport.ChosenChain): sent as the chain to take it off, read
 * its settings, bypass or compare it, and recorded as the effect's `chainId`. It is no chain file and `dawApplyFxToRange` refuses it. */
export const DAW_CHOSEN_CHAIN = 'chosen in REAPER';

/** One plug-in the narrator chose in the DAW's own FX window (dawport.ChosenFX): its name as the DAW shows it, and whether it is on. */
export type DawChosenFx = { name: string; enabled: boolean };

/** What `dawChosenFxForRange` answers (dawport.FXRangeChoice): the call's DawResult with no undo step, the plug-ins in chain order (none on
 * a refusal), their names joined as the page shows and records them (`label`, no colon, slash or backslash), whether the DAW's FX window
 * for the words is still open, and whether the list stopped at the DAW's limit. */
export type DawFxRangeChoice = {
  result: DawResult;
  fx: DawChosenFx[];
  label: string;
  chainOpen: boolean;
  truncated: boolean;
};

/** The most settings `dawFxRangeParams` lists over a chain's effects (bridge.MaxFXRangeParams); `truncated` says it stopped there. */
export const DAW_FX_RANGE_MAX_SETTINGS = 512;

/** One setting of one effect of a chain on words (dawport.FXSetting). `fx` is the effect's place in the chain and `index` the setting's
 * place in that effect, both from 0; `value` lies in `min`..`max`; `step` is the DAW's step for it, 0 when it is continuous; `formatted`
 * is the value as the effect shows it ("-6.0 dB"). */
export type DawFxSetting = {
  fx: number;
  fxName: string;
  index: number;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatted: string;
};

/** What `dawFxRangeParams` answers (dawport.FXRangeSettings): the call's DawResult, the chain's settings in order (none on a refusal),
 * whether the list stopped at DAW_FX_RANGE_MAX_SETTINGS, and whether every effect of the chain is bypassed. */
export type DawFxRangeSettings = {
  result: DawResult;
  settings: DawFxSetting[];
  truncated: boolean;
  bypassed: boolean;
};

/** What `dawCompareFxRange` answers (dawport.FXRangeCompare): the call's DawResult, with no undo step, and how long each of the two passes
 * plays in seconds (with the chain, then without), 0 on a refusal. */
export type DawFxRangeCompare = {
  result: DawResult;
  pass: number;
};

/** DawStackTakes and DawUnstackTakes (SND-7b; src/studio/desktop/bindings_daw_stack.go): stack the later reads of the named passages on the
 * first read's spot as takes, and move them back (docs/reference/daw/capabilities.md). The page sends a chapter id and passage ids only: the host rebuilds
 * the groups, moves and shift itself from the Booth's passage map, the chapter's track as the DAW reports it now and, to move back, the
 * offsets the saved project's stacked takes recorded, so the plan a dialog showed is never sent. A capability refusal carries the
 * capability's sentence; a passage id the chapter does not list, a track that is gone, and an item that changed since the host read it
 * are code `stale`; a kept take, reads two passages share and nothing to move are refused with a sentence. */
export interface DawStackTakesApi {
  dawStackTakes(chapterId: string, passageIds: string[]): Promise<DawResult>;
  dawUnstackTakes(chapterId: string, passageIds: string[]): Promise<DawResult>;
}

/** DawSplitTake (SN-E94; src/studio/desktop/bindings_daw_split.go): cut `takeId`, a take of the chapter that reads its line twice, into two
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

/** DawReduceRangeGain (SN-E100; src/studio/desktop/bindings_daw_reduce_range_gain.go): lower `stretches` of `takeId`, a take of the chapter, by
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

/** DawRepairClick (SN-E101; src/studio/desktop/bindings_daw_repair_click.go): smooth `clicks` in `takeId`, a take of the chapter, in one undo
 * step of the DAW's own: Clean up's Clicks. `takeId` is the take's id as the DAW reports it on the chapter's linked track now: the host
 * looks it up there, checks every click (1 to 500, each at most 50 ms) is inside the part of the file the take plays, and sends the item
 * and take it read itself. A capability refusal carries the `click_repair` capability's sentence; clicks out of bounds are refused with
 * a sentence; a take the track no longer holds, a click outside it and a take that changed since the host read it are code `stale`. */
export interface DawRepairClickApi {
  dawRepairClick(chapterId: string, takeId: string, clicks: DawClick[]): Promise<DawResult>;
}

/** A kind of app action whose undo point the DAW can tell from any other (dawport.ActionKind): what `dawLastAction` reads and
 * `dawUndoLast` undoes. `cut_range` is a cut made with `dawDeleteRange`; `record_take` is the take the Booth recorded last (the points
 * its stop reported as `undoPoints`). The host and the DAW map a kind to the DAW's own mark for it; the page never names one. A closed
 * union: a later kind is added on both sides. */
export type DawActionKind = 'cut_range' | 'record_take' | 'replace_range' | 'restore_replacement';

/** The action kinds this build knows, in the order of DawActionKind. */
export const DAW_ACTION_KINDS = ['cut_range', 'record_take', 'replace_range', 'restore_replacement'] as const satisfies readonly DawActionKind[];

/** What `dawLastAction` answers of the DAW's next undo point for a kind (dawport.LastAction): `this` when it is that kind's, `other`
 * when it is anything else or there is none, `unknown` when the DAW cannot tell (the `undo_last` capability refused, the DAW not
 * answering). */
export type DawLastAction = 'this' | 'other' | 'unknown';

export const DAW_LAST_ACTIONS = ['this', 'other', 'unknown'] as const satisfies readonly DawLastAction[];

/** DawLastAction and DawUndoLast (#1711; src/studio/desktop/bindings_daw_undo_last.go): read and undo the app's own last action in the DAW's own
 * undo history, so the page's Undo reaches it (docs/architecture/ui-state-and-journal.md#the-journal-and-undo). */
export interface DawUndoLastApi {
  /** Whether the DAW's next undo point is the app's action of `kind`. It never changes the project; a capability refusal, a DAW not
   * answering and no live DAW are `unknown`. A kind the host does not know rejects. */
  dawLastAction(kind: DawActionKind): Promise<DawLastAction>;
  /** Undo `steps` (1 to DAW_RESULT_MAX_UNDO_STEPS) consecutive undo points of the app's action of `kind` from the top of the DAW's own
   * history, one at a time, never one of any other action. All undone: `ok`, `changed`, "Undid the cut in REAPER.". The top point not
   * `kind`'s: refused with nothing changed, "<DAW>'s last action is not this one, so it was left alone. Use Edit > Undo in <DAW>.".
   * Stopped part way at another action: `ok`, `changed`, and the message says how many were undone and that the rest need Edit > Undo.
   * `undoSteps` is always 0: it counts undo points a call adds, and an undo adds none, so how many were undone is in the message only.
   * A capability refusal carries the `undo_last` capability's sentence; steps out of bounds and the DAW recording are refused with a
   * sentence. A kind the host does not know rejects. */
  dawUndoLast(kind: DawActionKind, steps: number): Promise<DawResult>;
}

/** What `dawMonitorLevel` and `dawSetMonitorLevel` answer (src/studio/desktop/bindings_daw_levels.go): the DAW's monitor (output) level as the page's
 * 0 to 100 slider shows it, 70 being unity. `ok` false is a refusal with its sentence in `message` (the `monitor_level` capability's own, a DAW
 * not answering, no live DAW) and `level` 0 that means nothing; `ok` true has an empty `message`. */
export type DawMonitorLevel = { ok: boolean; level: number; message: string };

/** The slider's top (its bottom is 0); 70 is unity gain (0 dB) in the DAW. */
export const DAW_LEVEL_MAX = 100;

/** DawMonitorLevel and DawSetMonitorLevel (Booth pass 3; src/studio/desktop/bindings_daw_levels.go): read and set the DAW's monitor (output)
 * level, the Levels menu's second slider. The first (the input level) has no call: no DAW the app talks to can set an audio interface's
 * input gain, and the `input_level` capability says so in its own sentence. */
/** What `dawMeters` answers (src/studio/desktop/bindings_daw_meters.go): what the DAW's own meters show, in dBFS (-100 is silence, over 0 is
 * possible). `output` is the level it plays out at; `input` the first record-armed track's, with its name, or null when no track is armed (the
 * read arms nothing). `ok` false is a refusal with its sentence in `message`, and `reason` is the capability's own when the resolver refused it. */
export type DawMeters =
  | { ok: true; output: number; input: number | null; inputTrack: string; message: ''; reason: '' }
  | { ok: false; output: 0; input: null; inputTrack: ''; message: string; reason: DawCapabilityReason | '' };

/** The level a meter answers for silence, in dBFS. */
export const DAW_METER_FLOOR_DB = -100;

export interface DawLevelsApi {
  /** The monitor level the DAW holds. A capability refusal, a DAW not answering and no live DAW are `ok` false with the sentence. */
  dawMonitorLevel(): Promise<DawMonitorLevel>;
  /** Sets it (0 to DAW_LEVEL_MAX) and answers the level the DAW now holds, which may differ by rounding. A level outside the range rejects. */
  dawSetMonitorLevel(level: number): Promise<DawMonitorLevel>;
  /** The DAW's own pre-roll before a punched take (`punch_preroll`), which the Booth punches with; read only, as the narrator sets it in the DAW. A
   * capability refusal, a DAW not answering and no live DAW are `ok` false with the sentence. */
  dawPunchPreroll(): Promise<DawPunchPreroll>;
  /** What the DAW's meters show now (`daw_meters`); reads only. A refusal is `ok` false with the sentence. */
  dawMeters(): Promise<DawMeters>;
}

/** What `dawPunchPreroll` answers (src/studio/desktop/bindings_daw_preroll.go): whether the DAW plays its pre-roll before it records,
 * the length in measures (REAPER starts from the bar line at or before the cursor minus that many), and one measure in seconds at the edit cursor.
 * `ok` false is a refusal with its sentence in `message`, and the numbers mean nothing; `ok` true has an empty `message`. */
export type DawPunchPreroll = { ok: boolean; onRecord: boolean; measures: number; measureSeconds: number; message: string };

/** What `dawPlace` answers (src/studio/desktop/bindings_daw_place.go): where the narrator is in the DAW project, so the Booth can open there. `ok` false is
 * a refusal with its sentence in `message` (the `follow_position` capability's own, a DAW not answering, no live DAW) and nothing else means anything;
 * `ok` true has an empty `message`. `chapterId` is the chapter whose linked track is the one selected in the DAW, and '' when no track, several
 * tracks or a track no chapter is linked to is selected. `selected` is how many tracks are selected and `cursor` the DAW's cursor in project seconds. */
export type DawPlace = { ok: boolean; message: string; chapterId: string; selected: number; cursor: number };

/** Where `dawGoToChapter` puts the cursor on the chapter's track: `end` (the end of what is recorded; `seconds` is ignored) or `at` (`seconds` into the project). */
export type DawGoToWhere = 'end' | 'at';

/** DawPlace and DawGoToChapter (src/studio/desktop/bindings_daw_place.go): read which chapter's track the narrator is on in the DAW and where their cursor is, and
 * take the DAW there. The page names a chapter, never a track: the host holds the chapter-track links, and the same calls serve any DAW with the
 * `follow_position` capability. Neither plays, seeks or adds an undo step. */
export interface DawPlaceApi {
  /** The narrator's place in the DAW. A capability refusal, a DAW not answering and no live DAW are `ok` false with the sentence. */
  dawPlace(): Promise<DawPlace>;
  /** Select the chapter's linked track in the DAW and put its cursor at `where`. A time that is not a finite, non-negative number of seconds, a
   * chapter with no or several linked tracks, a track the DAW no longer has and a refused capability are refused with nothing moved. */
  dawGoToChapter(chapterId: string, where: DawGoToWhere, seconds: number): Promise<DawResult>;
}

/** What `daw_position_changed` carries (src/studio/desktop/bindings_daw_transportsync.go): the DAW's play state, play head and edit cursor in project seconds
 * as its last streamed position said, and whether the DAW has this book's project open (a position of another project must not move the page). It is
 * pushed only while the page holds a `watch` lease: on a play-state change or a cursor move, and about four times a second while the DAW plays. */
export type DawPosition = {
  playing: boolean;
  recording: boolean;
  playPosition: number;
  editCursor: number;
  sameProject: boolean;
};

/** One media item of the chapter's track as the DAW has it now: where it plays in the project, from where in which source file, at what rate.
 * `sourceFile` is empty for an item with no audio take. */
export type DawLiveItem = {
  guid: string;
  sourceFile: string;
  position: number;
  length: number;
  sourceStart: number;
  playRate: number;
  muted: boolean;
};

/** DawLiveItems' answer. `available` is false, with no items, when the DAW cannot be read now (not running, `track_state` off, no linked track, the
 * track gone or longer than one read lists): the Editing page then follows by the items the saved project had. The read is never an error. */
export type DawLiveItems = { available: boolean; items: DawLiveItem[] };

/** The actions `dawTransportSync` takes: put the DAW's cursor at `seconds`, play from `seconds`, play the stretch `seconds` to `until` and have the DAW
 * stop itself at `until` (`playRange`), stop, and take or renew the lease on the position stream (`seconds` is ignored by the last two, `until` by all
 * but `playRange`). */
export type DawSyncAction = 'cursor' | 'play' | 'playRange' | 'stop' | 'watch';

/** DawTransportSync and the daw_position_changed event (src/studio/desktop/bindings_daw_transportsync.go): the Editing page and the DAW's transport follow
 * each other, behind the `transport_sync` capability (docs/design/editing-daw-transport-sync.md). A refusal (the capability's own sentence, a DAW with
 * another project open, a recording, a time that is not usable) is `ok` false with the sentence and nothing changed; none adds an undo step. */
export interface DawTransportSyncApi {
  dawTransportSync(action: DawSyncAction, seconds: number, until?: number): Promise<DawResult>;
  /** The media items on the chapter's linked track as the DAW has them now (DawLiveItems, src/studio/desktop/bindings_daw_liveitems.go). */
  dawLiveItems(chapterId: string): Promise<DawLiveItems>;
  /** Each position the DAW streams while a `watch` lease holds. Returns the unsubscribe. */
  subscribeDawPosition(onUpdate: (position: DawPosition) => void): () => void;
}

/** DawBackupAround, DawRestoreBackup and DawBackups (SN-D82, docs/reference/daw/audacity-3.md; src/studio/desktop/bindings_daw_backups.go): clone the audio around a
 * chapter's words before an edit, put a backup back, and list the backups. The page sends a chapter id, two token indices and the label
 * the list shows, or a backup id DawBackups listed; the host resolves the words' times and the chapter's track itself, and the DAW adds
 * the narrator's window either side. A capability refusal carries the capability's sentence; a backup changes no audio (`changed:
 * false`); an id the table does not have is refused with `changed: false`. DawBackups reads the table only, newest first. */
export interface DawBackupsApi {
  dawBackupAround(chapterId: string, firstToken: number, lastToken: number, label: string): Promise<DawResult>;
  dawRestoreBackup(backupId: string): Promise<DawResult>;
  dawBackups(): Promise<DawBackupsFile>;
}

/** DawPreviewFileRange, DawStopFilePreview and DawRevealFile (SN-B98; src/studio/desktop/bindings_daw_files.go): play `length` seconds (at
 * most 60) of a file on disk from `start`, in the file's own seconds, stop that preview, and show a file in the DAW's own file browser,
 * all leaving the project unchanged (no undo step). The path is one the host's measurement result named: the host plays or shows only a
 * file the narrator picked to measure in this session, and only an absolute local path to an audio file that is there. A capability
 * refusal carries the capability's sentence; a path or stretch the host refuses, and a refusal the DAW answers, carry a sentence. */
export interface DawFilesApi {
  dawPreviewFileRange(path: string, start: number, length: number): Promise<DawResult>;
  dawStopFilePreview(): Promise<DawResult>;
  dawRevealFile(path: string): Promise<DawResult>;
}

/** MasterPlayQuietest and MasterOpenInDaw (SN-M97; src/studio/desktop/bindings_master_files.go): Master & QC's Play the quietest 5 s and Open
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

/** The most rows `<app>/backups.json` holds (`audacity.MaxBackups`). */
export const DAW_BACKUPS_MAX = 500;

/** One row of the Audacity backups table (SN-D81, docs/reference/daw/audacity-3.md; src/studio/desktop/internal/dawport/audacity/backups_store.go): a window of a
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

/** `<app>/backups.json` in the app's project folder. */
export type DawBackupsFile = {
  schemaVersion: number;
  backups: DawBackup[];
};
