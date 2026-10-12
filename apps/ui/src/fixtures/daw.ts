import type { DawCapabilities, DawCapabilityKey, DawCapabilitySupport, DawProjectState } from '../api/contracts/daw';
import { DAW_CAPABILITIES } from '../api/contracts/daw';

// The mock DAW's setups as data (the Studio Next mock's fixtures/daw.ts, narrowed to what the host has today): REAPER, REAPER off,
// the built-in recorder, and Audacity with and without backups. Each is a `DawCapabilities` the existing schema accepts and names
// only capabilities the Go catalogue has today. `cut_range`, `fx_range`, `stack_takes` and `backups` are in it, not yet available on
// any engine until their command slices land. The sentences are the host's own wording (dawport resolver and adapters), so a refusal
// here reads as the real one.

export type DawSetupId = 'reaper' | 'reaper-off' | 'builtin' | 'audacity' | 'audacity-backups';

const REAPER_NOT_RUNNING = 'REAPER is not answering. Check that REAPER is open and the Narration Utils action is running, then try again.';
const MACRO_UNSUPPORTED = 'Mastering with an effect macro is not something REAPER can do.';
const AUDACITY_NOT_YET =
  "Audacity support is not available yet. This version can't read audio from Audacity or add labels to it, so open the project from REAPER to compare it.";
const AUDACITY_NO_TAKES = 'Audacity keeps no takes. Turn on backups to keep them.';
const BUILTIN_UNSUPPORTED = 'Not available with the built-in recorder.';
const BUILTIN_NOT_YET = 'Not available with the built-in recorder yet.';
const BUILTIN_NO_SAVED_PROJECT = 'The built-in recorder keeps no saved project.';

/** REAPER's declaration (dawport/reaper): the level of each capability when REAPER answers. */
const REAPER_LEVELS: Record<DawCapabilityKey, DawCapabilitySupport['level']> = {
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
  record: 'experimental',
  punch: 'experimental',
  regions: 'experimental',
  takes: 'experimental',
  fx_chains: 'experimental',
  silence_trim: 'experimental',
  item_gain: 'experimental',
  render_with_fx: 'experimental',
  master_chain_read: 'experimental',
  macro_render: 'unsupported',
  cut_range: 'not_yet_available',
  fx_range: 'not_yet_available',
  stack_takes: 'not_yet_available',
  backups: 'not_yet_available',
};

type Rows = Partial<Record<DawCapabilityKey, DawCapabilitySupport>>;

/** One row per catalogue capability: `rows` where given, `otherwise` for the rest. */
const everyCapability = (otherwise: (key: DawCapabilityKey) => DawCapabilitySupport, rows: Rows = {}): DawCapabilities['capabilities'] =>
  Object.fromEntries(DAW_CAPABILITIES.map(({ key }) => [key, rows[key] ?? otherwise(key)]));

const macroUnsupported: DawCapabilitySupport = { level: 'unsupported', available: false, reason: 'unsupported', message: MACRO_UNSUPPORTED };

const notYet = (message: string): DawCapabilitySupport => ({ level: 'not_yet_available', available: false, reason: 'not_yet', message });

/** The edit rows REAPER declares not yet available (no bridge command yet), with the resolver's sentence: checked before reachability. */
const REAPER_NOT_YET: Rows = Object.fromEntries(
  DAW_CAPABILITIES.filter(({ key }) => REAPER_LEVELS[key] === 'not_yet_available').map(({ key, label }) => [
    key,
    notYet(`${label} is not available with REAPER yet.`),
  ]),
);

/** REAPER's Describer (dawport/reaper): a roll keeps the earlier audio as a take, so punch is native and not destructive (ADR 0860). */
const REAPER_DEPTH: Rows = { punch: { level: 'experimental', available: true, mode: 'native' } };

const REAPER_CAPABILITIES = everyCapability((key) => ({ level: REAPER_LEVELS[key], available: true }), {
  macro_render: macroUnsupported,
  ...REAPER_NOT_YET,
  ...REAPER_DEPTH,
});

/** REAPER that does not answer: everything that needs it waits, and reading the saved project still works. */
const REAPER_OFF_CAPABILITIES = everyCapability(
  (key) => ({ level: REAPER_LEVELS[key], available: false, reason: 'not_running', message: REAPER_NOT_RUNNING }),
  {
    project_read: { level: 'supported', available: true },
    macro_render: macroUnsupported,
    ...REAPER_NOT_YET,
    punch: { level: 'experimental', available: false, reason: 'not_running', message: REAPER_NOT_RUNNING, mode: 'native' },
  },
);
const audacityExperimental: DawCapabilitySupport = { level: 'experimental', available: true };

