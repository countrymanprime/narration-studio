// The mock's DAW port capabilities: a stand-in for the host's dawport.Resolver, over the same
// three inputs (a declaration per DAW kind, the narrator's per-capability toggles, and reachability) and the same
// refusal order (declaration, then toggle, then what a capability requires, then runtime) as
// apps/desktop/internal/dawport/resolver.go. It is stateful like the host: a saved setting, an engine choice, a launch, a
// heartbeat that stops or returns, and a take each change the picture and push it (daw_capabilities_changed,
// daw_transport_changed), and `DawMockControl` lets a test or a Playwright driver play REAPER's side (`?mockDaw=`, window.__NARRATION_MOCK_DAW__).
import type {
  DawCapabilities,
  DawCapabilityKey,
  DawCapabilityLevel,
  DawCapabilityMode,
  DawCapabilitySupport,
  DawCapabilitiesApi,
  DawKind,
  DawLevelsApi,
  DawPlaceApi,
  DawResult,
  DawMonitorLevel,
  DawProjectState,
  DawProjectStateApi,
  DawTransport,
} from './contracts/daw';
import { DAW_CAPABILITIES, DAW_LEVEL_MAX } from './contracts/daw';
import { wireClone } from './mockFixtures';

/** Mirrors dawport.Needs (capability.go): what a capability needs from the running engine before it can be used. */
type DawMockNeeds = 'running' | 'bridge' | 'nothing';

/** REAPER's declaration (apps/desktop/internal/dawport/reaper/reaper.go's `declares`): today's behaviour exactly. */
const REAPER_DECLARATION: Record<DawCapabilityKey, DawCapabilityLevel> = {
  review: 'supported',
  navigate: 'supported',
  markers: 'supported',
  pickups: 'supported',
  line_identity: 'supported',
  render_config: 'supported',
  cleanup_tools: 'supported',
  retake_lanes: 'supported',
  project_state: 'supported',
  take_create: 'supported',
  heartbeat: 'supported',
  project_read: 'supported',
  track_state: 'experimental',
  track_select: 'experimental',
  follow_position: 'experimental',
  record: 'experimental',
  punch: 'experimental',
  regions: 'experimental',
  takes: 'experimental',
  fx_chains: 'experimental',
  item_gain: 'experimental',
  render_with_fx: 'experimental',
  master_chain_read: 'experimental',
  macro_render: 'unsupported',
  cut_range: 'experimental',
  fx_range: 'experimental',
  stack_takes: 'experimental',
  backups: 'not_yet_available',
  file_preview: 'experimental',
  file_reveal: 'experimental',
  range_gain: 'experimental',
  click_repair: 'experimental',
  undo_last: 'experimental',
  monitor_level: 'experimental',
  // No DAW the app talks to can set an audio interface's input gain.
  input_level: 'unsupported',
};

const CAPABILITY_NEEDS: Record<DawCapabilityKey, DawMockNeeds> = {
  review: 'running',
  navigate: 'running',
  markers: 'running',
  pickups: 'running',
  line_identity: 'running',
  render_config: 'running',
  cleanup_tools: 'running',
  retake_lanes: 'running',
  project_state: 'running',
  take_create: 'running',
  heartbeat: 'bridge',
  project_read: 'nothing',
  track_state: 'running',
  track_select: 'running',
  follow_position: 'running',
  record: 'running',
  punch: 'running',
  regions: 'running',
  takes: 'running',
  fx_chains: 'running',
  item_gain: 'running',
  render_with_fx: 'running',
  master_chain_read: 'running',
  macro_render: 'running',
  cut_range: 'running',
  fx_range: 'running',
  stack_takes: 'running',
  backups: 'running',
  file_preview: 'running',
  file_reveal: 'running',
  range_gain: 'running',
  click_repair: 'running',
  undo_last: 'running',
  monitor_level: 'running',
  input_level: 'running',
};

const MESSAGE_NO_INPUT_LEVEL = (who: string) => `${who} cannot set an audio interface's input gain. Set it in your interface's own control panel.`;

/** The host's own wording for a REAPER that is not connected or not answering, and the resolver's generic wording for
 * every other refusal (apps/desktop/internal/dawport/resolver.go, apps/desktop/internal/dawport/reaper/reaper.go). */
