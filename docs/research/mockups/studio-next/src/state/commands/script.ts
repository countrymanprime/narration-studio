/** Commands of the Script page: Find, prep, speakers, marks, words, Story Bible links, the side panel and the drawers. */
import type { Annotation, BibleEntry, PrepState } from '@/domain/schemas'
import { fmtD } from '@/format/time'
import { annById, isAsk } from '@/selectors/annotations'
import { chapterById, chTag, paragraphChapter } from '@/selectors/chapters'
import { searchManuscript } from '@/selectors/search'
import { today } from '@/selectors/progress'
import { announce, toast, toastUndo } from '@/ui/overlay'
import { getState, update, act } from '../store'
import type { SelectionInfo } from '../slices/ui'
import { setPronText, takeDefaultPron, writePron } from './pronunciation'

export const PREP_LABELS: Record<PrepState, string> = { none: 'Not started', progress: 'In progress', prepped: 'Prepped' }
export const PREP_ORDER: PrepState[] = ['none', 'progress', 'prepped']

const clearBrowserSelection = (): void => { try { window.getSelection()?.removeAllRanges() } catch { /* no selection API */ } }
export { clearBrowserSelection }

/** At 1280 and below the side panel is a drawer. */
const narrow = (): boolean => document.body.classList.contains('md')

/* ---------- Find ---------- */

/** Open Find in the manuscript (on the Script page), optionally with a term. */
export function openFind(prefill?: string): void {
  update((d) => {
    d.ui.page = 'script'
    d.ui.script.find.open = true
    if (prefill != null) {
      d.ui.script.find.q = prefill
      d.ui.script.find.i = 0
    }
    d.ui.script.find.list = true
    d.ui.script.findNonce++
  })
}
export function closeFind(): void {
  update((d) => {
    d.ui.script.find.open = false
  })
  document.getElementById('rdscroll')?.focus()
}
export function setFindQuery(q: string): void {
  update((d) => {
    d.ui.script.find.q = q
    d.ui.script.find.list = true
    d.ui.script.find.i = 0
  })
}
export function stepFind(delta: number): void {
  const { data, ui } = getState()
  const n = searchManuscript(data, ui.script.find.q).length
  if (!n) return
  update((d) => {
    d.ui.script.find.i = (d.ui.script.find.i + delta + n) % n
  })
}
export function pickFind(i: number): void {
  update((d) => {
    d.ui.script.find.i = i
    d.ui.script.find.list = false
  })
}
export function toggleFindList(): void {
  update((d) => {
    d.ui.script.find.list = !d.ui.script.find.list
  })
}

/* ---------- Reader position, chapters, drawers ---------- */

/** Ask the reader to scroll to a chapter (the reader consumes the request). */
export function jumpToChapter(id: string): void {
  update((d) => {
    d.ui.script.pendingJump = id
    d.ui.page = 'script'
  })
}
export function jumpToParagraph(pid: string): void {
  update((d) => {
    d.ui.script.pendingPid = pid
  })
}

let drawerOpener: HTMLElement | null = null
/** Open, toggle or close a drawer (narrow layouts). Focus moves into it, and back to the button that opened it. */
export function setDrawer(v: 'ch' | 'rail' | 'close', opener?: HTMLElement | null): void {
  const was = getState().ui.script.drawer
  const next = v === 'close' || was === v ? null : v
  update((d) => {
    d.ui.script.drawer = next
  })
  if (next) {
    drawerOpener = opener ?? null
    setTimeout(() => {
      const t = document.querySelector<HTMLElement>(next === 'ch' ? '.chpanel [data-jump][tabindex="0"]' : '.railpanel [role="tab"][aria-selected="true"]')
      t?.focus()
    }, 220)
  } else if (drawerOpener) {
    drawerOpener.focus?.()
    drawerOpener = null
  }
}
/** The Bookmarks tab of the side panel; in the drawer layout the button also opens and closes the drawer. */
export function showBookmarks(): void {
  const st = getState().ui.script
  if (narrow() && st.drawer === 'rail' && st.tab === 'bookmarks') { setDrawer('close'); return }
  update((d) => { d.ui.script.tab = 'bookmarks' })
  openRailIfNarrow()
}
export const openRailIfNarrow = (): void => {
  if (narrow() && getState().ui.script.drawer !== 'rail') setDrawer('rail')
}

/* ---------- Prep and flags ---------- */

