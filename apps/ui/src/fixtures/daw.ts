import type { DawBackup, DawCapabilities, DawCapabilityKey, DawCapabilitySupport, DawProjectState, DawResult } from '../api/contracts/daw';
import { DAW_CAPABILITIES } from '../api/contracts/daw';

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
const AUDACITY_NO_TAKES = 'Audacity keeps no takes. Turn on backups to keep them.';
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
  silence_trim: 'experimental',
  item_gain: 'experimental',
  render_with_fx: 'experimental',
  master_chain_read: 'experimental',
  macro_render: 'unsupported',
  cut_range: 'experimental',
  fx_range: 'experimental',
  stack_takes: 'experimental',
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

/** REAPER's Describer (dawport/reaper): a roll keeps the earlier audio as a take, a cut moves the audio to the muted Cuts track, a
 * chain on a range is take FX on a split piece that come off again, and a stack makes later reads takes and moves their items to the
 * Cuts track, so punch, cut_range, fx_range and stack_takes are native and not destructive (ADR 0860). */
const REAPER_DEPTH: Rows = {
  punch: { level: 'experimental', available: true, mode: 'native' },
  cut_range: { level: 'experimental', available: true, mode: 'native' },
  fx_range: { level: 'experimental', available: true, mode: 'native' },
  stack_takes: { level: 'experimental', available: true, mode: 'native' },
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
  },
);
const audacityExperimental: DawCapabilitySupport = { level: 'experimental', available: true };

/** Audacity today: labels, navigation and backups work, and nothing else is built. A roll replaces audio there, so `punch` is
 * destructive. Without backups the `backups` row is the narrator's toggle turned off, as the resolver words it. */
const audacityCapabilities = (backups: boolean): DawCapabilities['capabilities'] =>
  everyCapability(() => notYet(AUDACITY_NOT_YET), {
    markers: audacityExperimental,
    navigate: audacityExperimental,
    backups: backups ? audacityExperimental : { level: 'experimental', available: false, reason: 'turned_off', message: TURNED_OFF },
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
  /** The narrator's saved FX chains as the DAW lists them (list_fx_chains). */
  fxChains?: readonly string[];
  /** The passages the DAW could stack (bindings_daw_stack.go names them `pm-<chapter>-<paragraph>`). */
  passageIds?: readonly string[];
};

export const DAW_PROJECT: DawProject = {
  chapterIds: ['chapter-1', 'chapter-2'],
  candidateIds: ['take-1', 'take-2', 'take-solo'],
  findingIds: ['finding-1'],
  otherTakes: { 'take-1': 1, 'take-2': 1, 'take-solo': 0 },
  // The chains of tests/fixtures/contracts/workspace-fx-chains.json, so the mock lists what the host stand-in does.
  fxChains: ['Podcast Voice.RfxChain', 'Vocal Chain/Warmth.RfxChain'],
  passageIds: ['pm-chapter-1-p-1'],
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
  /** bindings_daw_range.go (SN-D65): delete_range's own mode and fade sentences, and words the edit log already holds as cut (changed false). */
  cutBadMode: 'The cut mode must be close or gap.',
  cutBadFade: 'The fade must be a whole number of milliseconds from 0 to 500.',
  cutAlreadyCut: 'These words are already cut, so nothing was changed.',
  /** internal/passagetakes' range.go: a token range outside the chapter's alignment (code stale), words not heard, words on two items. */
  rangeStale: "That selection is not in this chapter's alignment any more, so nothing was changed. Reload the chapter and select the words again.",
  rangeNotHeard: "These words weren't heard in the recording, so there's no audio to cut. Run the check again if the chapter has changed.",
  rangeCrossesItems: 'These words cross two REAPER items. Select words from one item at a time.',
  /** bindings_daw_fx_range.go (SN-D66): a chain REAPER does not list (apply_fx_range's own sentence), and words not heard, in an effect's words. */
  fxBadChain: 'That FX chain is not in the FXChains folder REAPER lists.',
  fxNotHeard: "These words weren't heard in the recording, so there's no audio to put an effect on. Run the check again if the chapter has changed.",
  /** bindings_daw_stack.go (SN-D72): a passage id the chapter's passage map does not list (code stale), and a kept take. */
  stackNotAPassage: "That passage is not one of this chapter's passages any more, so nothing was changed. Read the chapter again.",
  stackKept: 'A take of this passage has been kept, so its reads cannot be stacked or moved back.',
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
