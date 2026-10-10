/**
 * The Booth's passage map. While a take records, the Booth writes where in the text each take began (and where the one before it
 * ended), and when the recording stops it stamps the log with the ids the DAW gave the item and take. Editing lists passages from this
 * log, so nothing has to be found by listening to takes recorded in the app.
 */
import type { Paragraph, PassageMark, TakeSource } from '@/domain/schemas'
import { wordsIn } from '@/format/text'
import { guidOf } from '@/format/guid'
import type { BoothUnit } from '@/selectors/booth'
import { capsOf } from '@/selectors/daw'
import { mergePassages, passagesFromMap } from '@/selectors/passagemap'
import { daw } from '../daw'
import { getState, update } from '../store'

let run: string | null = null

/** The place in the text a reading position stands at: the paragraph and the word in it. */
export function placeOf(paras: Paragraph[], units: BoothUnit[], cur: number, wcur: number): { pid: string; word: number } {
  const u = units[Math.max(0, Math.min(units.length - 1, cur))]
  const p = paras.find((x) => x.id === u.pid)
  return { pid: u.pid, word: (p ? wordsIn(p.text.slice(0, u.s)) : 0) + Math.max(0, wcur) }
}

const sourceFor = (daw: string): TakeSource => (daw === 'builtin' ? 'recorder' : daw === 'audacity' ? 'clip' : 'reaper')

const push = (m: Omit<PassageMark, 'id' | 'itemGuid' | 'takeGuid'>): void =>
  update((d) => { d.data.passageMap.push({ ...m, id: 'pm' + (d.data.passageMap.length + 1), itemGuid: '', takeGuid: '' }) })

/** A take begins at this place, this many seconds into the chapter recording. */
export function markStart(chapterId: string, at: { pid: string; word: number }, sec: number): void {
  const n = new Set(getState().data.passageMap.filter((m) => m.chapterId === chapterId).map((m) => m.run)).size + 1
  run = chapterId + '.' + n
  push({ run, chapterId, ...at, sec, kind: 'start' })
}
/** The narrator rolled again: the take before this ended at `prev`, and a new one begins at `at`. */
export function markRoll(chapterId: string, at: { pid: string; word: number }, prev: { pid: string; word: number }, sec: number): void {
  if (!run) return
  push({ run, chapterId, ...at, sec, kind: 'roll', prev })
}
/** The recording stopped with the reading at `prev`. The run's marks get the ids the DAW gave its item and takes, and Editing's passages follow. */
export function markStop(chapterId: string, prev: { pid: string; word: number }, sec: number, paras: Paragraph[]): void {
  if (!run) return
  const id = run
  run = null
  push({ run: id, chapterId, ...prev, sec, kind: 'stop', prev })
  const track = daw().tracks().find((t) => t.chapterId === chapterId)
  const item = track?.items[track.items.length - 1]
  update((d) => {
    const mine = d.data.passageMap.filter((m) => m.run === id)
    mine.forEach((m, i) => {
      m.itemGuid = item?.guid ?? guidOf('item', id)
      m.takeGuid = guidOf('take', (item?.guid ?? id) + '/' + Math.min(i, mine.length - 2))
    })
    d.data.passages = mergePassages(d.data.passages, passagesFromMap(d.data.passageMap, paras, chapterId, sourceFor(capsOf(d.mock).daw)))
  })
}
