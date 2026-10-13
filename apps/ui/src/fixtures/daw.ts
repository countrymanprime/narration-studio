import type {
  DawBackup,
  DawCapabilities,
  DawCapabilityKey,
  DawCapabilitySupport,
  DawClick,
  DawFxRangeCompare,
  DawFxRangeSettings,
  DawFxSetting,
  DawGainStretch,
  DawProjectState,
  DawResult,
} from '../api/contracts/daw';
import { DAW_CAPABILITIES } from '../api/contracts/daw';
import type { MeasureReport } from '../api/contracts/measure';

// The mock DAW's setups as data (the Studio Next mock's fixtures/daw.ts, narrowed to what the host has today): REAPER, REAPER off,
// the built-in recorder, and Audacity with and without backups. Each is a `DawCapabilities` the existing schema accepts and names
// only capabilities the Go catalogue has today. `cut_range`, `fx_range`, `stack_takes` and `backups` are in it: REAPER declares the
// first three Experimental (narration_range.lua, narration_takes.lua), and `backups` is Audacity's (ADR 0863), on in the
// `audacity-backups` setup and turned off in Settings in the `audacity` one.
// The sentences are the host's own wording (dawport resolver and adapters), so a refusal here reads as the real one.

export type DawSetupId = 'reaper' | 'reaper-off' | 'builtin' | 'audacity' | 'audacity-backups';

const REAPER_NOT_RUNNING = 'REAPER is not answering. Check that REAPER is open and the Narration Utils action is running, then try again.';
const MACRO_UNSUPPORTED = 'Mastering with an effect macro is not something REAPER can do.';
const AUDACITY_NOT_YET =
  "Audacity support is not available yet. This version can't read audio from Audacity or add labels to it, so open the project from REAPER to compare it.";
const TURNED_OFF = 'Turned off in Settings.';
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

/** REAPER's Describer (dawport/reaper): a roll keeps the earlier audio as a take, a cut moves the audio to the muted Cuts track, a
 * chain on a range is take FX on a split piece that come off again, and a stack makes later reads takes and moves their items to the
 * Cuts track, so punch, cut_range, fx_range and stack_takes are native and not destructive (ADR 0860). */
const REAPER_DEPTH: Rows = {
  punch: { level: 'experimental', available: true, mode: 'native' },
  cut_range: { level: 'experimental', available: true, mode: 'native' },
  fx_range: { level: 'experimental', available: true, mode: 'native' },
  stack_takes: { level: 'experimental', available: true, mode: 'native' },
  range_gain: { level: 'experimental', available: true, mode: 'native' },
  click_repair: { level: 'experimental', available: true, mode: 'native' },
};

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
    cut_range: { level: 'experimental', available: false, reason: 'not_running', message: REAPER_NOT_RUNNING, mode: 'native' },
    fx_range: { level: 'experimental', available: false, reason: 'not_running', message: REAPER_NOT_RUNNING, mode: 'native' },
    stack_takes: { level: 'experimental', available: false, reason: 'not_running', message: REAPER_NOT_RUNNING, mode: 'native' },
    range_gain: { level: 'experimental', available: false, reason: 'not_running', message: REAPER_NOT_RUNNING, mode: 'native' },
    click_repair: { level: 'experimental', available: false, reason: 'not_running', message: REAPER_NOT_RUNNING, mode: 'native' },
  },
);
const audacityExperimental: DawCapabilitySupport = { level: 'experimental', available: true };

/** Audacity's sentence for a row it has only with backups on, while backups are turned off (audacity.go's explainRequirement). */
const needsBackups = (what: string): string => `${what} needs Audacity backups. Turn on Audio backups in Settings.`;

/** Audacity connected and answering, with every Experimental capability switched on and backups as given: what the host's
 * resolver answers over the adapter (dawport/audacity). Labels, navigation, mastering with a macro and backups work, and nothing
 * else is built. Takes, stacking, cutting and an effect on words exist only with backups on (SN-D83, the Studio Next mock's
 * capabilitiesFor), each refused with backups' reason while they are off; the edits are made in steps. A roll replaces audio
 * there, so `punch` is destructive until backups keep the audio. */
const audacityCapabilities = (backups: boolean): DawCapabilities['capabilities'] => {
  const needs = (what: string, mode?: 'steps'): DawCapabilitySupport =>
    backups
      ? { ...audacityExperimental, ...(mode ? { mode } : {}) }
      : { level: 'experimental', available: false, reason: 'turned_off', message: needsBackups(what), ...(mode ? { mode } : {}) };
  return everyCapability(() => notYet(AUDACITY_NOT_YET), {
    markers: audacityExperimental,
    navigate: audacityExperimental,
    macro_render: audacityExperimental,
    backups: backups ? audacityExperimental : { level: 'experimental', available: false, reason: 'turned_off', message: TURNED_OFF },
    takes: needs('Keeping takes'),
    stack_takes: needs('Stacking takes', 'steps'),
    cut_range: needs('Cutting words and their audio', 'steps'),
    fx_range: needs('Adding an effect to words', 'steps'),
    range_gain: needs('Lowering stretches of a take', 'steps'),
    click_repair: needs('Repairing clicks in a take', 'steps'),
    punch: backups ? audacityExperimental : { ...audacityExperimental, destructive: true },
  });
};

const builtinExperimental: DawCapabilitySupport = { level: 'experimental', available: true };

