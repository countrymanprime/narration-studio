import type { MarkColour } from '@/domain/schemas'
import { toast } from '@/ui/overlay'
import { getState, update } from '../store'
import type { MockState } from '../slices/mock'

export const TYPE_COLOURS: Array<[MarkColour, string]> = [['violet', 'Violet'], ['info', 'Blue'], ['ok', 'Green'], ['warn', 'Amber'], ['bad', 'Red'], ['copper', 'Copper']]

export function setRecording(setup: MockState['setup']): void {
  update((d) => { d.mock.setup = setup })
}
export function toggleLocalDictionary(): void {
  const next = getState().mock.dictLocal === 'installed' ? 'missing' : 'installed'
  update((d) => { d.mock.dictLocal = next })
  toast(next === 'installed' ? 'Local dictionary downloaded.' : 'Local dictionary removed.')
}

/** Rename a Story Bible type: entries of that type and the Story Bible filter follow. Returns false when the name is empty or taken. */
export function renameType(index: number, to: string): boolean {
  const v = to.trim()
  const { data } = getState()
  const t = data.bibleTypes[index]
  if (!t || !v || data.bibleTypes.some((x) => x.k === v)) return false
  update((d) => {
    const old = d.data.bibleTypes[index].k
    d.data.bible.forEach((e) => { if (e.kind === old) e.kind = v })
    if (d.ui.bible.kind === old) d.ui.bible.kind = v
    d.data.bibleTypes[index].k = v
  })
  return true
}
export function setTypeColour(index: number, c: MarkColour): void {
  update((d) => { d.data.bibleTypes[index].c = c })
}
/** Entries of this type can (or no longer can) be picked as the speaker of a quoted line. */
export function setTypeSpeaks(index: number, speaks: boolean): void {
  update((d) => {
    const t = d.data.bibleTypes[index]
    if (t) t.speaker = speaks
  })
}
export function removeType(index: number): void {
  update((d) => {
    const t = d.data.bibleTypes[index]
    if (!t || d.data.bibleTypes.length < 2 || d.data.bible.some((e) => e.kind === t.k)) return
    d.data.bibleTypes.splice(index, 1)
    if (d.ui.bible.kind === t.k) d.ui.bible.kind = 'All'
  })
}
export function addType(name: string): boolean {
  const v = name.trim()
  if (!v || getState().data.bibleTypes.some((x) => x.k === v)) {
    toast('Give the type a new name.')
    return false
  }
  update((d) => { d.data.bibleTypes.push({ k: v, c: TYPE_COLOURS[d.data.bibleTypes.length % TYPE_COLOURS.length][0] }) })
  return true
}