const MESSAGE_STANDALONE_REAPER = 'REAPER is not connected to this app. Open this app from the Narration Studio action in REAPER.';
const MESSAGE_NOT_RUNNING_REAPER = 'REAPER is not answering. Check that REAPER is open and the Narration Studio action is running, then try again.';
const MESSAGE_NO_ENGINE = 'No DAW is connected to this app. Open this app from your DAW to use it.';
const MESSAGE_TURNED_OFF = 'Turned off in Settings.';
const MESSAGE_EXPERIMENTAL_OFF = 'Experimental: switched off in Settings.';
/** An Audacity capability while the project does not record with Audacity, so the host holds no pipe to it (
 * apps/desktop/internal/dawport/audacity/audacity.go's Declaration). */
const MESSAGE_AUDACITY_NOT_CONNECTED = "Audacity isn't connected to this project. Choose Audacity under Record with in Settings, then follow its steps.";
/** The Audacity adapter over its pipe, when the pipe is missing or silent (audacity.go's messageNotReachable). */
const MESSAGE_AUDACITY_NOT_REACHABLE =
  'Audacity is not answering. Open the Audacity chip at the top for the steps: Audacity 3 must be open with scripting turned on (Audacity 4.0 has no scripting pipe).';
/** What Audacity has only with its backups on, and the words its refusal starts with (audacity.go's needBackups, SN-D83). */
const AUDACITY_NEED_BACKUPS: Partial<Record<DawCapabilityKey, string>> = {
  takes: 'Keeping takes',
  punch: 'Rolling without losing the earlier audio',
  stack_takes: 'Stacking takes',
  cut_range: 'Cutting words and their audio',
  fx_range: 'Adding an effect to words',
  range_gain: 'Lowering stretches of a take',
  click_repair: 'Repairing clicks in a take',
};
const AUDACITY_NEED_BACKUPS_KEYS: readonly DawCapabilityKey[] = ['takes', 'punch', 'stack_takes', 'cut_range', 'fx_range', 'range_gain', 'click_repair'];
/** What the Audacity adapter declares Experimental until the owner's verification pass (docs/reference/daw/audacity-3.md for backups, SN-D83 for
 * the rows that need backups); the rest is not_yet_available. */
const AUDACITY_EXPERIMENTAL: ReadonlySet<DawCapabilityKey> = new Set<DawCapabilityKey>([
  'review',
  'pickups',
  'project_read',
  'track_state',
  'track_select',
  'follow_position',
  'regions',
  'navigate',
  'markers',
  'macro_render',
  'backups',
  ...AUDACITY_NEED_BACKUPS_KEYS,
]);
/** Audacity's Describer (audacity.go's depth): a roll replaces audio until backups keep it, and the edits are made in steps. */
const AUDACITY_DEPTH: Partial<Record<DawCapabilityKey, { destructive?: boolean; mode?: DawCapabilityMode }>> = {
  punch: { destructive: true },
  stack_takes: { mode: 'steps' },
  cut_range: { mode: 'steps' },
  fx_range: { mode: 'steps' },
  range_gain: { mode: 'steps' },
  click_repair: { mode: 'steps' },
};
/** The built-in recorder's sentences (apps/desktop/internal/dawport/builtin/builtin.go). */
const MESSAGE_BUILTIN_UNSUPPORTED = 'Not available with the built-in recorder.';
const MESSAGE_BUILTIN_NOT_YET = 'Not available with the built-in recorder yet.';
const MESSAGE_BUILTIN_NO_SAVED_PROJECT = 'The built-in recorder keeps no saved project.';
/** What the built-in recorder declares (dawport/builtin): record, takes (the others hidden, never deleted) and cut_range (an edit
 * list the recorder plays and exports past, mode `app`) Experimental until the owner's pass, punch and the edits the app has not
 * built yet not available, everything else unsupported. */
const BUILTIN_EXPERIMENTAL: ReadonlySet<DawCapabilityKey> = new Set<DawCapabilityKey>(['record', 'takes', 'cut_range']);
const BUILTIN_NOT_YET: ReadonlySet<DawCapabilityKey> = new Set<DawCapabilityKey>(['punch', 'fx_range', 'stack_takes', 'undo_last']);
/** The built-in recorder's Describer (builtin.go's depthOf): the app makes a cut itself. */
const BUILTIN_DEPTH: Partial<Record<DawCapabilityKey, { destructive?: boolean; mode?: DawCapabilityMode }>> = { cut_range: { mode: 'app' } };

type DawToggle = 'auto' | 'on' | 'off';

