import type { DawCapabilities, DawCapabilityKey, DawCapabilitySupport } from '../api/contracts/daw';
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

const REAPER_CAPABILITIES = everyCapability((key) => ({ level: REAPER_LEVELS[key], available: true }), {
  macro_render: macroUnsupported,
  ...REAPER_NOT_YET,
});

/** REAPER that does not answer: everything that needs it waits, and reading the saved project still works. */
const REAPER_OFF_CAPABILITIES = everyCapability(
  (key) => ({ level: REAPER_LEVELS[key], available: false, reason: 'not_running', message: REAPER_NOT_RUNNING }),
  { project_read: { level: 'supported', available: true }, macro_render: macroUnsupported, ...REAPER_NOT_YET },
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

/** The part of the sample project a call can name: which chapters have a track, which takes are still where the app read them, which findings exist. */
export type DawProject = {
  chapterIds: readonly string[];
  candidateIds: readonly string[];
  findingIds: readonly string[];
};

export const DAW_PROJECT: DawProject = {
  chapterIds: ['chapter-1', 'chapter-2'],
  candidateIds: ['take-1', 'take-2'],
  findingIds: ['finding-1'],
};

/** What the DAW answers besides a capability's own sentence, as the host words it (tests/fixtures/contracts/read-aloud-recordings.json and workspace-use-take-*.json). */
export const DAW_ANSWERS = {
  noTrack: 'The track linked to this chapter is no longer in the REAPER project. Link it again in the audio engine panel.',
  staleTake: "This take's item is no longer in the REAPER project, so nothing was changed. Run the check again to find the takes where they are now.",
  takeUsed:
    'Made that take active in REAPER, in one undo step: Undo in REAPER puts the previous take back. Save the project in REAPER to bring the check up to date.',
} as const;