/** Audacity today: labels and navigation work, and nothing else is built. A roll replaces audio there, so `punch` is destructive. */
const audacityCapabilities = (backups: boolean): DawCapabilities['capabilities'] =>
  everyCapability(() => notYet(AUDACITY_NOT_YET), {
    markers: audacityExperimental,
    navigate: audacityExperimental,
    takes: backups ? audacityExperimental : notYet(AUDACITY_NO_TAKES),
    punch: backups ? notYet(AUDACITY_NOT_YET) : { ...notYet(AUDACITY_NOT_YET), destructive: true },
  });

const builtinExperimental: DawCapabilitySupport = { level: 'experimental', available: true };

/** The built-in recorder as the host declares it (dawport/builtin, tests/fixtures/contracts/daw-capabilities-builtin.json): it
 * records and keeps takes (Experimental, switched on here as the Audacity setups are), keeps no saved project, and will make
 * punch and the edits itself later. `daw` stays `none` until the Booth's setup chip names the 'Built-in' kind (the Booth slice). */
const BUILTIN_CAPABILITIES = everyCapability(() => ({ level: 'unsupported', available: false, reason: 'unsupported', message: BUILTIN_UNSUPPORTED }), {
  record: builtinExperimental,
  takes: builtinExperimental,
  project_read: { level: 'unsupported', available: false, reason: 'unsupported', message: BUILTIN_NO_SAVED_PROJECT },
  punch: notYet(BUILTIN_NOT_YET),
  cut_range: notYet(BUILTIN_NOT_YET),
  fx_range: notYet(BUILTIN_NOT_YET),
  stack_takes: notYet(BUILTIN_NOT_YET),
});

export const DAW_SETUPS: Readonly<Record<DawSetupId, DawCapabilities>> = {
  reaper: { daw: 'REAPER', reachable: true, capabilities: REAPER_CAPABILITIES },
  'reaper-off': { daw: 'REAPER', reachable: false, capabilities: REAPER_OFF_CAPABILITIES },
  builtin: { daw: 'none', reachable: true, capabilities: BUILTIN_CAPABILITIES },
  audacity: { daw: 'Audacity', reachable: true, capabilities: audacityCapabilities(false) },
  'audacity-backups': { daw: 'Audacity', reachable: true, capabilities: audacityCapabilities(true) },
};

const IDLE_PROJECT_STATE: DawProjectState = { savedAt: null, unsavedChanges: false, playState: 'stopped', playPosition: 0 };

/** Each setup's project state as the host answers it (tests/fixtures/contracts/daw-project-state-*.json). REAPER has the
 * Studio Next mock's saved time (SAVED_PROJECT) and is stopped with nothing unsaved. The built-in recorder keeps no saved
 * project. Audacity is idle too: the mock gives it a saved time, but the host has no heartbeat from Audacity to read one from
 * yet. REAPER off is idle, as the host is with no heartbeat. */
export const DAW_PROJECT_STATES: Readonly<Record<DawSetupId, DawProjectState>> = {
  reaper: { savedAt: '2026-09-26T08:40', unsavedChanges: false, playState: 'stopped', playPosition: 0 },
  'reaper-off': IDLE_PROJECT_STATE,
  builtin: IDLE_PROJECT_STATE,
  audacity: IDLE_PROJECT_STATE,
  'audacity-backups': IDLE_PROJECT_STATE,
};

/** The project state of one of DAW_SETUPS, or the idle one for a setup a test built itself. */
export function projectStateOf(setup: DawCapabilities): DawProjectState {
  const id = (Object.keys(DAW_SETUPS) as DawSetupId[]).find((key) => DAW_SETUPS[key] === setup);
  return id ? DAW_PROJECT_STATES[id] : IDLE_PROJECT_STATE;
}

/** The part of the sample project a call can name: which chapters have a track, which takes are still where the app read them, which findings exist.
 * `otherTakes` is how many other takes each candidate's item holds, for hiding them (1 when not given). */
export type DawProject = {
  chapterIds: readonly string[];
  candidateIds: readonly string[];
  findingIds: readonly string[];
  otherTakes?: Readonly<Record<string, number>>;
};

export const DAW_PROJECT: DawProject = {
  chapterIds: ['chapter-1', 'chapter-2'],
  candidateIds: ['take-1', 'take-2', 'take-solo'],
  findingIds: ['finding-1'],
  otherTakes: { 'take-1': 1, 'take-2': 1, 'take-solo': 0 },
};

/** What the DAW answers besides a capability's own sentence, as the host words it (tests/fixtures/contracts/read-aloud-recordings.json and workspace-use-take-*.json).
 * `noTrack` and `staleTake` are the host's stale answers, so the mock refuses them with code `stale` (ADR 0861). */
