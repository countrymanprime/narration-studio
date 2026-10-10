import type { BibleEntry, BookData, MarkColour, Relationship } from '@/domain/schemas'
import { entryById, nameOwner } from '@/selectors/bible'
import { verifyOf } from '@/selectors/extraction'
import { toast, toastUndo } from '@/ui/overlay'
import { act, getState, update } from '../store'
import type { BibleSort } from '../slices/ui'
import { setPronText, takeDefaultPron } from './pronunciation'

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entry'

/** A name no other entry has: "New entry", "New entry 2", … */
export function freeName(b: BookData, base = 'New entry'): string {
  let n = base
  let k = 1
  while (b.bible.some((e) => e.name === n)) n = base + ' ' + ++k
  return n
}
function freeId(b: BookData, name: string): string {
  const base = slug(name)
  let id = base
  let k = 1
  while (b.bible.some((e) => e.id === id)) id = base + '-' + ++k
  return id
}

type Draft = import('immer').Draft<import('../types').StudioState>
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/**
 * Put an entry being edited back as it was before Edit. A new entry that was never saved is dropped instead, with its
 * relationships. Whether the entry still needs review is not part of editing, so that stays as it is now.
 */
function restore(d: Draft): void {
  const ed = d.ui.bible.editing
  if (!ed) return
  const i = d.data.bible.findIndex((x) => x.id === ed.id)
  if (ed.draft) {
    if (i >= 0) d.data.bible.splice(i, 1)
    d.data.relationships = d.data.relationships.filter((r) => r.a !== ed.id && r.b !== ed.id)
    if (d.ui.bible.sel === ed.id) d.ui.bible.sel = null
    if (d.ui.script.entryId === ed.id) d.ui.script.entryId = null
  } else {
    if (i >= 0) {
      const review = d.data.bible[i].review
      d.data.bible[i] = clone(ed.entry)
      if (review) d.data.bible[i].review = clone(review)
      else delete d.data.bible[i].review
    }
    d.data.relationships = [...d.data.relationships.filter((r) => r.a !== ed.id && r.b !== ed.id), ...clone(ed.rels)]
  }
  d.ui.bible.editing = null
}
export function startEdit(id: string): void {
  const { data } = getState()
  const entry = entryById(data, id)
  if (!entry) return
  update((d) => {
    d.ui.bible.editing = { id, entry: JSON.parse(JSON.stringify(entry)), rels: JSON.parse(JSON.stringify(data.relationships.filter((r) => r.a === id || r.b === id))) }
  })
}
/** Keep the changes. */
export function saveEdit(): void {
  update((d) => { d.ui.bible.editing = null })
  toast('Saved.')
}
/** Throw the changes away. */
export function cancelEdit(): void {
  update((d) => { restore(d) })
}

export function selectEntry(id: string | null): void {
  update((d) => {
    if (d.ui.bible.editing && d.ui.bible.editing.id !== id) restore(d)
    d.ui.bible.sel = id
    d.ui.bible.selSug = null
  })
}
export function setBibleSearch(q: string): void {
  update((d) => { d.ui.bible.q = q })
}
export function setBibleKind(kind: string): void {
  update((d) => { d.ui.bible.kind = kind })
}
export function setBibleSort(sort: BibleSort): void {
  update((d) => { d.ui.bible.sort = sort })
}
export function setBibleReviewOnly(on: boolean): void {
  update((d) => { d.ui.bible.reviewOnly = on })
}

/** Add an entry of the type being filtered (or the first type), select it and clear the search. Returns its id. */
export function newEntry(): string {
  /* Starting another new entry leaves the one being written, which was never saved. */
  if (getState().ui.bible.editing?.draft) update((d) => { restore(d) })
  const { data, ui } = getState()
  const name = freeName(data)
  const id = freeId(data, name)
  const kind = ui.bible.kind !== 'All' && data.bibleTypes.some((t) => t.k === ui.bible.kind) ? ui.bible.kind : data.bibleTypes[0]?.k ?? 'Other'
  const entry: BibleEntry = { id, name, kind, aka: [name], sum: '', voice: '', acts: '', knows: '', first: null, say: '', user: true }
  update((d) => {
    d.data.bible.push(entry)
    d.ui.bible.sel = id
    d.ui.bible.q = ''
    d.ui.bible.kind = 'All'
    d.ui.bible.reviewOnly = false
    /* A new entry opens for editing: there is nothing to read yet. */
    d.ui.bible.editing = { id, entry: JSON.parse(JSON.stringify(entry)), rels: [], draft: true }
  })
  return id
}

export function patchEntry(id: string, patch: Partial<Pick<BibleEntry, 'kind' | 'sum' | 'voice' | 'acts' | 'knows'>>): void {
  update((d) => {
    const e = d.data.bible.find((x) => x.id === id)
    if (e) Object.assign(e, patch)
  })
}

/** Rename. Relationships point at the id; confirmed speakers follow the renamed name. Returns false when the name is empty or taken. */
export function renameEntry(id: string, to: string): boolean {
  const name = to.trim()
  const { data } = getState()
  const e = entryById(data, id)
  if (!e || !name || name === e.name || data.bible.some((x) => x.name === name)) return false
  update((d) => {
    const x = d.data.bible.find((y) => y.id === id)!
    const old = x.name
    x.name = name
    const i = x.aka.indexOf(old)
    if (i >= 0) {
      x.aka[i] = name
      Object.keys(d.data.confirmedSpeakers).forEach((k) => { if (d.data.confirmedSpeakers[k] === old) d.data.confirmedSpeakers[k] = name })
    } else x.aka.unshift(name)
    if (x.sayA && old in x.sayA) {
      x.sayA[name] = x.sayA[old]
      delete x.sayA[old]
    }
  })
  return true
}