export type DawMockSeed = {
  /** Which DAW the launch is talking to; defaults to 'REAPER'. */
  daw?: DawKind;
  /** Whether there is a live REAPER file bridge at all (dawport.Runtime.Bridge); defaults to true for 'REAPER',
   * ignored for 'none' and for 'Built-in' (the app's own recorder, always there). For 'Audacity' it defaults to false (the host
   * opens no pipe from a page yet, audacity.Declaration), and true is the adapter over its pipe (audacity.New).
   * false models "REAPER declared but not connected":
   * every NeedsBridge/NeedsRunning capability answers 'standalone', the same message as no DAW at all. */
  connected?: boolean;
  /** Whether the connected bridge is answering (dawport.Runtime.Reachable, the heartbeat); defaults to `connected`'s
   * value. false models a connected-but-stale REAPER (closed without the app noticing yet): every NeedsRunning
   * capability answers 'not_running', but the heartbeat capability itself (NeedsBridge only) stays available - its
   * whole job is reporting this. */
  reachable?: boolean;
  /** The narrator's per-capability toggle, by key; a key left out is 'auto'. */
  toggles?: Partial<Record<DawCapabilityKey, DawToggle>>;
  /** The old DAW.experimental_reaper_actions switch: while true, every Experimental capability left on 'auto' is on. */
  experimentalOn?: boolean;
  /** What the adapter declares about how a capability acts (dawport.Describer), by key; reported on every answer for the
   * key, available or not. A key left out takes the engine's own declaration (REAPER_DEPTH), as the host goldens do. */
  depth?: Partial<Record<DawCapabilityKey, { destructive?: boolean; mode?: DawCapabilityMode }>>;
  /** The transport daw_transport_changed reports; defaults to stopped. Only a connected, reachable
   * REAPER reports one: every other seed is stopped whatever this says, as the host's is with no heartbeat to read. */
  transport?: DawTransport;
  /** The saved project's time DawProjectState reports (a local date-time to the minute); defaults to null, never saved. Like
   * the transport, only a connected, reachable REAPER with the heartbeat capability on reports it. */
  savedAt?: string | null;
  /** Whether REAPER has edits its saved file does not have; reported only with a `savedAt`, as the host's is. */
  unsavedChanges?: boolean;
};

function declarationFor(daw: DawKind): Record<string, DawCapabilityLevel> {
  if (daw === 'REAPER') return REAPER_DECLARATION;
  if (daw === 'Audacity') {
    return Object.fromEntries(
      DAW_CAPABILITIES.map(({ key }) => [
        key,
        key === 'input_level' ? ('unsupported' as const) : AUDACITY_EXPERIMENTAL.has(key) ? ('experimental' as const) : ('not_yet_available' as const),
      ]),
    );
  }
  if (daw === 'Built-in') {
    return Object.fromEntries(
      DAW_CAPABILITIES.map(({ key }) => [
        key,
        BUILTIN_EXPERIMENTAL.has(key) ? ('experimental' as const) : BUILTIN_NOT_YET.has(key) ? ('not_yet_available' as const) : ('unsupported' as const),
      ]),
    );
  }
  return Object.fromEntries(DAW_CAPABILITIES.map(({ key }) => [key, 'unsupported' as const]));
}

function explain(daw: DawKind, key: DawCapabilityKey, reason: DawCapabilitySupport['reason'], pipe = false): string {
  // The one thing no engine can do, and the way out: the narrator's own audio interface sets its input gain.
  if (key === 'input_level' && reason === 'unsupported' && daw !== 'none') return MESSAGE_NO_INPUT_LEVEL(daw === 'Built-in' ? 'The built-in recorder' : daw);
  if (daw === 'Audacity') {
    if (reason === 'not_yet') return `${DAW_CAPABILITIES.find((row) => row.key === key)?.label ?? key} is not available with Audacity yet.`;
    if (reason === 'standalone' || reason === 'not_running') return pipe ? MESSAGE_AUDACITY_NOT_REACHABLE : MESSAGE_AUDACITY_NOT_CONNECTED;
  }
  if (daw === 'Built-in') {
    if (reason === 'unsupported') return key === 'project_read' ? MESSAGE_BUILTIN_NO_SAVED_PROJECT : MESSAGE_BUILTIN_UNSUPPORTED;
    if (reason === 'not_yet') return MESSAGE_BUILTIN_NOT_YET;
  }
  if (daw === 'REAPER') {
    if (reason === 'standalone') return MESSAGE_STANDALONE_REAPER;
    if (reason === 'not_running') return MESSAGE_NOT_RUNNING_REAPER;
  }
  switch (reason) {
    case 'standalone':
      return MESSAGE_NO_ENGINE;
    case 'turned_off':
      return MESSAGE_TURNED_OFF;
    case 'experimental_off':
      return MESSAGE_EXPERIMENTAL_OFF;
    case 'not_yet':
      return `${DAW_CAPABILITIES.find((c) => c.key === key)?.label ?? key} is not available with ${daw} yet.`;
    default:
      return `${DAW_CAPABILITIES.find((c) => c.key === key)?.label ?? key} is not something ${daw} can do.`;
  }
}