/** The built-in recorder as the host declares it (dawport/builtin, tests/fixtures/contracts/daw-capabilities-builtin.json): it
 * records, keeps takes and cuts a range by an edit list (Experimental, switched on here as the Audacity setups are), keeps no
 * saved project, and will make punch and the other edits itself later. `daw` stays `none` until the Booth's setup chip names the 'Built-in' kind (the Booth slice). */
const BUILTIN_CAPABILITIES = everyCapability(() => ({ level: 'unsupported', available: false, reason: 'unsupported', message: BUILTIN_UNSUPPORTED }), {
  record: builtinExperimental,
  takes: builtinExperimental,
  project_read: { level: 'unsupported', available: false, reason: 'unsupported', message: BUILTIN_NO_SAVED_PROJECT },
  punch: notYet(BUILTIN_NOT_YET),
  cut_range: { ...builtinExperimental, mode: 'app' },
  fx_range: notYet(BUILTIN_NOT_YET),
  stack_takes: notYet(BUILTIN_NOT_YET),
  undo_last: notYet(BUILTIN_NOT_YET),
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
  /** The narrator's saved FX chains as the DAW lists them (list_fx_chains). */
  fxChains?: readonly string[];
  /** The passages the DAW could stack (bindings_daw_stack.go names them `pm-<chapter>-<paragraph>`). */
  passageIds?: readonly string[];
  /** The files of the host's last measurement, for Play the quietest 5 s and Open in the DAW (bindings_master_files.go). */
  measuredFiles?: readonly RunFile[];
  /** The takes on a chapter's track the DAW could split, by id, with where each starts and how long it is in project seconds. */
  splitTakes?: Readonly<Record<string, { start: number; length: number }>>;
  /** The items on a chapter's track a gap could be trimmed from, by id, with where each starts and how long it is in project seconds. */
  trimItems?: Readonly<Record<string, { start: number; length: number }>>;
  /** The takes on a chapter's track whose stretches the DAW could lower, by id, with the part of the take's file each plays (seconds
   * into the file). */
  gainTakes?: Readonly<Record<string, { from: number; to: number }>>;
  /** The takes on a chapter's track whose clicks the DAW could repair, by id, with the part of the take's file each plays (seconds into
   * the file). */
  clickTakes?: Readonly<Record<string, { from: number; to: number }>>;
};

/** A file of the last measurement as bindings_master_files.go reads it: its path (the page's file id), and its report's length and
 * quietest window, or no report when it was not measured. */
export type RunFile = { path: string; report: Pick<MeasureReport, 'duration_seconds' | 'noise_floor_start_seconds'> | null };

/** How much Play the quietest plays (quietestPlaySeconds), and the noise-floor window it is centred on (measure.NoiseWindowSeconds). */
const QUIETEST_PLAY_SECONDS = 5;
const NOISE_WINDOW_SECONDS = 0.5;

/** The stretch MasterPlayQuietest plays of `file` and its answer, or the sentence it refuses with: 5 s centred on the quietest window,
 * moved inside the file, or all of a shorter file; never a time the measurement did not find (ADR 0015). */
export function quietestOf(file: RunFile): { start: number; length: number; message: string } | { refused: string } {
  const name = fileName(file.path);
  if (!file.report) return { refused: `${name} was not measured, so there is no quiet stretch to play.` };
  const { duration_seconds: duration, noise_floor_start_seconds: quietest } = file.report;
  if (quietest === null || !(duration > 0)) return { refused: `${name} has no quiet stretch to play: the measurement found no room tone in it.` };
  const length = Math.min(QUIETEST_PLAY_SECONDS, duration);
  const start = Math.max(0, Math.min(quietest + NOISE_WINDOW_SECONDS / 2 - length / 2, duration - length));
  return { start, length, message: `Playing the quietest ${length} s of ${name}, from ${start} s.` };
}

export const DAW_PROJECT: DawProject = {
  chapterIds: ['chapter-1', 'chapter-2'],
  candidateIds: ['take-1', 'take-2', 'take-solo'],
  findingIds: ['finding-1'],
  otherTakes: { 'take-1': 1, 'take-2': 1, 'take-solo': 0 },
  // The chains of tests/fixtures/contracts/workspace-fx-chains.json, so the mock lists what the host stand-in does.
  fxChains: ['Podcast Voice.RfxChain', 'Vocal Chain/Warmth.RfxChain'],
  passageIds: ['pm-chapter-1-p-1'],
  // The paths of tests/fixtures/contracts/master-file-*.json's stand-in host.
  measuredFiles: [
    { path: 'C:/Renders/Chapter 01.wav', report: { duration_seconds: 600, noise_floor_start_seconds: 12 } },
    { path: 'C:/Renders/Silent/Chapter 01.wav', report: { duration_seconds: 600, noise_floor_start_seconds: null } },
  ],
  splitTakes: { 'take-twice': { start: 10, length: 10 } },
  trimItems: { 'item-twice': { start: 10, length: 10 } },
  gainTakes: { 'take-twice': { from: 2, to: 12 } },
  clickTakes: { 'take-twice': { from: 2, to: 12 } },
};

/** What the DAW answers besides a capability's own sentence, as the host words it (tests/fixtures/contracts/read-aloud-recordings.json and workspace-use-take-*.json).
 * `noTrack` and `staleTake` are the host's stale answers, so the mock refuses them with code `stale` (ADR 0861). */
/** The answer DawPreviewFileRange gives when `length` seconds of the file at `path` play from `start` (bindings_daw_files.go). */
export const filePreviewAnswer = (path: string, start: number, length: number): string =>
  `Playing ${length.toFixed(1)} s of ${fileName(path)} from ${start.toFixed(1)} s.`;

/** The answer DawRevealFile gives when the file at `path` is shown in `daw`. */
export const fileRevealAnswer = (path: string, daw: string): string => `Showing ${fileName(path)} in ${daw}.`;

/** fileRevealAnswer for the DAW `setup` reports, so a port names no DAW itself. */
export const fileRevealOf = (setup: DawCapabilities, path: string): string => fileRevealAnswer(path, setup.daw);

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

export const DAW_ANSWERS = {
  /** apps/desktop/bindings_daw_files.go (SN-B98): a file played or shown, and the host's refusals of a path or a stretch. */
  fileStopped: 'Stopped playing the file.',
  fileNothingPlaying: 'Nothing was playing.',
  fileNotPicked: 'Pick the file to measure again: only a file picked in this session can be played or shown.',
  fileBadStretch: 'The stretch to play is not a usable number of seconds (up to 60).',
  /** apps/desktop/bindings_master_files.go (SN-M97): a file id that is not a file of the last measurement (code stale). */
  masterNotInRun: 'That file is not in the last measurement. Check the files again, then try again.',
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
  /** bindings_readaloud_record.go (SN-D14): a record start at a time that is not a finite, non-negative number of seconds. */
  recordBadTime: 'The record start time is not a usable number of seconds.',
  /** dawport/reaper's puncher: the chapter's track is gone, answered with code stale. */
  rollStale: 'That track is no longer in the REAPER project. Read the project again.',
  /** bindings_daw_range.go (SN-D65): delete_range's own mode and fade sentences, and words the edit log already holds as cut (changed false). */
  cutBadMode: 'The cut mode must be close or gap.',
  cutBadFade: 'The fade must be a whole number of milliseconds from 0 to 500.',
  cutAlreadyCut: 'These words are already cut, so nothing was changed.',
  /** bindings_daw_range.go (SN-E97): delete_range's own pad and room-tone sentences, checked before anything is sent. */
  cutBadPad: 'The pad must be from 0 to 500 milliseconds.',
  cutRoomToneNeedsGap: 'Room tone fills a gap that keeps its length, so it needs the gap mode.',
  cutPadAll: 'The pad leaves nothing to cut.',
  /** narration_range.lua (SN-E97): room tone asked for in a chapter whose track has no region named Room tone over its audio. */
  cutNoRoomTone: 'This chapter has no room tone marked in REAPER. Mark a stretch of room tone on its track with a region named Room tone.',
  /** internal/passagetakes' range.go: a token range outside the chapter's alignment (code stale), words not heard, words on two items. */
  rangeStale: "That selection is not in this chapter's alignment any more, so nothing was changed. Reload the chapter and select the words again.",
  rangeNotHeard: "These words weren't heard in the recording, so there's no audio to cut. Run the check again if the chapter has changed.",
  rangeCrossesItems: 'These words cross two REAPER items. Select words from one item at a time.',
  /** bindings_daw_fx_range.go (SN-D66): a chain REAPER does not list (apply_fx_range's own sentence), and words not heard, in an effect's words. */
  fxBadChain: 'That FX chain is not in the FXChains folder REAPER lists.',
  fxNotHeard: "These words weren't heard in the recording, so there's no audio to put an effect on. Run the check again if the chapter has changed.",
  /** bindings_daw_fx_range.go and narration_range.lua (SN-E104): a setting the effect does not have, a value that is not a number, and a
   * value outside the setting's range; and dawport/audacity's answer to every edit of an effect on words. */
  fxNoSetting: 'That effect has no such setting.',
  fxBadValue: 'The value for that setting is not a number.',
  fxValueOutside: 'That value is outside what the setting takes.',
  fxBakedIn:
    'Audacity puts an effect into the audio itself after its backup, so its settings cannot be read or changed and it cannot be bypassed. Put the backup back and add the effect again instead.',
  /** bindings_daw_stack.go (SN-D72): a passage id the chapter's passage map does not list (code stale), and a kept take. */
  stackNotAPassage: "That passage is not one of this chapter's passages any more, so nothing was changed. Read the chapter again.",
  stackKept: 'A take of this passage has been kept, so its reads cannot be stacked or moved back.',
  /** bindings_daw_split.go (SN-E94): a cut at a time that is not one. */
  splitBadTime: 'A take can only be split at a time in the chapter.',
  /** bindings_daw_range.go (SN-E112): a gap to trim whose times are not a usable pair. */
  trimBadRange: 'The gap to shorten is not a usable pair of times, so nothing was changed.',
  /** bindings_daw_reduce_range_gain.go (SN-E100): a reduction outside 1 to 24 dB, and stretches out of shape or more than 500. */
  gainBadDb: 'A stretch can only be lowered by 1 to 24 dB.',
  gainBadStretches: 'The stretches to lower must be 1 to 500 stretches of the take, each ending after it starts.',
  /** bindings_daw_repair_click.go (SN-E101): clicks out of shape, longer than 50 ms or more than 500. */
  clickBad: 'The clicks to repair must be 1 to 500 clicks of the take, each ending after it starts and at most 50 ms long.',
  /** bindings_daw_backups.go (SN-D82): a label that is empty, too long or holds a control character. */
  backupLabel: 'A backup needs a label of 1 to 256 bytes of plain text saying what it was made for.',
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

/** bindings_readaloud_record.go's readAloudRecordingFrom (SN-D14): a record start at a punch, so the narrator sees where the take begins. */
export function recordingFromAnswer(at: number): string {
  return `Recording from ${at.toFixed(1)} seconds.`;
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

/** dawport/reaper's rangeCutter: a cut of `words` words in `daw`. */
export function rangeCutAnswer(words: number, daw: string): string {
  return `Deleted ${words} word${plural(words)} and their audio in ${daw}.`;
}

/** The edits a `steps` DAW makes for one cut, in order (the Studio Next mock's RANGE_PLAN: select, then delete). */
export const RANGE_CUT_STEPS = ['Select the range', 'Delete the selection'] as const;

/** What a cut of `words` words answers on one of DAW_SETUPS once `cut_range` is available, by its mode: one undo step where the DAW makes
 * it as one action (`native`), none where the app keeps the edit (`app`), and one per edit, listed, where it takes several (`steps`). */
export function rangeCutOf(setup: DawCapabilities, words: number): { message: string; undoSteps: number; steps?: string[] } {
  const message = rangeCutAnswer(words, setup.daw);
  switch (setup.capabilities.cut_range?.mode) {
    case 'app':
      return { message, undoSteps: 0 };
    case 'steps':
      return { message, undoSteps: RANGE_CUT_STEPS.length, steps: [...RANGE_CUT_STEPS] };
    default:
      return { message, undoSteps: 1 };
  }
}

/** dawport/reaper's rangeFXApplier: a chain put on `words` words in `daw`. */
export function fxChainAddedAnswer(chain: string, words: number, daw: string): string {
  return `Added ${chain} to ${words} word${plural(words)} in ${daw}.`;
}

/** dawport/reaper's rangeFXApplier: a chain taken off its piece in `daw`. */
export function fxChainRemovedAnswer(chain: string, daw: string): string {
  return `${chain} taken off in ${daw}.`;
}

/** bindings_daw_fx_range.go: a removal from an item that does not carry the chain (changed false). */
export function fxNotOnItemAnswer(chain: string): string {
  return `${chain} is not on the item these words were checked in, so nothing changed. If you added it since the last check, run the check again so the app finds the piece it is on.`;
}

/** Where a DAW's chain list comes from, as the Add FX menu names it (the Studio Next mock's `FxList.source`). */
export function fxChainsSource(daw: string): string {
  return `Your ${daw} FX chains`;
}

/** What taking a chain off answers on one of DAW_SETUPS: it costs what putting it on did, by the capability's mode. */
export function fxRangeRemovedOf(setup: DawCapabilities, chain: string): { message: string; undoSteps: number; steps?: string[] } {
  return { ...fxRangeOf(setup, chain, 1), message: fxChainRemovedAnswer(chain, setup.daw) };
}

/** A DAW's chain list as the Add FX menu shows it (the Studio Next mock's `FxList`): where it comes from, named for the setup's DAW, and
 * each chain by its name, which is also its id. */
export function fxListOf(setup: DawCapabilities, names: readonly string[]): { source: string; choices: { id: string; name: string }[] } {
  return { source: fxChainsSource(setup.daw), choices: names.map((name) => ({ id: name, name })) };
}

/** A chain name as list_fx_chains could list it (bridge's plainChainName): relative, ending .RfxChain, no backslash, colon or control
 * character, and no empty, `.` or `..` part. */
export function plainChainName(chain: string): boolean {
  if (!chain.toLowerCase().endsWith('.rfxchain') || /[\\:\p{Cc}]/u.test(chain)) return false;
  return chain.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** The edits a `steps` DAW makes for one effect on a range, in order (the Studio Next mock's RANGE_PLAN: select, then apply). */
export const FX_RANGE_STEPS = ['Select the range', 'Apply the effect'] as const;

/** What a chain on `words` words answers on one of DAW_SETUPS once `fx_range` is available, by its mode, as rangeCutOf does. */
export function fxRangeOf(setup: DawCapabilities, chain: string, words: number): { message: string; undoSteps: number; steps?: string[] } {
  const message = fxChainAddedAnswer(chain, words, setup.daw);
  switch (setup.capabilities.fx_range?.mode) {
    case 'app':
      return { message, undoSteps: 0 };
    case 'steps':
      return { message, undoSteps: FX_RANGE_STEPS.length, steps: [...FX_RANGE_STEPS] };
    default:
      return { message, undoSteps: 1 };
  }
}

/** dawport/reaper's takeStacker: `takes` later reads stacked on their first read in `daw`. */
export function takesStackedAnswer(takes: number, daw: string): string {
  return `Stacked ${takes} take${plural(takes)} in ${daw}.`;
}

/** dawport/reaper's takeStacker: `takes` stacked takes moved back to where they were recorded in `daw`. */
export function takesUnstackedAnswer(takes: number, daw: string): string {
  return `Moved back ${takes} take${plural(takes)} in ${daw}.`;
}

/** dawport/reaper's takeStacker and passagetakes.StackPlan: a request with nothing to move. */
export function nothingToStackAnswer(daw: string): string {
  return `There are no retries to move in ${daw}.`;
}

/** nothingToStackAnswer for one of DAW_SETUPS, named for its DAW. */
export function nothingToStackOf(setup: DawCapabilities): string {
  return nothingToStackAnswer(setup.daw);
}

/** The edits a `steps` DAW makes to stack retries, in order (the Studio Next mock's STACK_PLAN.steps). */
export const STACK_STEPS = [
  'Add a take track',
  'Paste each later read into it',
  'Split at the point where the reads line up',
  'Shift the audio that follows to close the gap',
  'Mute the reads that are not on top',
] as const;

/** What a stack (or, with `unstack`, an un-stack) of `takes` takes answers on one of DAW_SETUPS once `stack_takes` is available, by its
 * mode, as the mock's restack does: one undo step natively, the steps listed and one undo step each in steps, none where the app makes
 * it. */
export function stackOf(setup: DawCapabilities, takes: number, unstack = false): { message: string; undoSteps: number; steps?: string[] } {
  const message = (unstack ? takesUnstackedAnswer : takesStackedAnswer)(takes, setup.daw);
  switch (setup.capabilities.stack_takes?.mode) {
    case 'app':
      return { message, undoSteps: 0 };
    case 'steps':
      return { message: `${message} Done in ${STACK_STEPS.length} steps.`, undoSteps: STACK_STEPS.length, steps: [...STACK_STEPS] };
    default:
      return { message, undoSteps: 1 };
  }
}

/** dawport/reaper's takes role: a take cut into two takes of one item in `daw`, one undo step there. */
export function takeSplitAnswer(daw: string): string {
  return `Split the take into 2 takes in ${daw}. Undo it there in one step.`;
}

/** bindings_daw_split.go: a take the chapter's track no longer holds, and a cut outside it, both answered with code stale. */
export function splitTakeStaleAnswer(daw: string): string {
  return `That take is no longer on this chapter's track in the ${daw} project, so nothing was split. Read the project again.`;
}
export function splitOutsideAnswer(daw: string): string {
  return `The cut is no longer inside that take in the ${daw} project, so nothing was split. Read the project again.`;
}

/** splitTakeStaleAnswer and splitOutsideAnswer for one of DAW_SETUPS, named for its DAW. */
export function splitStaleOf(setup: DawCapabilities): { gone: string; outside: string } {
  return { gone: splitTakeStaleAnswer(setup.daw), outside: splitOutsideAnswer(setup.daw) };
}

/** dawport/builtin's SplitTake: the recorder keeps each take as one file it lists, so it cannot cut one into two listed takes. */
export const BUILTIN_NO_SPLIT = 'The built-in recorder cannot split a take into two yet: it keeps each take as one audio file and never rewrites one.';

/** What a cut answers on one of DAW_SETUPS once `takes` is available, as its adapter words it: the built-in recorder refuses (the
 * capability is the one the Booth's own take choice uses), and any other DAW cuts it in one undo step, naming itself. */
export function takeSplitOf(setup: DawCapabilities): { refused: string } | { message: string } {
  if (setup === DAW_SETUPS.builtin || setup.daw === 'none' || setup.daw === 'Built-in') return { refused: BUILTIN_NO_SPLIT };
  return { message: takeSplitAnswer(setup.daw) };
}

/** bindings_daw_range.go (SN-E112): an item the chapter's track no longer holds, and a gap outside it, both answered with code stale. */
export function trimStaleOf(setup: DawCapabilities): { gone: string; outside: string } {
  return {
    gone: `That gap's item is no longer on this chapter's track in the ${setup.daw} project, so nothing was shortened. Read the project again.`,
    outside: `That gap is no longer inside its item in the ${setup.daw} project, so nothing was shortened. Read the project again.`,
  };
}

/** DawTrimRange's sentence for a gap shortened in `daw`. */
export function trimmedAnswer(daw: string): string {
  return `Shortened the gap in ${daw}.`;
}

/** DawTrimRange's checks after the capability's, in the host's order (bindings_daw_range.go): the times, the fade, an item the project's
 * track does not hold and a gap outside it (code stale); then the host's sentence over what the setup's DAW does for a cut (its undo
 * steps and, for a `steps` DAW, its edits). */
export function trimRangeAnswerOf(
  setup: DawCapabilities,
  project: DawProject,
  chapterId: string,
  itemId: string,
  start: number,
  end: number,
  fadeMs: number,
): { refused: string; stale: boolean } | { result: DawResult } {
  if (!(start >= 0) || !Number.isFinite(end) || !(end > start)) return { refused: DAW_ANSWERS.trimBadRange, stale: false };
  if (!Number.isInteger(fadeMs) || fadeMs < 0 || fadeMs > 500) return { refused: DAW_ANSWERS.cutBadFade, stale: false };
  const item = project.chapterIds.includes(chapterId) ? project.trimItems?.[itemId] : undefined;
  if (!item) return { refused: trimStaleOf(setup).gone, stale: true };
  if (start < item.start || end > item.start + item.length) return { refused: trimStaleOf(setup).outside, stale: true };
  const cut = rangeCutOf(setup, 0);
  return { result: { ok: true, changed: true, message: trimmedAnswer(setup.daw), undoSteps: cut.undoSteps, ...(cut.steps ? { steps: cut.steps } : {}) } };
}

/** bindings_daw_reduce_range_gain.go: a take the chapter's track no longer holds, and a stretch outside it, both answered with code
 * stale. */
export function gainTakeStaleAnswer(daw: string): string {
  return `That take is no longer on this chapter's track in the ${daw} project, so nothing was lowered. Read the project again.`;
}
export function gainOutsideAnswer(daw: string): string {
  return `A stretch to lower is no longer inside that take in the ${daw} project, so nothing was lowered. Read the project again.`;
}

/** gainTakeStaleAnswer and gainOutsideAnswer for one of DAW_SETUPS, named for its DAW. */
function gainStaleOf(setup: DawCapabilities): { gone: string; outside: string } {
  return { gone: gainTakeStaleAnswer(setup.daw), outside: gainOutsideAnswer(setup.daw) };
}

const stretchesWord = (count: number): string => (count === 1 ? '1 stretch' : `${count} stretches`);

/** dawport/reaper's range_gain role: `count` stretches lowered by `db` dB in `daw`, one undo step there. */
export function rangeGainAnswer(daw: string, count: number, db: number): string {
  return `Lowered ${stretchesWord(count)} by ${db} dB in ${daw}. Undo it there in one step.`;
}

/** What lowering `count` stretches by `db` dB answers on one of DAW_SETUPS once `range_gain` is available, by its mode: one undo step
 * where the DAW makes it as one action (REAPER), and Audacity's steps (dawport/audacity's ReduceRangeGain), one undo step per stretch. */
function rangeGainOf(setup: DawCapabilities, count: number, db: number): { message: string; undoSteps: number; steps?: string[] } {
  if (setup.capabilities.range_gain?.mode === 'steps') {
    return { message: `Lowered ${stretchesWord(count)} by ${db} dB in ${setup.daw}.`, undoSteps: count, steps: ['Select the stretch', `Lower it by ${db} dB`] };
  }
  return { message: rangeGainAnswer(setup.daw, count, db), undoSteps: 1 };
}

/** DawReduceRangeGain's checks after the capability's, in the host's order (bindings_daw_reduce_range_gain.go): the dB, the stretches'
 * shape, a take the project's track does not hold and a stretch outside the part of the file it plays (code stale); then what the
 * setup's DAW answers. */
export function rangeGainAnswerOf(
  setup: DawCapabilities,
  project: DawProject,
  chapterId: string,
  takeId: string,
  stretches: readonly DawGainStretch[],
  reduceDb: number,
): { refused: string; stale: boolean } | { result: DawResult } {
  if (!Number.isFinite(reduceDb) || reduceDb < 1 || reduceDb > 24) return { refused: DAW_ANSWERS.gainBadDb, stale: false };
  if (stretches.length === 0 || stretches.length > 500 || stretches.some(({ start, end }) => !(start >= 0) || !Number.isFinite(end) || !(end > start))) {
    return { refused: DAW_ANSWERS.gainBadStretches, stale: false };
  }
  const take = project.chapterIds.includes(chapterId) ? project.gainTakes?.[takeId] : undefined;
  if (!take) return { refused: gainStaleOf(setup).gone, stale: true };
  if (stretches.some(({ start, end }) => start < take.from || end > take.to)) return { refused: gainStaleOf(setup).outside, stale: true };
  const gain = rangeGainOf(setup, stretches.length, reduceDb);
  return { result: { ok: true, changed: true, message: gain.message, undoSteps: gain.undoSteps, ...(gain.steps ? { steps: gain.steps } : {}) } };
}

/** bindings_daw_repair_click.go: a take the chapter's track no longer holds, and a click outside it, both answered with code stale. */
export function clickTakeStaleAnswer(daw: string): string {
  return `That take is no longer on this chapter's track in the ${daw} project, so no click was repaired. Read the project again.`;
}
export function clickOutsideAnswer(daw: string): string {
  return `A click to repair is no longer inside that take in the ${daw} project, so no click was repaired. Read the project again.`;
}

const clicksWord = (count: number): string => (count === 1 ? '1 click' : `${count} clicks`);

/** dawport/reaper's click_repair role: `count` clicks repaired in `daw`, one undo step there. */
export function repairClickAnswer(daw: string, count: number): string {
  return `Repaired ${clicksWord(count)} in ${daw}. Undo it there in one step.`;
}

/** Whether every click is in the shape the host takes (bridge.ClickInShape): 1 to 500 clicks, each starting at or after 0, ending after
 * it starts and at most 50 ms long (with the six decimals the command sends). */
export function clicksInShape(clicks: readonly DawClick[]): boolean {
  return (
    clicks.length > 0 &&
    clicks.length <= 500 &&
    clicks.every(({ start, end }) => start >= 0 && Number.isFinite(end) && end > start && end - start <= 0.05 + 0.000001)
  );
}

/** What repairing `count` clicks answers on one of DAW_SETUPS once `click_repair` is available, by its mode: one undo step where the DAW
 * makes it as one action (REAPER), and Audacity's steps (dawport/audacity's RepairClick), one undo step per selection; the mock counts
 * each click as its own selection. */
function repairClickOf(setup: DawCapabilities, count: number): { message: string; undoSteps: number; steps?: string[] } {
  if (setup.capabilities.click_repair?.mode === 'steps') {
    return { message: `Repaired ${clicksWord(count)} in ${setup.daw}.`, undoSteps: count, steps: ['Select around the click', 'Run Click Removal on it'] };
  }
  return { message: repairClickAnswer(setup.daw, count), undoSteps: 1 };
}

/** DawRepairClick's checks after the capability's, in the host's order (bindings_daw_repair_click.go): the clicks' shape, a take the
 * project's track does not hold and a click outside the part of the file it plays (code stale); then what the setup's DAW answers. */
export function repairClickAnswerOf(
  setup: DawCapabilities,
  project: DawProject,
  chapterId: string,
  takeId: string,
  clicks: readonly DawClick[],
): { refused: string; stale: boolean } | { result: DawResult } {
  if (!clicksInShape(clicks)) return { refused: DAW_ANSWERS.clickBad, stale: false };
  const take = project.chapterIds.includes(chapterId) ? project.clickTakes?.[takeId] : undefined;
  if (!take) return { refused: clickTakeStaleAnswer(setup.daw), stale: true };
  if (clicks.some(({ start, end }) => start < take.from || end > take.to)) return { refused: clickOutsideAnswer(setup.daw), stale: true };
  const repair = repairClickOf(setup, clicks.length);
  return { result: { ok: true, changed: true, message: repair.message, undoSteps: repair.undoSteps, ...(repair.steps ? { steps: repair.steps } : {}) } };
}

/** The settings the mocks read for a chain on words (SN-E104): one effect with a continuous gain and a stepped mode, in the order
 * REAPER's fx_range_params lists them. */
export const FX_RANGE_SETTINGS: readonly DawFxSetting[] = [
  { fx: 0, fxName: 'VST: ReaEQ (Cockos)', index: 0, name: 'Gain', value: 0, min: -24, max: 24, step: 0, formatted: '0 dB' },
  { fx: 0, fxName: 'VST: ReaEQ (Cockos)', index: 1, name: 'Mode', value: 0, min: 0, max: 3, step: 1, formatted: '0' },
];

/** dawport/reaper's fx_range editor: the settings read, a setting set (with the value as the effect shows it), and a bypass. */
export function fxSettingsReadAnswer(chain: string, count: number, daw: string): string {
  return `Read ${count} setting${plural(count)} of ${chain} in ${daw}.`;
}
export function fxSettingSetAnswer(chain: string, formatted: string, daw: string): string {
  return `Set ${chain} to ${formatted} in ${daw}. Undo it there in one step.`;
}
export function fxBypassAnswer(chain: string, bypass: boolean, daw: string): string {
  return bypass ? `${chain} bypassed in ${daw}. Undo it there in one step.` : `${chain} turned back on in ${daw}. Undo it there in one step.`;
}

/** DawFxRangeParams' answer after the capability, the range and the chain name (bindings_daw_fx_range.go): an engine that bakes the
 * effect in (fx_range in steps, Audacity) refuses; otherwise FX_RANGE_SETTINGS, read with no undo step. */
export function fxRangeParamsAnswerOf(setup: DawCapabilities, chain: string): { refused: string } | { settings: DawFxRangeSettings } {
  if (setup.capabilities.fx_range?.mode === 'steps') return { refused: DAW_ANSWERS.fxBakedIn };
  const settings = FX_RANGE_SETTINGS.map((setting) => ({ ...setting }));
  return {
    settings: {
      result: { ok: true, changed: false, message: fxSettingsReadAnswer(chain, settings.length, setup.daw), undoSteps: 0 },
      settings,
      truncated: false,
      bypassed: false,
    },
  };
}

/** DawSetFxRangeParam's answer after the capability, the range and the chain name, in the host's order: a setting the effect does not
 * have, a value that is not a number, an engine that bakes the effect in, a value outside the setting's range (narration_range.lua); then
 * one undo step, or none when the setting already has the value. */
export function fxRangeSetAnswerOf(
  setup: DawCapabilities,
  chain: string,
  fx: number,
  index: number,
  value: number,
): { refused: string } | { result: DawResult } {
  if (!Number.isInteger(fx) || !Number.isInteger(index) || fx < 0 || index < 0) return { refused: DAW_ANSWERS.fxNoSetting };
  if (!Number.isFinite(value)) return { refused: DAW_ANSWERS.fxBadValue };
  if (setup.capabilities.fx_range?.mode === 'steps') return { refused: DAW_ANSWERS.fxBakedIn };
  const setting = FX_RANGE_SETTINGS.find((candidate) => candidate.fx === fx && candidate.index === index);
  if (!setting) return { refused: DAW_ANSWERS.fxNoSetting };
  if (value < setting.min || value > setting.max) return { refused: DAW_ANSWERS.fxValueOutside };
  const formatted = setting.name === 'Gain' ? `${value} dB` : String(value);
  if (value === setting.value)
    return {
      result: { ok: true, changed: false, message: `That setting of ${chain} is already ${formatted} in ${setup.daw}, so nothing changed.`, undoSteps: 0 },
    };
  return { result: { ok: true, changed: true, message: fxSettingSetAnswer(chain, formatted, setup.daw), undoSteps: 1 } };
}

/** DawBypassFxRange's answer after the capability, the range and the chain name: an engine that bakes the effect in refuses; otherwise one
 * undo step (the mock keeps no state, so a chain is never already as asked). */
export function fxRangeBypassAnswerOf(setup: DawCapabilities, chain: string, bypass: boolean): { refused: string } | { result: DawResult } {
  if (setup.capabilities.fx_range?.mode === 'steps') return { refused: DAW_ANSWERS.fxBakedIn };
  return { result: { ok: true, changed: true, message: fxBypassAnswer(chain, bypass, setup.daw), undoSteps: 1 } };
}

/** How long each pass of a mock Compare plays, in seconds: the piece of the goldens' words (1 to 1.5 s). */
export const FX_COMPARE_PASS = 0.5;

/** dawport/reaper's Compare: the words with the chain on, then bypassed, then put back, adding no undo step. */
export function fxCompareAnswer(chain: string, daw: string): string {
  return `Playing the words in ${daw} with ${chain} on, then bypassed. It is put back as it was after.`;
}

/** DawCompareFxRange's answer after the capability, the range and the chain name (bindings_daw_fx_compare.go): an engine that bakes the
 * effect in refuses; otherwise two passes of FX_COMPARE_PASS seconds, with no undo step. */
export function fxRangeCompareAnswerOf(setup: DawCapabilities, chain: string): { refused: string } | { compare: DawFxRangeCompare } {
  if (setup.capabilities.fx_range?.mode === 'steps') return { refused: DAW_ANSWERS.fxBakedIn };
  return { compare: { result: { ok: true, changed: false, message: fxCompareAnswer(chain, setup.daw), undoSteps: 0 }, pass: FX_COMPARE_PASS } };
}

/** DawStopFxCompare's answer once the capability is allowed: the mock plays no Compare, so there is none to stop. */
export function fxCompareStopAnswerOf(setup: DawCapabilities): DawResult {
  if (setup.capabilities.fx_range?.mode === 'steps')
    return { ok: false, changed: false, message: DAW_ANSWERS.fxBakedIn, undoSteps: 0, refused: DAW_ANSWERS.fxBakedIn };
  return { ok: true, changed: false, message: `${setup.daw} was not comparing an effect, so nothing changed.`, undoSteps: 0 };
}

/** dawport/builtin's HideTakes: the built-in recorder already plays only the kept take, so it mutes nothing. */
export const BUILTIN_NOTHING_TO_MUTE = 'The built-in recorder plays only the kept take, so there is nothing to mute.';

/** What hiding `muted` other takes answers on one of DAW_SETUPS, as its adapter words it: the built-in recorder (`daw: 'none'`
 * until the Booth names it) changes nothing, and any other DAW names itself. */
export function takesHiddenOf(setup: DawCapabilities, muted: number): { changed: boolean; message: string } {
  if (setup === DAW_SETUPS.builtin || setup.daw === 'none' || setup.daw === 'Built-in') return { changed: false, message: BUILTIN_NOTHING_TO_MUTE };
  return { changed: muted > 0, message: takesHiddenAnswer(muted, setup.daw) };
}

/** The seconds a backup takes either side of the edit by default (DAW.backups.window_seconds; audacity.DefaultBackupWindow). */
const DAW_BACKUP_WINDOW_SECONDS = 120;

/** dawport/audacity's `seconds`: whole seconds, or tenths below ten. */
const backupSeconds = (seconds: number): string => String(seconds < 10 ? Math.round(seconds * 10) / 10 : Math.round(seconds));

/** dawport/audacity's Backups: a backup of `seconds` of audio in `daw`. */
export function backedUpAnswer(seconds: number, daw: string): string {
  return `Backed up ${backupSeconds(seconds)} s of audio in ${daw}.`;
}

/** dawport/audacity's Backups: `seconds` of audio put back from a backup in `daw`. */
export function backupRestoredAnswer(seconds: number, daw: string): string {
  return `Restored ${backupSeconds(seconds)} s of audio from the backup in ${daw}.`;
}

/** dawport/audacity's Backups: an id the table does not have. */
export function noBackupAnswer(daw: string): string {
  return `${daw} has no backup with that id.`;
}

/** Whether a backup label is one the host keeps (bindings_daw_backups.go backupLabel): 1 to 256 bytes, no control characters. */
export function backupLabelOk(label: string): boolean {
  // eslint-disable-next-line no-control-regex
  return label.length > 0 && new TextEncoder().encode(label).length <= 256 && !/[\u0000-\u001f\u007f-\u009f]/.test(label);
}

/** A backups table as the Audacity adapter keeps it, for the mocks. The mock has no alignment, so the words of token `i` are at second
 * `i`, and the window is DAW_BACKUP_WINDOW_SECONDS either side of them, from 0. Rows are stamped by a fixed clock a minute apart, and
 * ids are GUID-shaped. The caller checks the capability, the label and the chapter first. */
export class MockBackupTable {
  private rows: DawBackup[] = [];
  private ticks = 0;

  private stamp(): string {
    this.ticks += 1;
    return new Date(Date.UTC(2026, 9, 12, 9, 30 + this.ticks)).toISOString().replace('.000Z', 'Z');
  }

  backup(setup: DawCapabilities, chapterId: string, firstToken: number, lastToken: number, label: string): DawResult {
    const start = Math.max(0, firstToken - DAW_BACKUP_WINDOW_SECONDS);
    const end = lastToken + 1 + DAW_BACKUP_WINDOW_SECONDS;
    const id = `{00000000-0000-4000-8000-${(this.rows.length + 1).toString(16).toUpperCase().padStart(12, '0')}}`;
    this.rows.push({ id, guid: chapterId, chapterId, start, end, createdAt: this.stamp(), label });
    const message = backedUpAnswer(end - start, setup.daw);
    return { ok: true, changed: false, message, undoSteps: 0 };
  }

  restore(setup: DawCapabilities, id: string): DawResult {
    const row = this.rows.find((each) => each.id === id);
    if (!row) {
      const sentence = noBackupAnswer(setup.daw);
      return { ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence };
    }
    row.restored = this.stamp();
    return { ok: true, changed: true, message: backupRestoredAnswer(row.end - row.start, setup.daw), undoSteps: 1 };
  }

  /** The rows, newest first, as DawBackups answers them. */
  list(): DawBackup[] {
    return [...this.rows].reverse().map((row) => ({ ...row }));
  }
}
