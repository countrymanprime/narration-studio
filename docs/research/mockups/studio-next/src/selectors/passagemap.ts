/**
 * Passages from the Booth's log. While it records, the Booth writes where in the text each take began (and where the one before it
 * ended). A paragraph that two or more takes covered is a passage with those takes; its place in time comes from the log, so nothing has
 * to be found by listening. Takes recorded elsewhere are the only ones that are matched to the text by alignment.
 */
import { WPH } from '@/config/estimates'
import type { Paragraph, Passage, PassageMark, Take, TakeSource } from '@/domain/schemas'
import { wordsIn } from '@/format/text'

const RATE = WPH / 3600

interface Span {
  run: string
  index: number
  from: { pid: string; word: number }
  to: { pid: string; word: number }
  start: number
  end: number
  itemGuid: string
  takeGuid: string
}

/** The takes a run of marks made: each begins at a mark and ends where the next mark says the reading had got to. */
export function spansOf(marks: PassageMark[]): Span[] {
  const runs = new Map<string, PassageMark[]>()
  marks.forEach((m) => runs.set(m.run, [...(runs.get(m.run) ?? []), m]))
  const out: Span[] = []
  for (const [run, ms] of runs) {
    const sorted = ms.slice().sort((a, c) => a.sec - c.sec || (a.kind === 'start' ? -1 : c.kind === 'start' ? 1 : 0))
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]
      const z = sorted[i + 1]
      if (!z.prev) continue
      out.push({ run, index: i, from: { pid: a.pid, word: a.word }, to: z.prev, start: a.sec, end: z.sec, itemGuid: a.itemGuid, takeGuid: a.takeGuid })
    }
  }
  return out
}

/** The words of a paragraph a take read: from its start word (in the paragraph it began in) to its end word (in the one it ended in). */
function readIn(span: Span, p: Paragraph): { from: number; to: number } {
  const n = wordsIn(p.text)
  return { from: p.id === span.from.pid ? span.from.word : 0, to: p.id === span.to.pid ? Math.min(n, span.to.word) : n }
}

/** Passages for a chapter: paragraphs that two or more takes of the log covered. */
export function passagesFromMap(marks: PassageMark[], paras: Paragraph[], chapterId: string, source: TakeSource): Passage[] {
  const spans = spansOf(marks.filter((m) => m.chapterId === chapterId))
  const index = new Map(paras.map((p, i) => [p.id, i]))
  const covering = new Map<string, Array<{ span: Span; lead: number }>>()
  for (const sp of spans) {
    const a = index.get(sp.from.pid)
    const z = index.get(sp.to.pid)
    if (a == null || z == null || z < a) continue
    let lead = 0
    for (let i = a; i <= z; i++) {
      const p = paras[i]
      const r = readIn(sp, p)
      if (r.to <= r.from) { lead += 0; continue }
      covering.set(p.id, [...(covering.get(p.id) ?? []), { span: sp, lead }])
      lead += r.to - r.from
    }
  }
  const out: Passage[] = []
  for (const p of paras) {
    const list = covering.get(p.id) ?? []
    if (list.length < 2) continue
    const takes: Take[] = list.map(({ span, lead }, k) => {
      const r = readIn(span, p)
      const start = Math.min(span.end, span.start + lead / RATE)
      const len = Math.max(0.1, Math.min(span.end - start, (r.to - r.from) / RATE))
      const words = p.text.split(/\s+/).filter(Boolean).slice(r.from, r.to)
      return {
        id: 'B' + span.run + '.' + span.index, source, start: Math.round(start * 10) / 10, len: Math.round(len * 10) / 10, active: k === list.length - 1,
        text: words.join(' '), via: 'map' as const, itemGuid: span.itemGuid, takeGuid: span.takeGuid,
      }
    })
    out.push({ id: 'pm-' + chapterId + '-' + p.id, chapterId, pid: p.id, s: 0, e: p.text.length, takes, kept: false, prepped: [] })
  }
  return out
}

/**
 * Put derived passages into the book's list. A passage already there keeps the narrator's choices (which take is kept, the steps applied,
 * which takes are hidden); a new take is added to it.
 */
export function mergePassages(existing: Passage[], derived: Passage[]): Passage[] {
  const out = existing.slice()
  /* A chapter with stacked takes had audio shifted: its other passages keep the places editing gave them. */
  const movedChapters = new Set(existing.filter((p) => p.stack).map((p) => p.chapterId))
  for (const d of derived) {
    const at = out.findIndex((p) => p.id === d.id)
    if (at < 0) { out.push(d); continue }
    const old = out[at]
    /* Stacking moved the takes of a passage and the audio after them: the log still says where they were recorded, so positions stay as editing left them. */
    if (old.stack) { out[at] = old; continue }
    const moved = movedChapters.has(old.chapterId)
    const takes = d.takes.map((t) => {
      const o = old.takes.find((x) => x.id === t.id)
      return o ? { ...t, ...(moved ? { start: o.start, len: o.len } : {}), active: o.active, ...(o.hidden ? { hidden: true } : {}) } : { ...t, active: old.kept ? false : t.active }
    })
    out[at] = { ...d, ...(old.retryMode ? { retryMode: old.retryMode } : {}), kept: old.kept && takes.some((t) => t.active), prepped: old.prepped ?? [], takes: old.kept ? takes : takes.map((t, i) => ({ ...t, active: i === takes.length - 1 })) }
  }
  return out
}