const labelOf = (key: DawCapabilityKey): string => DAW_CAPABILITIES.find((c) => c.key === key)?.label ?? key;

/** What `key` requires on this DAW (dawport.Requirer): backups, for each row Audacity has only with them. */
function requiresOf(daw: DawKind, key: DawCapabilityKey, trail: DawCapabilityKey[]): DawCapabilityKey[] {
  const needs: DawCapabilityKey[] = daw === 'Audacity' && AUDACITY_NEED_BACKUPS[key] ? ['backups'] : [];
  return needs.filter((need) => need !== key && !trail.includes(need));
}

/** A refusal of `key` because `required` is refused: the same reason, in the adapter's sentence or the resolver's (resolver.go's
 * refuseFor). */
function refuseFor(
  daw: DawKind,
  key: DawCapabilityKey,
  level: DawCapabilityLevel,
  required: DawCapabilityKey,
  refused: DawCapabilitySupport,
): DawCapabilitySupport {
  const reason = refused.reason;
  const what = daw === 'Audacity' && required === 'backups' ? AUDACITY_NEED_BACKUPS[key] : undefined;
  const message =
    what && (reason === 'turned_off' || reason === 'experimental_off')
      ? `${what} needs Audacity backups. Turn on Audio backups in Settings.`
      : `${labelOf(key)} needs ${labelOf(required)}. ${refused.message ?? ''}`;
  return { level, available: false, reason, message };
}

type Mock = { daw: DawKind; seed: DawMockSeed; connected: boolean; reachable: boolean };

/** The declared depth of `key`: the seed's, else the engine's own. */
function depthOf(m: Mock, key: DawCapabilityKey): { destructive?: boolean; mode?: DawCapabilityMode } | undefined {
  const declared = m.daw === 'REAPER' ? REAPER_DEPTH : m.daw === 'Audacity' ? AUDACITY_DEPTH : m.daw === 'Built-in' ? BUILTIN_DEPTH : {};
  return m.seed.depth?.[key] ?? declared[key];
}

/** The declaration and settings checks, then each requirement's (resolver.go's permitted); null when they permit `key`. */
function permitted(m: Mock, key: DawCapabilityKey, trail: DawCapabilityKey[]): DawCapabilitySupport | null {
  const { daw, seed } = m;
  const pipe = m.connected;
  const level = declarationFor(daw)[key] ?? 'unsupported';
  if (level === 'unsupported') {
    // No engine at all (resolver.go's Adapter == nil) is 'standalone'; a launched engine that simply cannot do this (macro_render
    // for REAPER) is 'unsupported', checked before connection state, the same order the declaration check runs in.
    const reason = daw === 'none' ? 'standalone' : 'unsupported';
    return { level, available: false, reason, message: explain(daw, key, reason, pipe) };
  }
  if (level === 'not_yet_available') return { level, available: false, reason: 'not_yet', message: explain(daw, key, 'not_yet', pipe) };
  const toggle = seed.toggles?.[key] ?? 'auto';
  if (toggle === 'off') return { level, available: false, reason: 'turned_off', message: explain(daw, key, 'turned_off', pipe) };
  if (toggle !== 'on' && level === 'experimental' && !seed.experimentalOn) {
    return { level, available: false, reason: 'experimental_off', message: explain(daw, key, 'experimental_off', pipe) };
  }
  if (!depthOf(m, key)?.destructive) {
    for (const required of requiresOf(daw, key, trail)) {
      const refused = permitted(m, required, [...trail, key]);
      if (refused) return refuseFor(daw, key, level, required, refused);
    }
  }
  return null;
}

/** Without depth: resolver.go's support. */
function bareSupport(m: Mock, key: DawCapabilityKey, trail: DawCapabilityKey[]): DawCapabilitySupport {
  const refused = permitted(m, key, trail);
  if (refused) return refused;
  const { daw } = m;
  const level = declarationFor(daw)[key] ?? 'unsupported';
  const needs = CAPABILITY_NEEDS[key];
  if (needs !== 'nothing' && !m.connected) return { level, available: false, reason: 'standalone', message: explain(daw, key, 'standalone', m.connected) };
  if (needs === 'running' && !m.reachable) return { level, available: false, reason: 'not_running', message: explain(daw, key, 'not_running', m.connected) };
  if (!depthOf(m, key)?.destructive) {
    for (const required of requiresOf(daw, key, trail)) {
      const s = bareSupport(m, required, [...trail, key]);
      if (!s.available) return refuseFor(daw, key, level, required, s);
    }
  }
  return { level, available: true };
}