export function setPrep(id: string, k: PrepState): void {
  update((d) => {
    const c = d.data.chapters.find((x) => x.id === id)
    if (c) c.prep = k
  })
  const { data } = getState()
  const c = chapterById(data, id)
  if (c) announce(chTag(data, c) + ': ' + PREP_LABELS[k])
}
export function stepPrep(id: string, delta: number): void {
  const c = chapterById(getState().data, id)
  if (!c) return
  const n = PREP_ORDER[Math.max(0, Math.min(2, PREP_ORDER.indexOf(c.prep) + delta))]
  if (n !== c.prep) setPrep(id, n)
}
export function reviewFlag(id: string): void {
  update((d) => {
    const c = d.data.chapters.find((x) => x.id === id)
    if (c) delete c.flag
  })
}

/* ---------- Speakers ---------- */
export function setSpeaker(key: string, spk: string): void {
  update((d) => {
    d.data.confirmedSpeakers[key] = spk
  })
}

/* ---------- Annotations ---------- */
const nextAnnId = (anns: Annotation[]): string => 'a' + (anns.reduce((m, a) => Math.max(m, +(/^a(\d+)$/.exec(a.id)?.[1] ?? 0)), 100) + 1)

/** Save a mark made from a selection. A query needs its text. Returns false when it was refused. */
export function saveMark(g: SelectionInfo, key: string, text: string): boolean {
  const { data } = getState()
  const mt = data.marks.find((x) => x.k === key)
  if (!mt) return false
  const tx = text.trim()
  if (mt.ask && !tx) {
    toast('Write the query first.')
    return false
  }
  update((d) => {
    const a: Annotation = { id: nextAnnId(d.data.annotations), p: g.pid, s: g.s, e: g.e, q: g.q, type: 'mark', mark: key }
    if (tx) a.text = tx
    if (mt.ask) {
      a.status = 'open'
      a.thread = []
    }
    d.data.annotations.push(a)
    d.ui.script.sel = a.id
    d.ui.script.tab = mt.ask ? 'queries' : 'marks'
  })
  clearBrowserSelection()
  toast(mt.ask ? 'Query saved. Track the reply in the Queries tab.' : 'Marked “' + g.q + '” as ' + mt.name + '.')
  return true
}

/** Flag a selected word for pronunciation. */
export function flagWord(g: SelectionInfo): void {
  const w = g.q.trim()
  update((d) => {
    if (!d.data.pronunciations[w]) {
      d.data.pronunciations[w] = { say: '', src: '' }
      takeDefaultPron(d, { kind: 'word', word: w })
    }
    const a: Annotation = { id: nextAnnId(d.data.annotations), p: g.pid, s: g.s, e: g.e, q: g.q, type: 'pron', key: w }
    d.data.annotations.push(a)
    d.ui.script.sel = a.id
    d.ui.script.tab = 'pron'
    d.ui.script.word = w
  })
  clearBrowserSelection()
}

export function removeAnnotation(id: string): void {
  update((d) => {
    const i = d.data.annotations.findIndex((a) => a.id === id)
    if (i >= 0) d.data.annotations.splice(i, 1)
    if (d.ui.script.sel === id) d.ui.script.sel = null
  })
}
export function removeWord(w: string): void {
  update((d) => {
    d.data.annotations = d.data.annotations.filter((a) => !(a.type === 'pron' && a.key === w))
  })
}

/** Change the type of a mark. A query tracks a reply, so it gets a status; the thread is kept either way. */
export function setMarkType(id: string, k: string): void {
  update((d) => {
    const a = d.data.annotations.find((x) => x.id === id)
    const mt = d.data.marks.find((x) => x.k === k)
    if (!a || !mt) return
    a.mark = k
    if (mt.ask) a.status = a.status ?? 'open'
    else delete a.status
    d.ui.script.tab = mt.ask ? 'queries' : 'marks'
  })
}
export function setStatus(id: string, status: 'open' | 'resolved'): void {
  update((d) => {
    const a = d.data.annotations.find((x) => x.id === id)
    if (a) a.status = status
  })
}
export function addToThread(id: string, who: 'you' | 'author' | 'proofer', text: string): void {
  update((d) => {
    const a = d.data.annotations.find((x) => x.id === id)
    if (!a) return
    ;(a.thread = a.thread ?? []).push({ who, text, at: fmtD(today(d.data)) })
  })
}
/** Mark a query resolved, with a last reply if one was typed. */
export function resolveQuery(id: string, who: 'you' | 'author' | 'proofer', text: string): void {
  update((d) => {
    const a = d.data.annotations.find((x) => x.id === id)
    if (!a) return
    if (text) (a.thread = a.thread ?? []).push({ who, text, at: fmtD(today(d.data)) })
    a.status = 'resolved'
  })
  toast('Query resolved.')
}
export function editMessage(id: string, i: number, text: string): void {
  update((d) => {
    const a = d.data.annotations.find((x) => x.id === id)
    if (!a || !text) return
    if (i < 0) a.text = text
    else if (a.thread?.[i]) a.thread[i].text = text
  })
}
/** Delete one message of a thread. The offer to undo restores it. */
export function deleteMessage(id: string, i: number): void {
  const e = act('Deleted a message', (d) => {
    const a = d.data.annotations.find((x) => x.id === id)
    if (!a) return
    if (i < 0) a.text = ''
    else a.thread?.splice(i, 1)
  })
  toastUndo('Message deleted.', e, 6000)
}
export const setEdit = (v: string | null): void => update((d) => { d.ui.script.aedit = v })