export const DAW_ANSWERS = {
  noTrack: 'The track linked to this chapter is no longer in the REAPER project. Link it again in the audio engine panel.',
  staleTake: "This take's item is no longer in the REAPER project, so nothing was changed. Run the check again to find the takes where they are now.",
  takeUsed:
    'Made that take active in REAPER, in one undo step: Undo in REAPER puts the previous take back. Save the project in REAPER to bring the check up to date.',
  /** internal/pickups.Service and narration_pickups.lua (SN-D44): a pickup marker renamed, or no marker to rename near that time. */
  pickupResolved: 'Marked this pickup done.',
  pickupReopened: 'Marked this pickup open again.',
  noOpenPickup: 'No open pickup was found at that position.',
  noResolvedPickup: 'No resolved pickup was found at that position.',
  /** internal/passagetakes' hide.go (SN-D52): a kept take the host no longer offers, answered with code stale. */
  staleHide: "That take isn't one of this passage's takes any more, so nothing was changed. The list has been read again.",
  /** internal/passagetakes' hide.go: a kept candidate from another item or lane, which hide_takes cannot keep. */
  hideNotOnItem: "Only a take of this passage's own item can be kept while the others are muted. Use this take first, then hide the others.",
  /** bindings_daw_roll.go (SN-D64): an unconfirmed roll where `punch` is destructive, and a roll time that is not a number of seconds. */
  rollConfirm: 'This will replace the audio from here on. Confirm to continue.',
  rollBadTime: 'The roll time is not a usable number of seconds.',
  /** dawport/reaper's puncher: the chapter's track is gone, answered with code stale. */
  rollStale: 'That track is no longer in the REAPER project. Read the project again.',
} as const;

const plural = (count: number): string => (count === 1 ? '' : 's');

/** internal/pickups' importSummary: what an import of pickup markers added, and how many were already there. */
export function pickupsImportedAnswer(added: number, existing: number): string {
  return `Imported ${added} pickup${plural(added)}${existing > 0 ? `, ${existing} already there` : ''}.`;
}

/** internal/pickups' markersSummary: what a read of the pickup markers found. */
export function pickupMarkersReadAnswer(open: number, done: number): string {
  const total = open + done;
  return `Read ${total} pickup marker${plural(total)}: ${open} open, ${done} done.`;
}

/** dawport/reaper's hiddenMessage: what hiding an item's other takes muted, naming the DAW. */
export function takesHiddenAnswer(muted: number, daw: string): string {
  if (muted === 0) return `No other take to mute in ${daw}.`;
  return muted === 1 ? `Muted 1 other take in ${daw}. It is still in the project.` : `Muted ${muted} other takes in ${daw}. They are still in the project.`;
}

/** dawport/reaper's puncher: a roll from `at` seconds that kept the earlier audio as a take (ADR 0860; no undo point of its own). */
export function rolledAnswer(at: number): string {
  return `Rolled again from ${at.toFixed(1)} seconds. The earlier audio is kept as a take.`;
}

/** A roll on a DAW whose `punch` is destructive, once the narrator confirmed. No adapter declares one yet; the mock's Audacity words it. */
export function rolledReplacingAnswer(at: number): string {
  return `Rolled again from ${at.toFixed(1)} seconds. The audio from here on was replaced.`;
}

/** What a roll from `at` answers on one of DAW_SETUPS once it is allowed (and confirmed where destructive): REAPER keeps the earlier
 * audio with no undo point of its own; a destructive DAW replaces it in one undo step. */
export function rolledOf(setup: DawCapabilities, at: number): { message: string; undoSteps: number } {
  return setup.capabilities.punch?.destructive ? { message: rolledReplacingAnswer(at), undoSteps: 1 } : { message: rolledAnswer(at), undoSteps: 0 };
}

/** dawport/builtin's HideTakes: the built-in recorder already plays only the kept take, so it mutes nothing. */
export const BUILTIN_NOTHING_TO_MUTE = 'The built-in recorder plays only the kept take, so there is nothing to mute.';

/** What hiding `muted` other takes answers on one of DAW_SETUPS, as its adapter words it: the built-in recorder (`daw: 'none'`
 * until the Booth names it) changes nothing, and any other DAW names itself. */
export function takesHiddenOf(setup: DawCapabilities, muted: number): { changed: boolean; message: string } {
  if (setup === DAW_SETUPS.builtin || setup.daw === 'none' || setup.daw === 'Built-in') return { changed: false, message: BUILTIN_NOTHING_TO_MUTE };
  return { changed: muted > 0, message: takesHiddenAnswer(muted, setup.daw) };
}
