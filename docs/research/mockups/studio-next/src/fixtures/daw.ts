/**
 * Sample data behind the mock DAW: what each recording setup can do, how the project stands, which chapters have tracks, and the
 * words the mock DAW answers with when it refuses. A real bridge reports all of this itself; nothing in a screen or a command
 * reads these constants directly, they go through selectors/daw.ts and the DawAdapter.
 */
import { DawCapabilities, DawProjectState, type Capability } from '@/domain/daw'
import { WPH } from '@/config/estimates'
import type { Chapter } from '@/domain/schemas'
import { CHAPTERS } from './alice'

/** The recording setups the mock can be in, and the DAW each one is. */
export const SETUP_DAW: Record<string, string> = { reaper: 'reaper', 'reaper-off': 'reaper', builtin: 'builtin', audacity: 'audacity' }

export const DAW_LABEL: Record<string, string> = { reaper: 'REAPER', builtin: 'The built-in recorder', audacity: 'Audacity' }
/** The name on a chip: what the recorder is called on its own. */
export const DAW_SHORT: Record<string, string> = { reaper: 'REAPER', builtin: 'Built-in recorder', audacity: 'Audacity' }

/** Every capability the app asks a DAW about. */
export const CAPABILITY_NAMES = ['record', 'roll', 'goto', 'play', 'markers', 'cleanup', 'takes', 'fx', 'takeFx', 'open', 'backups', 'stackTakes', 'cutRange', 'fxRange'] as const

const on = (level: Capability['level'] = 'supported', more: Partial<Capability> = {}): Capability => ({ level, available: true, ...more })
const off = (reason: string, level: Capability['level'] = 'notYetAvailable'): Capability => ({ level, available: false, reason })

const NOT_RUNNING = 'REAPER is not running.'
const BUILTIN_REASON = 'Not available with the built-in recorder.'
const AUDACITY_REASON = 'Not available for Audacity yet.'

const REAPER_CAPS: Record<string, Capability> = {
  record: on('experimental'), roll: on('experimental', { destructive: false }), goto: on(), play: on(), markers: on(), cleanup: on(),
  takes: on(), fx: on(), takeFx: on(), open: on(), backups: off('REAPER keeps takes itself, so it needs no backups.', 'unsupported'),
  stackTakes: on('supported', { mode: 'native' }),
  cutRange: on('experimental', { mode: 'native' }), fxRange: on('experimental', { mode: 'native' }),
}

/** What each setup reports. The setup id is the key; `reaper-off` is the same DAW that cannot be reached. */
const CAPS: Record<string, DawCapabilities> = {
  reaper: { daw: 'reaper', reachable: true, caps: REAPER_CAPS },
  'reaper-off': {
    daw: 'reaper', reachable: false,
    /* Playing a recording is the app's own; everything that needs REAPER waits until it runs. */
    caps: Object.fromEntries(Object.entries(REAPER_CAPS).map(([k, c]) => [k, k === 'play' ? c : { ...c, available: false, reason: NOT_RUNNING }])),
  },
  builtin: {
    daw: 'builtin', reachable: true,
    caps: {
      record: on(), roll: on('supported', { destructive: false }), goto: off(BUILTIN_REASON, 'unsupported'), play: on(), markers: off(BUILTIN_REASON, 'unsupported'),
      cleanup: off(BUILTIN_REASON, 'unsupported'), takes: on(), fx: off(BUILTIN_REASON, 'unsupported'), takeFx: off('Per-take effects need a DAW that keeps takes on tracks.', 'unsupported'), open: off(BUILTIN_REASON, 'unsupported'),
      backups: off(BUILTIN_REASON, 'unsupported'), stackTakes: on('supported', { mode: 'app' }),
      cutRange: on('supported', { mode: 'app' }), fxRange: on('supported', { mode: 'app' }),
    },
  },
  audacity: {
    daw: 'audacity', reachable: true,
    caps: {
      record: on('experimental'), roll: on('experimental', { destructive: true }), goto: on('experimental'), play: on('experimental'), markers: on('experimental'),
      cleanup: off(AUDACITY_REASON), takes: off('Audacity keeps no takes. Turn on backups to keep them.'), fx: off(AUDACITY_REASON), takeFx: off(AUDACITY_REASON), open: off(AUDACITY_REASON),
      backups: off('Backups are off.'), stackTakes: off('Turn on backups to stack takes in Audacity.'),
      cutRange: off('Turn on backups to cut audio in Audacity. It changes the audio itself.'), fxRange: off('Turn on backups to add effects in Audacity. It changes the audio itself.'),
    },
  },
}

/** What changes when Audacity clones the audio around a punch into its backups: a roll no longer loses anything. */
export const AUDACITY_BACKUP_CAPS: Record<string, Capability> = {
  roll: on('experimental', { destructive: false }),
  takes: on('experimental'),
  backups: on('experimental'),
  stackTakes: on('experimental', { mode: 'steps' }),
  cutRange: on('experimental', { mode: 'steps' }),
  fxRange: on('experimental', { mode: 'steps' }),
}

export const CAPABILITY_SETS = Object.fromEntries(Object.entries(CAPS).map(([k, v]) => [k, DawCapabilities.parse(v)]))

/**
 * What stacking retries on the first read does in each kind of DAW: how it can be undone, and the edits the app performs where the DAW has
 * no native way (a new take track, paste, split, shift, mute). `{daw}` is the DAW's name.
 */
