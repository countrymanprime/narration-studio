/**
 * Dialogs that several pages open. The page that owns a dialog assigns its opener here when its module loads,
 * so callers never import another page. Until assigned, an opener does nothing visible.
 */
import { toast } from '@/ui/overlay'

const missing = (name: string) => () => toast(name + ' is not available yet.')

export const modals = {
  /** Import (first time) or replace (re-import) the manuscript. Production page. */
  importFlow: missing('Import') as (mode: 'import' | 'replace') => void,
  /** Choose a project. Production page. */
  projectPicker: missing('The project picker') as () => void,
  /** Choose what goes in the status report and export it. Production page. */
  statusReport: missing('The status report') as () => void,
  /** Chapters changed by a replaced manuscript. Production page. */
  flags: missing('Chapter review') as () => void,
  /** Define my marks. Script page. */
  marks: missing('Define marks') as () => void,
  /** Check recordings against the manuscript. Pickups page. */
  checkRecordings: missing('Check recordings') as (preselect?: string[]) => void,
  /** Ask before retries are stacked on the first read (or put back where they were). Editing page. */
  stackTakes: missing('Stacking takes') as (ask: { kind: 'stack' | 'unstack'; chapterId: string; passageIds: string[]; takeIds?: string[] }) => void,
  /** Ask before words and their audio are cut from the script (or muted). Editing page. */
  cutWords: missing('Delete words and audio') as (ask: { keys: string[]; mute?: boolean }) => void,
  /** Preview and confirm an effect on a range of words. Editing page. */
  wordFx: missing('Add FX') as (ask: { keys: string[]; chainId?: string }) => void,
  /** Write a note on words of the script. Editing page. */
  wordNote: missing('Add a note') as (ask: { keys: string[] }) => void,
  /** The jump menu / search. App. */
  palette: missing('The jump menu') as (preset?: string) => void,
  help: missing('Keyboard shortcuts') as () => void,
  history: missing('Undo history') as () => void,
  mockStates: missing('Mock states') as () => void,
}
