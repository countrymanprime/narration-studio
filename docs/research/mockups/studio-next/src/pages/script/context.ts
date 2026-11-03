import { bookmarkInScript, bookmarkMenu } from '@/app/bookmarks'
import { tailItems } from '@/app/context'
import { registerContext } from '@/app/registry'
import { isAsk, annById } from '@/selectors/annotations'
import { entryById, typeColour } from '@/selectors/bible'
import { chapterById } from '@/selectors/chapters'
import { recordFromHere } from '@/state/commands/booth'
import { openInBooth } from '@/state/commands/nav'
import {
  copyText, flagWord, jumpToChapter, lookup, openFind, openRailIfNarrow, PREP_LABELS, PREP_ORDER, removeAnnotation, removeWord,
  sbMark, setMarkType, setPrep, setStatus, showEntry,
} from '@/state/commands/script'
import { getState, update } from '@/state/store'
import { I, L, SEP, SUB, type CtxItem } from '@/ui/overlay'
import { openMarkComposer } from './dialogs'
import { getSel, wordUnder, type Sel } from './selection'
import { openSpeakerPicker } from '@/ui/SpeakerPicker'


/** Right-click menus of the Script page: reader text, marks, names, speakers, the chapter list and boundary cards, and words in the side panel. */
registerContext((t, e): CtxItem[] | null => {
  const { data, ui, mock } = getState()
  if (ui.page !== 'script' || !mock.hasManuscript) return null
  const ribbon = bookmarkMenu(t)
  if (ribbon) return ribbon
  const para = t.closest('p[data-pid]')
  if (para) {
    const out: CtxItem[] = []
    const annEl = t.closest<HTMLElement>('[data-a]')
    const entEl = t.closest<HTMLElement>('[data-ent]')
    let g: Sel = getSel()
    if (!g || g.multi) g = wordUnder(e)
    const phEl = t.closest<HTMLElement>('[data-ph]')
    if (phEl) {
      const key = phEl.dataset.ph as string
      const cur = phEl.dataset.spk as string
      const conf = !phEl.classList.contains('phr-sug')
      out.push(I('Speaker: ' + (cur === '?' ? 'not set' : cur) + (conf || cur === '?' ? '' : ' (suggested)') + '…', () => openSpeakerPicker({ x: e.clientX / getState().ui.prefs.zoom, y: e.clientY / getState().ui.prefs.zoom }, key, cur, conf)), SEP)
    }
    const a = annEl ? annById(data, annEl.dataset.a) : undefined
    if (a) {
      if (a.type === 'pron') {
        out.push(
          I('Show in Words', () => update((d) => { d.ui.script.sel = a.id; d.ui.script.tab = 'pron'; d.ui.script.word = a.key ?? null })),
          I('Remove from my words', () => removeAnnotation(a.id)),
        )
      } else {
        const ask = isAsk(data, a)
        out.push(
          I(ask ? 'Open the thread' : 'Edit the note', () => {
            update((d) => { d.ui.script.sel = a.id; d.ui.script.tab = ask ? 'queries' : 'marks' })
            openRailIfNarrow()
          }),
        )
        if (ask) out.push(I(a.status === 'resolved' ? 'Reopen' : 'Mark resolved', () => setStatus(a.id, a.status === 'resolved' ? 'open' : 'resolved')))
        out.push(
          SUB('Change type', data.marks.map((x) => I(x.name, () => setMarkType(a.id, x.k), { sw: x.c, checked: x.k === a.mark }))),
          I('Delete mark', () => removeAnnotation(a.id)),
        )
      }
      out.push(SEP)
    } else if (entEl) {
      const en = entryById(data, entEl.dataset.ent)
      if (en) {
        out.push(
          I('Open “' + en.name + '” in the side panel', () => showEntry(en.id)),
          I('Find “' + en.name + '” in the manuscript', () => openFind(en.name)),
          SEP,
        )
      }
    }
    if (g && !g.multi) {
      const sel = g
      const q = sel.q.length > 28 ? sel.q.slice(0, 28) + '…' : sel.q
      out.push(
        L('“' + q + '”'),
        SUB('Mark as', [...data.marks.map((x) => I(x.name, () => openMarkComposer(x.k, sel), { sw: x.c })), SEP, I('Pronunciation (a word)', () => flagWord(sel))]),
        SUB('Add to the Story Bible as', data.bibleTypes.map((k) => I(k.k, () => sbMark(k.k, sel), { sw: typeColour(data, k.k) }))),
        SEP,
        I('Look up “' + q + '”', () => lookup(sel.q, sel)),
        I('Find “' + q + '” in the manuscript', () => openFind(sel.q)),
        I('Copy', () => copyText(sel.q)),
        SEP,
        I('Bookmark here', () => bookmarkInScript({ pid: sel.pid, offset: sel.s }), { k: 'B' }),
        I('Record from here', () => recordFromHere(sel.pid, sel.s)),
      )
    } else out.push(...tailItems().slice(1))
    return out
  }
  const chEl = t.closest<HTMLElement>('[data-jump],.bound[data-ch]')
  if (chEl) {
    const id = (chEl.dataset.jump ?? chEl.dataset.ch) as string
    const c = chapterById(data, id)
    if (!c) return null
    return [
      I('Go to this chapter', () => jumpToChapter(id)),
      I('Record in Booth', () => openInBooth(id)),
      SUB('My prep', PREP_ORDER.map((k) => I(PREP_LABELS[k], () => setPrep(id, k), { checked: c.prep === k }))),
      ...tailItems(),
    ]
  }
  const wr = t.closest<HTMLElement>('tr[data-w]')
  if (wr) {
    const w = wr.dataset.w as string
    return [
      I('Show “' + w + '”', () => update((d) => { d.ui.script.word = w })),
      I('Remove from my words', () => removeWord(w)),
    ]
  }
  return null
})