export function deleteEntry(id: string): void {
  const e = entryById(getState().data, id)
  if (!e) return
  update((d) => {
    d.data.bible = d.data.bible.filter((x) => x.id !== id)
    d.data.relationships = d.data.relationships.filter((r) => r.a !== id && r.b !== id)
    d.ui.bible.sel = null
    d.ui.bible.editing = null
    if (d.ui.script.entryId === id) d.ui.script.entryId = null
  })
  toast('Deleted “' + e.name + '”.')
}

/** The narrator types how a name is said. The first name's pronunciation is the entry's own. */
export function setSay(id: string, name: string, value: string): void {
  setPronText({ kind: 'name', entryId: id, name }, value)
}
/** Add a name. Refused when the entry has it or another entry does (see nameOwner and mergeEntries). A new name takes the default source's pronunciation when it has one. */
export function addName(id: string, name: string): boolean {
  const v = name.trim()
  const { data } = getState()
  const e = entryById(data, id)
  if (!e || !v || e.aka.includes(v) || nameOwner(data, id, v)) return false
  update((d) => {
    d.data.bible.find((x) => x.id === id)!.aka.push(v)
    takeDefaultPron(d, { kind: 'name', entryId: id, name: v })
  })
  return true
}
export function removeName(id: string, i: number): void {
  update((d) => {
    const e = d.data.bible.find((x) => x.id === id)
    if (!e || e.aka.length < 2) return
    const [gone] = e.aka.splice(i, 1)
    if (e.sayA) delete e.sayA[gone]
    if (e.saySrc) delete e.saySrc[gone]
    if (e.review) e.review.aliases = e.review.aliases.filter((a) => a !== gone)
  })
}

export { mergedEntry, repointed } from '@/selectors/bibleMerge'
import { mergedEntry, repointed } from '@/selectors/bibleMerge'

/**
 * Merge one entry into another: the names come together, relationships follow by id, and where the entry appears is the union (it is
 * worked out from the names). The other entry goes. One undoable step. Returns false when either entry is missing.
 */
export function mergeEntries(intoId: string, fromId: string): boolean {
  const { data } = getState()
  const into = entryById(data, intoId)
  const from = entryById(data, fromId)
  if (!into || !from || intoId === fromId) return false
  const entry = act('Merged “' + from.name + '” into “' + into.name + '”', (d) => {
    const t = d.data.bible.find((x) => x.id === intoId)!
    const merged = mergedEntry(t as BibleEntry, from)
    Object.assign(t, merged)
    d.data.bible = d.data.bible.filter((x) => x.id !== fromId)
    d.data.relationships = repointed(d.data.relationships, fromId, intoId)
    if (d.ui.bible.sel === fromId) d.ui.bible.sel = intoId
    if (d.ui.script.entryId === fromId) d.ui.script.entryId = intoId
    /* Cancel must not bring the merged entry back, so the copy Cancel restores is merged too. */
    const ed = d.ui.bible.editing
    if (ed && ed.id === intoId) {
      ed.entry = mergedEntry(ed.entry, from)
      ed.rels = repointed([...ed.rels, ...data.relationships.filter((r) => r.a === fromId || r.b === fromId)], fromId, intoId)
    }
  }, { restoreUi: ['bible.sel', 'bible.editing', 'script.entryId'] })
  toastUndo('Merged “' + from.name + '” into “' + into.name + '”.', entry)
  return true
}

/** The narrator has looked at an entry that came with the import: the entry and all its names are reviewed. */
export function markEntryReviewed(id: string): void {
  const e = entryById(getState().data, id)
  if (!e?.review) return
  const left = verifyOf(getState().data, id)
  if (left) { toast(left + (left === 1 ? ' suggestion needs' : ' suggestions need') + ' verifying before “' + e.name + '” can be marked reviewed.'); return }
  const entry = act('Marked “' + e.name + '” reviewed', (d) => { delete d.data.bible.find((x) => x.id === id)!.review })
  toastUndo('“' + e.name + '” reviewed.', entry)
}
/** One name of an entry reviewed. When nothing is left to review, the entry is reviewed too. */
export function markAliasReviewed(id: string, alias: string): void {
  const e = entryById(getState().data, id)
  if (!e?.review?.aliases.includes(alias)) return
  const entry = act('Marked “' + alias + '” reviewed', (d) => {
    const x = d.data.bible.find((y) => y.id === id)!
    x.review!.aliases = x.review!.aliases.filter((a) => a !== alias)
    if (!x.review!.entry && !x.review!.aliases.length) delete x.review
  })
  toastUndo('“' + alias + '” reviewed.', entry)
}

/** Choose the colour of a speaker's chips, or go back to the one assigned from the palette. */
export function setEntryColour(id: string, colour: MarkColour | null): void {
  update((d) => {
    const e = d.data.bible.find((x) => x.id === id)
    if (!e) return
    if (colour) e.colour = colour
    else delete e.colour
  })
}

export function addRelationship(id: string): void {
  update((d) => {
    const other = d.data.bible.find((x) => x.id !== id)?.id ?? id
    const next = d.data.relationships.reduce((m, r) => Math.max(m, r.id), 0) + 1
    d.data.relationships.push({ id: next, a: id, rel: '', b: other })
  })
}
export function patchRelationship(rid: number, patch: Partial<Pick<Relationship, 'a' | 'rel' | 'b'>>): void {
  update((d) => {
    const r = d.data.relationships.find((x) => x.id === rid)
    if (r) Object.assign(r, patch)
  })
}
export function removeRelationship(rid: number): void {
  update((d) => { d.data.relationships = d.data.relationships.filter((r) => r.id !== rid) })
}