export const STACK_PLAN: Record<NonNullable<Capability['mode']>, { undo: string; steps: string[] }> = {
  native: { undo: '{daw} does this as one action, so it is one undo step.', steps: [] },
  app: { undo: 'The app makes this change itself. Undo in the app puts the takes back.', steps: [] },
  steps: {
    undo: '{daw} cannot do this as one action, so it is {n} undo steps. A backup of the audio around the takes is made first, and Undo in the app puts it back.',
    steps: [
      'Add a take track',
      'Paste each later read into it',
      'Split at the point where the reads line up',
      'Shift the audio that follows to close the gap',
      'Mute the reads that are not on top',
    ],
  },
}

/**
 * What cutting words and putting an effect on words does in each kind of DAW, in the words of the question: where the audio goes, how the
 * DAW undoes it, and how many undo points it adds (`undoSteps`; 0 where the app keeps its own edit list). `{n}` is the number of words, `{chain}`
 * the chain, `{from}` and `{to}` the backed-up stretch, `{daw}` the DAW's name.
 */
export interface RangePlan {
  cut: string
  cutUndo: string
  cutSteps: number
  /** The line under "Keep the cut audio", or empty when the DAW has no such choice. */
  keep: string
  fx: string
  fxUndo: string
  fxSteps: number
  /** The button that applies an effect to the words, and the verb in the history. */
  fxButton: string
  /** Whether the DAW changes the audio itself, so a backup is made first and cannot be switched off. */
  backup: boolean
}
export const RANGE_PLAN: Record<NonNullable<Capability['mode']>, RangePlan> = {
  native: {
    cut: '{daw} splits the item at both ends and moves the middle piece to a muted track named Cuts. The recording file is not touched.',
    cutUndo: 'One undo step in {daw}: Edit > Undo “Narration Studio: delete {n} words and audio”.',
    cutSteps: 1,
    keep: 'Keep the cut audio on a muted track (Cuts)',
    fx: '{daw} splits the item at both ends, then adds the chain to the middle piece.',
    fxUndo: 'One undo step in {daw}: Edit > Undo “Narration Studio: add {chain} to {n} words”.',
    fxSteps: 1,
    fxButton: 'Split and add effect',
    backup: false,
  },
  app: {
    cut: 'The original file is kept. The cut is one entry in the app’s edit list: it plays back and exports without those words, and the entry can be removed later.',
    cutUndo: 'Undo in the app (Ctrl+Z) removes the entry from the edit list.',
    cutSteps: 0,
    keep: 'Keep the cut in the edit list so it can be undone later',
    fx: 'The recorder keeps the effect in the edit list for this range and renders it on export.',
    fxUndo: 'Undo in the app (Ctrl+Z) removes the entry from the edit list.',
    fxSteps: 0,
    fxButton: 'Add effect',
    backup: false,
  },
  steps: {
    cut: '{daw} changes the audio itself. Before cutting, the app copies the track from {from} to {to} to Backups, then selects the range, deletes it and closes the gap.',
    cutUndo: 'Two undo steps in {daw} (select, then delete): Edit > Undo twice. After that, Backups still has the full copy.',
    cutSteps: 2,
    keep: '',
    fx: '{daw} applies the effect to the selection. It changes the audio itself, so the stretch from {from} to {to} is backed up first.',
    fxUndo: 'Two undo steps in {daw} (select, then apply). The stretch stays in Backups, so it can be restored from the Editing page.',
    fxSteps: 2,
    fxButton: 'Apply to selection',
    backup: true,
  },
}

/** The saved project of each DAW. The built-in recorder keeps no project file. */
export const SAVED_PROJECT: Record<string, DawProjectState['savedAt']> = { reaper: '2026-09-26T08:40', builtin: null, audacity: '2026-09-25T17:05' }

/** Does the DAW need one track for the chapter before it records? The built-in recorder keeps its own takes per chapter. */
export const NEEDS_TRACK: Record<string, boolean> = { reaper: true, builtin: false, audacity: true }

/** Chapters that have no track yet, and chapters with more than one, in the sample project. */
export const TRACKS_MISSING: string[] = ['12']
export const TRACKS_SEVERAL: string[] = ['11']

/** What the mock DAW says when it refuses a record. `{daw}` is the DAW's name. */
export const REFUSAL_TEXT: Record<string, string> = {
  no_track: 'There is no track for this chapter in {daw}.',
  several_tracks: 'More than one track is set up for this chapter in {daw}.',
  busy: 'Stop playback in {daw} first.',
  not_recording: 'Nothing is recording.',
  confirm_needed: 'Rolling again replaces audio in {daw}. Confirm first.',
  no_backup: 'There is no backup of that audio in {daw}. Nothing was changed.',
  item_stale: 'That item changed in {daw} since the app read it. Nothing was changed.',
  take_stale: 'That take changed in {daw} since the app read it. Nothing was changed.',
  nothing_to_stack: 'There are no retries to move in {daw}.',
}

/** The seconds a chapter's recording takes at the standard rate. */
export const chapterSeconds = (c: Pick<Chapter, 'words'>): number => (c.words / WPH) * 3600

/** One track per chapter (but not the ones listed as missing), with the recording so far as one item from the start. */
export function sampleTracks(chapters: Chapter[] = CHAPTERS): Array<{ chapterId: string; name: string; end: number }> {
  const out: Array<{ chapterId: string; name: string; end: number }> = []
  for (const c of chapters) {
    if (TRACKS_MISSING.includes(c.id)) continue
    const end = Math.round((c.rec / 100) * chapterSeconds(c))
    out.push({ chapterId: c.id, name: c.title, end })
    if (TRACKS_SEVERAL.includes(c.id)) out.push({ chapterId: c.id, name: c.title + ' (second)', end: 0 })
  }
  return out
}