/** `key`'s support with its depth: a destructive capability is safe while everything it requires is available (withDepth). */
function supportFor(m: Mock, key: DawCapabilityKey): DawCapabilitySupport {
  const declared = depthOf(m, key);
  const requires = requiresOf(m.daw, key, []);
  const safe = requires.length > 0 && requires.every((required) => bareSupport(m, required, [key]).available);
  const depth = declared?.destructive && safe ? { ...declared, destructive: false } : declared;
  return withDepth(bareSupport(m, key, []), depth);
}

/** REAPER's Describer (dawport/reaper's depthOf): a roll keeps the earlier audio as a take, a cut moves the audio to the
 * muted Cuts track, a chain on a range is take FX on a split piece that come off again, and a stack makes later reads takes and
 * moves their items to the Cuts track, so punch, cut_range, fx_range and stack_takes are native and not destructive (docs/reference/daw/capabilities.md
 * points 1 to 4). Audacity's is AUDACITY_DEPTH. */
const REAPER_DEPTH: Partial<Record<DawCapabilityKey, { destructive?: boolean; mode?: DawCapabilityMode }>> = {
  punch: { mode: 'native' },
  cut_range: { mode: 'native' },
  fx_range: { mode: 'native' },
  stack_takes: { mode: 'native' },
  range_gain: { mode: 'native' },
  click_repair: { mode: 'native' },
};

/** Like the host's payload, `destructive` only when true and `mode` only when set. */
function withDepth(support: DawCapabilitySupport, depth: { destructive?: boolean; mode?: DawCapabilityMode } | undefined): DawCapabilitySupport {
  return { ...support, ...(depth?.destructive ? { destructive: true } : {}), ...(depth?.mode ? { mode: depth.mode } : {}) };
}

function currentCapabilities(seed: DawMockSeed): DawCapabilities {
  const daw = seed.daw ?? 'REAPER';
  // The built-in recorder is part of the app: always there and answering (builtin.go's Runtime).
  const connected = daw === 'Built-in' || (daw === 'REAPER' && (seed.connected ?? true)) || (daw === 'Audacity' && (seed.connected ?? false));
  const reachable = daw === 'Built-in' || (connected && (seed.reachable ?? true));
  const capabilities: Record<string, DawCapabilitySupport> = {};
  const mock: Mock = { daw, seed, connected, reachable };
  for (const { key } of DAW_CAPABILITIES) {
    capabilities[key] = supportFor(mock, key);
  }
  return { daw, reachable, capabilities };
}

/** Whether the transport can be read: a DAW through its heartbeat, the built-in recorder through the recorder itself (bindings_daw_transport.go). */
const hearsTransport = (capabilities: DawCapabilities): boolean => capabilities.daw === 'Built-in' || !!capabilities.capabilities.heartbeat?.available;

function currentTransport(seed: DawMockSeed, capabilities: DawCapabilities): DawTransport {
  if (!capabilities.reachable || !hearsTransport(capabilities) || !seed.transport) return { playing: false, recording: false };
  const { playing, recording, position } = seed.transport;
  // The built-in recorder only records, and keeps no timeline to report a position from (bindings_daw_transport.go).
  if (capabilities.daw === 'Built-in') return { playing: false, recording };
  return playing || recording ? { playing, recording, ...(position === undefined ? {} : { position }) } : { playing, recording };
}

/** Like the host's: idle without a heartbeat to read, and the position only while playing or recording. */
function currentProjectState(seed: DawMockSeed, capabilities: DawCapabilities, transport: DawTransport): DawProjectState {
  if (!capabilities.reachable || !hearsTransport(capabilities)) {
    return { savedAt: null, unsavedChanges: false, playState: 'stopped', playPosition: 0 };
  }
  // The built-in recorder keeps no saved project: nothing is saved and nothing is unsaved (bindings_daw_projectstate.go).
  const keepsProject = capabilities.daw !== 'Built-in';
  const savedAt = keepsProject ? (seed.savedAt ?? null) : null;
  const playState = transport.recording ? 'recording' : transport.playing ? 'playing' : 'stopped';
  return {
    savedAt,
    unsavedChanges: savedAt !== null && (seed.unsavedChanges ?? false),
    playState,
    playPosition: playState === 'stopped' ? 0 : (transport.position ?? 0),
  };
}

