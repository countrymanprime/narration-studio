import { chName, paragraphChapter, recordingChapterOf } from '@/selectors/chapters'
import { openQueries } from '@/selectors/annotations'
import { go, openInBooth, openInScript } from '@/state/commands/nav'
import { daw } from '@/state/daw'
import { capsOf, dawLabel, gateOf } from '@/selectors/daw'
import { toast } from '@/ui/overlay'
import { getState, update } from '../store'
import type { RateBasis } from '@/domain/schemas'
import { modals } from '@/app/modals'

/** The chapter being recorded now. */
export const recordingChapter = (b = getState().data) => recordingChapterOf(b)

/** A pipeline cell opens its stage for the chapter. */
export function cellAct(action: string): void {
  const [what, id] = action.split(':')
  const s = getState()
  if (what === 'script') openInScript(id)
  else if (what === 'booth') openInBooth(id)
  else if (what === 'edit') {
    const c = s.data.chapters.find((x) => x.id === id)
    const g = gateOf(s.mock, 'goto')
    toast(
      g.ok
        ? 'Editing happens in ' + g.label + '. Jumped to ' + (c ? chName(s.data, c) : '') + '.'
        : !capsOf(s.mock).reachable
          ? g.label + ' is not running, so the app cannot jump there.'
          : 'Editing happens in your DAW or audio editor. ' + g.label + ' does not edit.',
    )
  } else if (what === 'proof' || what === 'master' || what === 'pickups') go(what)
}

/** Open the Script page on the queries tab, at the first chapter with an open query. */
export function openQueriesInScript(chapterId?: string): void {
  const s = getState()
  const first = openQueries(s.data)[0]
  const ch = chapterId ?? (first ? paragraphChapter(s.data, first.p) : s.ui.chapter)
  update((d) => { d.ui.script.tab = 'queries' })
  openInScript(ch)
}

export function sessionChapter(): string {
  return recordingChapter()?.id ?? getState().ui.chapter
}

/** Cards and panel buttons on the Production page. */
export function prodAct(action: string): void {
  if (action === 'queries') openQueriesInScript()
  else if (action === 'flags') modals.flags()
  else if (action === 'edithelp') toast('Editing happens in your DAW. The app estimates hours from the audio it can see.')
  else if (action.startsWith('booth')) openInBooth(action.split(':')[1] || sessionChapter())
  else if (action === 'script') go('script')
  else go(action as Parameters<typeof go>[0])
}

export const startSession = (): void => openInBooth(sessionChapter())
export const exportReport = (): void => modals.statusReport()
export const retryDaw = (): void => toast('Still not running. Start ' + dawLabel(daw().capabilities().daw) + ' and try again.')
export const gotoInDaw = (chapterId: string): void => {
  const s = getState()
  const c = s.data.chapters.find((x) => x.id === chapterId)
  if (c) toast(daw().gotoChapter(chName(s.data, c)).message)
}

/** Choose the basis the schedule's finished hours use. A setting, so it is not an undo step. */
export const setRateBasis = (basis: RateBasis): void => update((d) => { d.data.rateBasis = basis })
