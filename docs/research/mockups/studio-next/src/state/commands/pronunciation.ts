import type { Draft } from 'immer'
import { pronunciation } from '@/providers/pronunciation'
import { toast, toastUndo } from '@/ui/overlay'
import { act, getState, update } from '../store'
import type { StudioState } from '../types'

/** What a pronunciation belongs to: a word flagged in the text (Script), or one name of a Story Bible entry. */
export type PronTarget = { kind: 'word'; word: string } | { kind: 'name'; entryId: string; name: string }

const textOf = (t: PronTarget): string => (t.kind === 'word' ? t.word : t.name)

/** Write a value and the source it came from. The first name of an entry also sets the entry's own pronunciation. */
export function writePron(d: Draft<StudioState>, t: PronTarget, say: string, src: string): void {
  if (t.kind === 'word') {
    d.data.pronunciations[t.word] = { say, src }
    return
  }
  const e = d.data.bible.find((x) => x.id === t.entryId)
  if (!e) return
  e.sayA = { ...(e.sayA ?? {}), [t.name]: say }
  e.saySrc = { ...(e.saySrc ?? {}), [t.name]: src }
  if (t.name === e.aka[0]) e.say = say
}

/** Words are changed with an offer to undo; names are inside an entry's Edit, where Cancel puts everything back. */
function change(t: PronTarget, label: string, fn: (d: Draft<StudioState>) => void, msg?: string): void {
  if (t.kind === 'name') {
    update(fn)
    return
  }
  const entry = act(label, fn)
  if (msg) toastUndo(msg, entry)
}

/** The narrator types it: the value is theirs, whatever it was before. */
export function setPronText(t: PronTarget, say: string): void {
  change(t, 'Changed a pronunciation', (d) => writePron(d, t, t.kind === 'word' ? say.trim() : say, say.trim() ? 'manual' : ''))
}

/**
 * Take the pronunciation from a source, or switch to entering it by hand (the text stays as it is). Returns false when the source
 * has nothing to offer, and says why. Changing the source is always allowed and can be undone.
 */
export function setPronSource(t: PronTarget, sourceId: string): boolean {
  const provider = pronunciation()
  const src = provider.sources().find((s) => s.id === sourceId)
  if (!src) return false
  if (src.kind === 'manual') {
    const cur = t.kind === 'word' ? getState().data.pronunciations[t.word]?.say ?? '' : getState().data.bible.find((e) => e.id === t.entryId)?.sayA?.[t.name] ?? ''
    change(t, 'Pronunciation: ' + src.label, (d) => writePron(d, t, cur, 'manual'))
    return true
  }
  const r = provider.candidate(textOf(t), sourceId)
  if (!r.ok) {
    toast(r.reason)
    return false
  }
  change(t, 'Pronunciation: ' + src.label, (d) => writePron(d, t, r.say, sourceId), 'Pronunciation from ' + src.label + '.')
  return true
}

/** A name or word that has nothing yet takes the default source's candidate, when it has one. */
export function takeDefaultPron(d: Draft<StudioState>, t: PronTarget): void {
  const provider = pronunciation()
  const id = provider.defaultSource()
  const r = provider.candidate(textOf(t), id)
  if (r.ok) writePron(d, t, r.say, id)
}