/** How the scripted mock DAW behaves when the app starts it (`?mockDaw=`): the owner's sequence, and each way it can go wrong.
 * `live` answers its heartbeat a moment after the launch; `late` answers after 8 s; `quiet` opens the bridge but never answers;
 * `different` answers with another project open; `refuse` fails the launch; `restart` answers, then goes quiet and returns on its own;
 * `busy` starts REAPER but the app is busy, so the project it hands over is refused (the host's `system:attached` with a reason). */
export type DawMockScript = 'live' | 'late' | 'quiet' | 'different' | 'refuse' | 'restart' | 'busy';
export const DAW_MOCK_SCRIPTS: readonly DawMockScript[] = ['live', 'late', 'quiet', 'different', 'refuse', 'restart', 'busy'];

/** What a page, a test or a Playwright driver can do to the mock DAW from outside, as REAPER's own user and the OS could. */
export interface DawMockControl {
  /** The app started the DAW (the launcher ran): the script decides what the heartbeat does next. Rejects for `refuse`; answers `busy` when the
   * app turns the launch's project away because it is busy. */
  launch(): Promise<'started' | 'busy'>;
  /** The narrator ran the launcher action inside the DAW by hand: the bridge opens and answers. */
  connect(): void;
  /** The DAW answers its heartbeat now (and has the linked project open unless `openProject` said otherwise). */
  heartbeat(): void;
  /** The DAW goes quiet (killed, frozen, closed): no heartbeat, the transport unknown. A take that was running is over. */
  quiet(): void;
  /** The DAW goes quiet and answers again after `ms`. */
  restart(ms?: number): void;
  /** Which project the DAW has open: the linked one, another, or none. */
  openProject(which: 'linked' | 'other'): void;
  /** The narrator linked a project file through the picker, which offers the project the DAW has open: that is the linked one now. */
  linkedOpenProject(): void;
  /** The narrator pressed Stop inside the DAW. */
  stopInDaw(): void;
  /** The next monitor-level call fails with this sentence (the DAW did not take the change), as a bridge that answers an error would. */
  refuseNextLevel(sentence: string): void;
  /** Where the narrator is in the DAW: the chapter whose track is selected ('' for none or several) and the cursor in project seconds. */
  setPlace(chapterId: string, cursor: number): void;
  /** The moves the app asked the DAW to make (`dawGoToChapter`), oldest first, for a driver to assert on. */
  moves(): { chapterId: string; where: 'end' | 'at'; seconds: number }[];
  /** The narrator pressed Record inside the DAW: a take this app did not start. */
  startInDaw(): void;
  /** Whether the DAW is recording, whoever started it (the host's `recording_elsewhere` is true for the app's own take too). */
  recording(): boolean;
  /** While true, events (capabilities, transport, project state) are not delivered; reads still answer. */
  dropEvents(on: boolean): void;
  /** The next record start (or stop) is refused with this sentence, as a full disk or a locked file would. */
  refuseNextRecord(sentence: string, kind?: 'start' | 'stop'): void;
  /** What the mock DAW holds now, for a driver to assert on. */
  state(): {
    daw: DawKind;
    bridge: boolean;
    reachable: boolean;
    openProject: 'linked' | 'other';
    recording: boolean;
    monitorLevel: number;
    toggles: Partial<Record<DawCapabilityKey, DawToggle>>;
  };
  /** A setting the host saved (`saveSettings`): the capability toggles and the Experimental switch. */
  settingsSaved(tool: string, values: Record<string, string | null>): void;
  /** The project's recording engine changed (`recorderChooseEngine`). */
  engineChosen(engine: 'daw' | 'builtin'): void;
  /** A record start or stop as the host answers it: a refusal sentence and its reason, or null once the transport changed. */
  record(kind: 'start' | 'stop'): { reason: 'standalone' | 'experimental_off' | 'unlinked' | 'unavailable'; message: string } | null;
  /** The facts the host puts in bootstrap. */
  facts(): { reachable: boolean; projectMatches: boolean; bridge: boolean };
}

export type DawMock = DawCapabilitiesApi & DawProjectStateApi & DawLevelsApi & DawPlaceApi & { control: DawMockControl };

/** How long after a record start or stop the DAW's next heartbeat reports it: the host pushes the transport on a tick, never inside the call. */
const HEARTBEAT_MS = 250;

const LAUNCH_MS: Record<DawMockScript, number> = { live: 1200, late: 8000, quiet: 0, different: 1200, refuse: 0, restart: 1200, busy: 0 };