/** "Copy the query": where it is, the passage, and the question. */
export function copyText(t: string): void {
  try {
    navigator.clipboard.writeText(t).then(() => toast('Copied.'), () => toast('Copy failed.'))
  } catch {
    toast('Copy failed.')
  }
}

/* ---------- Words ---------- */
/** The narrator typed how the word is said, or took it from a definition (`src` says which source that was). */
export function saveSay(w: string, say: string, src?: string): void {
  if (src) update((d) => writePron(d, { kind: 'word', word: w }, say.trim(), src))
  else setPronText({ kind: 'word', word: w }, say)
}
export function addWord(w: string): void {
  update((d) => {
    d.data.pronunciations[w] = { say: '', src: '' }
    takeDefaultPron(d, { kind: 'word', word: w })
  })
}

/* ---------- Story Bible links ---------- */
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entry'

/** Marking a name as a character, location, item or event makes (or finds) its Story Bible entry; every mention is then linked to it. */
export function sbMark(kind: string, g: SelectionInfo): void {
  const name = g.q.trim()
  const low = name.toLowerCase()
  const { data } = getState()
  const found = data.bible.find((e) => e.name.toLowerCase() === low || e.aka.some((a) => a.toLowerCase() === low))
  let id: string
  let msg: string
  if (found) {
    id = found.id
    msg = 'Linked “' + name + '” to ' + found.name + '.'
    if (!found.aka.some((a) => a.toLowerCase() === low)) {
      update((d) => { d.data.bible.find((e) => e.id === found.id)?.aka.push(name) })
    }
  } else {
    let base = slug(name)
    let n = 1
    while (data.bible.some((e) => e.id === base)) base = slug(name) + '-' + ++n
    id = base
    const e: BibleEntry = { id, name, kind, aka: [name], sum: '', voice: '', acts: '', knows: '', first: paragraphChapter(data, g.pid), say: '—', user: true }
    update((d) => { d.data.bible.push(e) })
    msg = 'Added “' + name + '” to the Story Bible as ' + kind.toLowerCase() + '.'
  }
  toast(msg)
  update((d) => {
    d.ui.script.tab = 'bible'
    d.ui.script.entryId = id
    d.ui.script.miss = null
    d.ui.script.missSel = null
  })
  clearBrowserSelection()
}

/** Look a selected text up: a Story Bible entry, a word of mine, or nothing yet (offer to create an entry). */
export function lookup(text: string, g?: SelectionInfo | null): void {
  const { data } = getState()
  const q = text.trim().toLowerCase()
  const ent = data.bible.find((e) => e.name.toLowerCase() === q || e.aka.some((a) => a.toLowerCase() === q))
  const pk = Object.keys(data.pronunciations).find((k) => k.toLowerCase() === q)
  update((d) => {
    if (ent) {
      d.ui.script.tab = 'bible'
      d.ui.script.entryId = ent.id
      d.ui.script.miss = null
    } else if (pk) {
      d.ui.script.tab = 'pron'
      d.ui.script.word = pk
    } else {
      d.ui.script.tab = 'bible'
      d.ui.script.entryId = null
      d.ui.script.miss = text
      d.ui.script.missSel = g ?? null
    }
  })
  openRailIfNarrow()
  clearBrowserSelection()
}

/** Show an annotation in the side panel (and open the drawer on a narrow screen). */
export function showAnnotation(id: string): void {
  const { data } = getState()
  const a = annById(data, id)
  if (!a) return
  update((d) => {
    d.ui.script.sel = a.id
    if (a.type === 'pron') {
      d.ui.script.tab = 'pron'
      d.ui.script.word = a.key ?? null
    } else d.ui.script.tab = isAsk(data, a) ? 'queries' : 'marks'
  })
  openRailIfNarrow()
}
export function showEntry(id: string): void {
  update((d) => {
    d.ui.script.tab = 'bible'
    d.ui.script.entryId = id
    d.ui.script.miss = null
    d.ui.script.sel = null
  })
  openRailIfNarrow()
}

/** Show an annotation's passage in the reader. */
export function showInText(id: string): void {
  const a = annById(getState().data, id)
  if (!a) return
  update((d) => {
    d.ui.script.sel = a.id
    d.ui.script.pendingPid = a.p
  })
}