export function createDawMock(seed: DawMockSeed = {}, script?: DawMockScript): DawMock {
  const live: DawMockSeed = { ...seed, toggles: { ...seed.toggles } };
  const home: DawKind = seed.daw ?? 'REAPER';
  let open: 'linked' | 'other' = script === 'different' ? 'other' : 'linked';
  const isRecording = () => !!live.transport?.recording;
  let dropped = false;
  let refuseRecord: { sentence: string; kind: 'start' | 'stop' } | null = null;
  // The monitor level the DAW holds, on the page's 0 to 100 scale (the mock's own starting value for its slider).
  let monitorLevel = 60;
  let refuseLevel: string | null = null;
  // Where the narrator is in the DAW project (setPlace), and the moves the app made (dawGoToChapter).
  let place = { chapterId: '', cursor: 0 };
  const moved: { chapterId: string; where: 'end' | 'at'; seconds: number }[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, work: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      work();
    }, ms);
    timers.add(timer);
  };
  const bridgeOpen = () => live.connected ?? home === 'REAPER';
  const capSubs = new Set<(state: DawCapabilities) => void>();
  const transportSubs = new Set<(state: DawTransport) => void>();
  const stateSubs = new Set<(state: DawProjectState) => void>();

  const levelAnswer = (): DawMonitorLevel => {
    const support = currentCapabilities(live).capabilities.monitor_level;
    if (!support?.available) return { ok: false, level: 0, message: support?.message ?? MESSAGE_NO_ENGINE };
    if (refuseLevel !== null) {
      const message = refuseLevel;
      refuseLevel = null;
      return { ok: false, level: 0, message };
    }
    return { ok: true, level: monitorLevel, message: '' };
  };

  const followRefusal = (): string | null => {
    const support = currentCapabilities(live).capabilities.follow_position;
    return support?.available ? null : (support?.message ?? MESSAGE_NO_ENGINE);
  };
  const refusedMove = (sentence: string): DawResult => ({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence });

  const snapshot = () => {
    const capabilities = currentCapabilities(live);
    const transport = currentTransport(live, capabilities);
    return { capabilities, transport, projectState: currentProjectState(live, capabilities, transport) };
  };
  let lastCaps = JSON.stringify(snapshot().capabilities);
  let lastTransport = JSON.stringify(snapshot().transport);
  let lastState = JSON.stringify(snapshot().projectState);
  /** Push what changed, as the host does: the first tick on subscribe, then only on a change. */
  const publish = () => {
    const now = snapshot();
    const caps = JSON.stringify(now.capabilities);
    const transport = JSON.stringify(now.transport);
    const state = JSON.stringify(now.projectState);
    const changed = { caps: caps !== lastCaps, transport: transport !== lastTransport, state: state !== lastState };
    lastCaps = caps;
    lastTransport = transport;
    lastState = state;
    if (dropped) return;
    if (changed.caps) capSubs.forEach((fn) => fn(wireClone(now.capabilities)));
    if (changed.transport) transportSubs.forEach((fn) => fn(wireClone(now.transport)));
    if (changed.state) stateSubs.forEach((fn) => fn(wireClone(now.projectState)));
  };
  const reach = (on: boolean) => {
    live.connected = true;
    live.reachable = on;
    if (!on) live.transport = { playing: false, recording: false };
    publish();
  };

  const control: DawMockControl = {
    launch: async () => {
      if (script === 'refuse') throw new Error('the program did not open.');
      // The bridge opens at once; whether a heartbeat follows is the script's.
      live.connected = true;
      live.reachable = false;
      publish();
      if (script === 'busy') return 'busy';
      if (script === 'quiet') return 'started';
      later(LAUNCH_MS[script ?? 'live'], () => {
        reach(true);
        if (script === 'restart') {
          later(3000, () => reach(false));
          later(9000, () => reach(true));
        }
      });
      return 'started';
    },
    connect: () => reach(true),
    heartbeat: () => reach(true),
    quiet: () => reach(false),
    restart: (ms = 4000) => {
      reach(false);
      later(ms, () => reach(true));
    },
    openProject: (which) => {
      open = which;
      publish();
    },
    linkedOpenProject: () => {
      open = 'linked';
      publish();
    },
    stopInDaw: () => {
      live.transport = { playing: false, recording: false };
      publish();
    },
    startInDaw: () => {
      live.transport = { playing: true, recording: true, position: 0 };
      publish();
    },
    recording: () => isRecording() && !!currentCapabilities(live).reachable,
    dropEvents: (on) => {
      dropped = on;
    },
    refuseNextRecord: (sentence, kind = 'start') => {
      refuseRecord = { sentence, kind };
    },
    refuseNextLevel: (sentence) => {
      refuseLevel = sentence;
    },
    setPlace: (chapterId, cursor) => {
      place = { chapterId, cursor };
    },
    moves: () => moved.map((move) => ({ ...move })),
    state: () => ({
      daw: live.daw ?? home,
      bridge: bridgeOpen(),
      reachable: currentCapabilities(live).reachable,
      openProject: open,
      recording: isRecording(),
      monitorLevel,
      toggles: live.toggles ?? {},
    }),
    settingsSaved: (tool, values) => {
      if (tool !== 'DAW') return;
      for (const [key, value] of Object.entries(values)) {
        if (key.startsWith('capability.')) {
          const capability = DAW_CAPABILITIES.find((c) => c.key === key.slice('capability.'.length))?.key;
          if (!capability) continue;
          if (value === 'on' || value === 'off') live.toggles = { ...live.toggles, [capability]: value };
          else delete live.toggles?.[capability];
        } else if (key === 'experimental_reaper_actions') live.experimentalOn = value === 'true';
      }
      publish();
    },
    engineChosen: (engine) => {
      live.daw = engine === 'builtin' ? 'Built-in' : home === 'Built-in' ? 'REAPER' : home;
      live.transport = { playing: false, recording: false };
      publish();
    },
    record: (kind) => {
      const caps = currentCapabilities(live);
      const record = caps.capabilities.record;
      if (refuseRecord?.kind === kind) {
        const message = refuseRecord.sentence;
        refuseRecord = null;
        return { reason: 'unavailable', message };
      }
      if (kind === 'stop') {
        if (!isRecording() && !caps.reachable) return { reason: 'standalone', message: record?.message ?? MESSAGE_NOT_RUNNING_REAPER };
        live.transport = { playing: false, recording: false };
        later(HEARTBEAT_MS, publish);
        return null;
      }
      if (!record?.available) {
        const reason = record?.reason === 'experimental_off' ? 'experimental_off' : record?.reason === 'standalone' ? 'standalone' : 'unavailable';
        return { reason, message: record?.message ?? MESSAGE_NO_ENGINE };
      }
      live.transport = { playing: true, recording: true, position: 0 };
      later(HEARTBEAT_MS, publish);
      return null;
    },
    facts: () => {
      const caps = currentCapabilities(live);
      return { reachable: caps.reachable && caps.daw === 'REAPER', projectMatches: caps.reachable && open === 'linked', bridge: bridgeOpen() };
    },
  };

  return {
    control,
    dawCapabilities: async () => wireClone(snapshot().capabilities),
    subscribeDawCapabilities: (onUpdate) => {
      capSubs.add(onUpdate);
      onUpdate(wireClone(snapshot().capabilities));
      return () => capSubs.delete(onUpdate);
    },
    // Like the host's first tick after launch: the current transport once, on subscribe.
    subscribeDawTransport: (onUpdate) => {
      transportSubs.add(onUpdate);
      onUpdate(wireClone(snapshot().transport));
      return () => transportSubs.delete(onUpdate);
    },
    // The host's answers (bindings_daw_levels.go): the capability's own sentence when it refuses, else the level the DAW holds.
    dawMonitorLevel: async () => levelAnswer(),
    dawSetMonitorLevel: async (level) => {
      if (!Number.isInteger(level) || level < 0 || level > DAW_LEVEL_MAX) throw new Error(`the monitor level is 0 to ${DAW_LEVEL_MAX}, not ${level}`);
      const answer = levelAnswer();
      if (!answer.ok) return answer;
      monitorLevel = level;
      return levelAnswer();
    },
    // The host's answers (bindings_daw_place.go): the capability's own sentence when it refuses, else where the narrator is.
    dawPlace: async () => {
      const refusal = followRefusal();
      if (refusal !== null) return { ok: false, message: refusal, chapterId: '', selected: 0, cursor: 0 };
      return { ok: true, message: '', chapterId: place.chapterId, selected: place.chapterId === '' ? 0 : 1, cursor: place.cursor };
    },
    dawGoToChapter: async (chapterId, where, seconds) => {
      const refusal = followRefusal();
      if (refusal !== null) return refusedMove(refusal);
      if (where === 'at' && (!Number.isFinite(seconds) || seconds < 0)) return refusedMove('The place to go to is not a usable number of seconds.');
      moved.push({ chapterId, where, seconds: where === 'end' ? 0 : seconds });
      place = { chapterId, cursor: where === 'end' ? place.cursor : seconds };
      return { ok: true, changed: true, message: '', undoSteps: 0 };
    },
    dawProjectState: async () => wireClone(snapshot().projectState),
    subscribeDawProjectState: (onUpdate) => {
      stateSubs.add(onUpdate);
      onUpdate(wireClone(snapshot().projectState));
      return () => stateSubs.delete(onUpdate);
    },
  };
}
