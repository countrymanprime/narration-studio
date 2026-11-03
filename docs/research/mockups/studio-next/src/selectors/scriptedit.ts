/**
 * The script as an editor: the chapter's own text set against what was heard, word by word. Everything here is a pure function of the book
 * and the alignment provider's answer (providers/alignment.ts): which words were read as written, which were misread or not read, which
 * words were said that are not in the script, how sure the recogniser was of each, and when each began and ended. The text itself is never
 * edited; a selection is a run of words with a time range, and cuts and effects are made on that range (state/commands/scriptedit.ts).
 */
import { LOW_CONFIDENCE } from '@/config/estimates'
import type { BookData, Paragraph, Passage, Take } from '@/domain/schemas'
import { key as normKey } from '@/format/diff'
import { alignment, type Heard, type HeardWord } from '@/providers/alignment'
import { boothUnits, unitWords, type BoothUnit, type WordTok } from './booth'
import { paragraphsOf } from './chapters'
import { curTime, cutsOf, origTime, takeShift } from './cuts'
import { activeTake } from './editing'

export type ItemState = 'ok' | 'mis' | 'miss' | 'extra'

export interface DocItem {
  /** Stable: `pid:n` for the n-th word of the script, `pid:xn` for the n-th word that was said and is not in it. */
  key: string
  kind: 'w' | 'x'
  /** The script's word, or the word that was said. */
  text: string
  /** Whitespace that follows the script word. */
  gap: string
  tok?: WordTok
  st: ItemState
  /** 0 to 1: how sure the recogniser was. 0 for a word that was not read. */
  conf: number
  /** The word that was heard, where it differs from the script (a misread). */
  heard?: string
  pid: string
  /** The phrase (Booth unit) the word belongs to. */
  uKey: string
  /** Seconds into the chapter recording as it stands now; null when nothing was recorded here. */
  t0: number | null
  t1: number | null
  /** Seconds from the start of the take (or of the paragraph), before any cut: where cuts and effects are made. */
  off0: number | null
  off1: number | null
  /** The take the word was heard in. */
  takeId?: string
  /** Cut from the audio: the cut that took it out. The word stays in the text, struck through. */
  cut?: string
  /** Effects on the word. */
  fx: string[]
  /** A second read of the line (the take reads it twice). */
  dup?: boolean
  /** The narrator said it is right (kept on purpose): no longer flagged. */
  accepted?: boolean
  /** Which run of extra words it belongs to. */
  run?: number
}
export interface DocUnit { u: BoothUnit; lead: string; items: DocItem[] }
export interface DocPara {
  p: Paragraph
  pi: number
  passage?: Passage
  /** The take the words are heard in. */
  take?: Take
  units: DocUnit[]
  items: DocItem[]
  /** Seconds now where the paragraph's audio begins and ends. */
  start: number | null
  end: number | null
  recorded: boolean
}
export interface FlagCounts { extra: number; miss: number; mis: number; low: number }
export interface ChapterDoc {
  paras: DocPara[]
  items: DocItem[]
  index: Map<string, number>
  /** Whether the recogniser has transcribed the recording. */
  aligned: boolean
  engine: { id: string; name: string }
  counts: FlagCounts
}

const wordsOf = (t: string): string[] => t.split(/\s+/).filter(Boolean)
const r3 = (n: number): number => Math.round(n * 1000) / 1000
/** The gap kept between a take and the reading of the same paragraph before or after it (seconds). */
const JOIN = 0.2
/** Pause between paragraphs read straight on (seconds). */
const BETWEEN = 0.5

/* ---- Setting what was said against the script ---- */

type Op = { kind: 'w'; i: number; heard?: HeardWord; st: 'ok' | 'mis' | 'miss' } | { kind: 'x'; heard: HeardWord }

/**
 * The script words against the heard words: longest common run of words (ignoring case and punctuation). Between two matches, a word the
 * script has and a word that was heard take each other's place as a misread; what is left over on the script's side was not read, and what is
 * left over on the heard side was said and is not in the script.
 */
export function alignToScript(script: string[], heard: HeardWord[]): Op[] {
  const ka = script.map(normKey)
  const kc = heard.map((h) => normKey(h.text))
  const L: number[][] = Array.from({ length: ka.length + 1 }, () => new Array<number>(kc.length + 1).fill(0))
  for (let i = ka.length - 1; i >= 0; i--) for (let j = kc.length - 1; j >= 0; j--) L[i][j] = ka[i] === kc[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const ops: Op[] = []
  let i = 0
  let j = 0
  const flush = (dels: number[], ins: number[]): void => {
    /* Which script word each heard word stands for. Equal numbers pair in order; otherwise the pairing that looks most alike wins, and words with no look-alike are left over. */
    const pair = pairUp(dels.map((i) => script[i]), ins.map((j) => heard[j].text))
    const taken = new Set(pair.map(([, b]) => b))
    dels.forEach((d, a) => {
      const hit = pair.find(([q]) => q === a)
      ops.push(hit ? { kind: 'w', i: d, heard: heard[ins[hit[1]]], st: 'mis' } : { kind: 'w', i: d, st: 'miss' })
    })
    ins.forEach((j, b) => { if (!taken.has(b)) ops.push({ kind: 'x', heard: heard[j] }) })
  }
  let dels: number[] = []
  let ins: number[] = []
  while (i < ka.length || j < kc.length) {
    if (i < ka.length && j < kc.length && ka[i] === kc[j]) {
      flush(dels, ins)
      dels = []
      ins = []
      ops.push({ kind: 'w', i, heard: heard[j], st: 'ok' })
      i++
      j++
    } else if (j < kc.length && (i >= ka.length || L[i][j + 1] >= L[i + 1][j])) ins.push(j++)
    else dels.push(i++)
  }
  flush(dels, ins)
  return ops
}

/** How alike two words look, 0 to 1 (ignoring case and punctuation). */
function alike(a: string, b: string): number {
  const x = normKey(a)
  const y = normKey(b)
  if (!x.length && !y.length) return 1
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) => [i, ...new Array<number>(y.length).fill(0)])
  for (let j = 1; j <= y.length; j++) d[0][j] = j
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
  return 1 - d[x.length][y.length] / Math.max(x.length, y.length)
}
/** Pair the script words of a stretch that differs with the words heard there, in order. Returns [script index, heard index] pairs. */
function pairUp(dels: string[], ins: string[]): Array<[number, number]> {
  if (dels.length === ins.length) return dels.map((_, k) => [k, k])
  const n = dels.length
  const m = ins.length
  const best: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  const sim = (i: number, j: number): number => alike(dels[i], ins[j])
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], sim(i, j) >= 0.34 ? sim(i, j) + best[i + 1][j + 1] : 0)
  const out: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (sim(i, j) >= 0.34 && Math.abs(sim(i, j) + best[i + 1][j + 1] - best[i][j]) < 1e-9) { out.push([i, j]); i++; j++ }
    else if (best[i + 1][j] >= best[i][j + 1]) i++
    else j++
  }
  return out
}

/* ---- Building the document ---- */

interface Seg {
  from: number
  to: number
  heard: Heard | null
  /** Seconds now of a moment `off` seconds into the segment's own stretch of the recording. */
  abs: (off: number) => number
  /** The offset recorded for a cut: seconds from the start of the take, or of the paragraph. */
  rel: (off: number) => number
  takeId?: string
}

/** The take a paragraph is heard in: the passage's active take. */
function takeFor(b: BookData, chapterId: string, pid: string): { passage?: Passage; take?: Take } {
  const passage = b.passages.find((p) => p.chapterId === chapterId && p.pid === pid)
  return { passage, take: passage ? activeTake(passage) ?? passage.takes[0] : undefined }
}

const tokenCount = (t: string): number => wordsOf(t).length

export function buildDoc(b: BookData, chapterId: string): ChapterDoc {
  const eng = alignment()
  const paras = paragraphsOf(b, chapterId)
  const booth = boothUnits(b, chapterId)
  const cuts = cutsOf(b.cuts, chapterId)
  const chapter = b.chapters.find((c) => c.id === chapterId)
  const wordFx = b.wordFx.filter((f) => f.chapterId === chapterId)
  const total = paras.reduce((a, p) => a + tokenCount(p.text), 0)
  const recordedWords = chapter ? (total * chapter.rec) / 100 : total
  const probe = paras.length ? eng.heard({ id: paras[0].id, text: paras[0].text }) : null
  const aligned = probe !== null || paras.length === 0

  /* 1. The stretches each paragraph is heard in: the active take, with the words before and after it read on their own. */
  interface Plan {
    p: Paragraph
    pi: number
    passage?: Passage
    take?: Take
    lead: number
    mid: number
    leadHeard: Heard | null
    trailHeard: Heard | null
    takeLen: number
    anchor: number | null
    natural: number
    recorded: boolean
  }
  let before = 0
  const plans: Plan[] = paras.map((p, pi) => {
    const { passage, take } = takeFor(b, chapterId, p.id)
    const lead = passage ? tokenCount(p.text.slice(0, passage.s)) : 0
    const mid = passage ? tokenCount(p.text.slice(passage.s, passage.e)) : 0
    const n = tokenCount(p.text)
    const leadText = passage ? wordsOf(p.text.slice(0, passage.s)).join(' ') : ''
    const trailText = passage ? wordsOf(p.text.slice(passage.e)).join(' ') : ''
    const leadHeard = take && lead && aligned ? eng.heard({ id: take.id + ':lead', text: leadText }) : null
    const trailHeard = take && trailText && aligned ? eng.heard({ id: take.id + ':trail', text: trailText }) : null
    const takeLen = take ? take.len + cuts.filter((c) => c.mode === 'close' && c.takeId === take.id).reduce((a, c) => a + (c.b - c.a), 0) : 0
    const anchor = take ? origTime(cuts, take.start) - (leadHeard ? leadHeard.len + JOIN : 0) : null
    const natural = take ? (leadHeard ? leadHeard.len + JOIN : 0) + takeLen + (trailHeard ? JOIN + trailHeard.len : 0) : 0
    const recorded = !!take || before < recordedWords
    before += n
    return { p, pi, passage, take, lead, mid, leadHeard, trailHeard, takeLen, anchor, natural, recorded }
  })

  /* 2. Where each paragraph without a take of its own begins: read straight on from the one before, fitted between the takes around it. */
  const origin: Array<number | null> = plans.map((pl) => pl.anchor)
  const slot: Array<number | undefined> = plans.map(() => undefined)
  let cursor = BETWEEN
  for (let k = 0; k < plans.length; k++) {
    const pl = plans[k]
    if (pl.anchor != null) { cursor = pl.anchor + pl.natural + BETWEEN; continue }
    if (!pl.recorded || !aligned) continue
    let j = k
    const run: number[] = []
    while (j < plans.length && plans[j].anchor == null && plans[j].recorded) run.push(j++)
    const next = j < plans.length ? plans[j].anchor : null
    const nat = run.map((r) => eng.heard({ id: plans[r].p.id, text: plans[r].p.text })?.len ?? 0)
    const need = nat.reduce((a, n) => a + n + BETWEEN, 0)
    const room = next != null ? next - BETWEEN - cursor : Infinity
    const scale = room < need ? Math.max(0.3, room / need) : 1
    run.forEach((r, ix) => {
      origin[r] = r3(cursor)
      if (scale < 1) slot[r] = r3(nat[ix] * scale)
      cursor += (nat[ix] + BETWEEN) * scale
    })
    k = j - 1
  }

  /* 3. The words. */
  const docParas: DocPara[] = plans.map((pl) => {
    const { p, pi, passage, take } = pl
    const unitsOf = booth.units.filter((u) => u.pi === pi)
    const unitWordsList = unitsOf.map((u) => ({ u, ...unitWords(b, p, u.s, u.e) }))
    const script: Array<{ tok: WordTok; u: BoothUnit }> = unitWordsList.flatMap((x) => x.words.map((tok) => ({ tok, u: x.u })))
    const out: DocUnit[] = unitWordsList.map((x) => ({ u: x.u, lead: x.lead, items: [] }))
    const unitIndex = new Map(out.map((x, i) => [x.u.key, i]))

    let segs: Seg[] = []
    if (pl.recorded && aligned) {
      if (take && passage) {
        const lead = pl.lead
        const mid = pl.mid
        const heard = eng.heard({ id: take.id, text: take.text, len: pl.takeLen })
        const base = (off: number): number => take.start + off - takeShift(cuts, take.id, off)
        const leadLen = pl.leadHeard ? pl.leadHeard.len + JOIN : 0
        if (lead) segs.push({ from: 0, to: lead, heard: pl.leadHeard, abs: (o) => base(o - leadLen), rel: (o) => o - leadLen, takeId: take.id })
        segs.push({ from: lead, to: lead + mid, heard, abs: base, rel: (o) => o, takeId: take.id })
        if (lead + mid < script.length) segs.push({ from: lead + mid, to: script.length, heard: pl.trailHeard, abs: (o) => base(pl.takeLen + JOIN + o), rel: (o) => pl.takeLen + JOIN + o, takeId: take.id })
      } else {
        const o = origin[pl.pi] ?? BETWEEN
        const heard = eng.heard({ id: p.id, text: p.text, len: slot[pl.pi] })
        segs = [{ from: 0, to: script.length, heard, abs: (off) => curTime(cuts, o + off), rel: (off) => off }]
      }
    } else {
      segs = []
    }

    const cutOf = (key: string): string | undefined => cuts.find((c) => c.keys.includes(key))?.id
    const fxOf = (key: string): string[] => wordFx.filter((f) => f.keys.includes(key)).map((f) => f.id)
    const items: DocItem[] = []
    let xn = 0
    let run = 0
    const push = (it: DocItem, uKey: string): void => {
      out[unitIndex.get(uKey) ?? 0].items.push(it)
      items.push(it)
    }
    const dupHead = take ? wordsOf(p.text.slice(passage?.s ?? 0, passage?.e)).slice(0, 4).map(normKey) : []

    if (!segs.length) {
      script.forEach((w, i) => push({ key: p.id + ':' + i, kind: 'w', text: w.tok.text, gap: w.tok.gap, tok: w.tok, st: 'ok', conf: 1, pid: p.id, uKey: w.u.key, t0: null, t1: null, off0: null, off1: null, fx: [] }, w.u.key))
    }
    segs.forEach((seg) => {
      const words = script.slice(seg.from, seg.to).map((w) => w.tok.text)
      if (!seg.heard) {
        words.forEach((_, k) => { const w = script[seg.from + k]; push({ key: p.id + ':' + (seg.from + k), kind: 'w', text: w.tok.text, gap: w.tok.gap, tok: w.tok, st: 'ok', conf: 1, pid: p.id, uKey: w.u.key, t0: null, t1: null, off0: null, off1: null, fx: [] }, w.u.key) })
        return
      }
      const ops = alignToScript(words, seg.heard.words)
      let lastU = script[seg.from]?.u.key ?? unitsOf[0]?.key ?? ''
      let prevEnd = seg.heard.words.length ? seg.abs(seg.heard.words[0].off0) : 0
      let xRun: DocItem[] = []
      const closeRun = (): void => {
        if (xRun.length >= 4 && xRun.slice(0, 4).every((x, k) => normKey(x.text) === dupHead[k])) xRun.forEach((x) => { x.dup = true })
        xRun = []
      }
      ops.forEach((op) => {
        if (op.kind === 'x') {
          const h = op.heard
          const it: DocItem = {
            key: p.id + ':x' + xn++, kind: 'x', text: h.text, gap: ' ', st: 'extra', conf: h.conf, pid: p.id, uKey: lastU, t0: r3(seg.abs(h.off0)), t1: r3(seg.abs(h.off1)),
            off0: seg.rel(h.off0), off1: seg.rel(h.off1), takeId: seg.takeId, fx: [], run: xRun.length ? run - 1 : run++,
          }
          xRun.push(it)
          const k = cutOf(it.key)
          if (k) it.cut = k
          it.fx = fxOf(it.key)
          if (b.accepted.includes(it.key)) it.accepted = true
          push(it, lastU)
          prevEnd = it.t1 ?? prevEnd
          return
        }
        closeRun()
        const w = script[seg.from + op.i]
        const key = p.id + ':' + (seg.from + op.i)
        lastU = w.u.key
        const h = op.heard
        const it: DocItem = {
          key, kind: 'w', text: w.tok.text, gap: w.tok.gap, tok: w.tok, st: op.st, conf: h ? h.conf : 0, heard: op.st === 'mis' ? h?.text : undefined, pid: p.id, uKey: w.u.key,
          t0: h ? r3(seg.abs(h.off0)) : r3(prevEnd), t1: h ? r3(seg.abs(h.off1)) : r3(prevEnd), off0: h ? seg.rel(h.off0) : null, off1: h ? seg.rel(h.off1) : null,
          takeId: seg.takeId, fx: [],
        }
        const k = cutOf(key)
        if (k) it.cut = k
        it.fx = fxOf(key)
        if (b.accepted.includes(key)) it.accepted = true
        prevEnd = it.t1 ?? prevEnd
        push(it, w.u.key)
      })
      closeRun()
    })
    /* Words that were cut sit where the cut was, with no length of their own. */
    items.forEach((it) => {
      if (!it.cut) return
      const c = cuts.find((x) => x.id === it.cut)!
      const at = curTime(cuts, c.a)
      it.t0 = r3(at)
      it.t1 = r3(at)
    })
    const timed = items.filter((i) => i.t0 != null && i.st !== 'miss' && !i.cut)
    return {
      p, pi, passage, take, units: out, items, recorded: pl.recorded && aligned,
      start: timed.length ? timed[0].t0 : null, end: timed.length ? timed[timed.length - 1].t1 : null,
    }
  })

  const flat = docParas.flatMap((x) => x.items)
  return { paras: docParas, items: flat, index: new Map(flat.map((i, k) => [i.key, k])), aligned, engine: eng.engine(), counts: flagCounts(flat) }
}

/** What the legend counts: words said that are not in the script, words not read, misreads, words the recogniser was unsure of. Cut words no longer count. */
export function flagCounts(items: DocItem[]): FlagCounts {
  const live = items.filter((i) => !i.cut && !i.accepted)
  const count = (k: FlagKind): number => live.filter((i) => flagOf(i) === k).length
  /* A run of words said and not written is one thing to look at. */
  const runs = live.filter((i, k) => i.st === 'extra' && !(live[k - 1]?.st === 'extra' && live[k - 1].run === i.run && live[k - 1].pid === i.pid)).length
  return { extra: runs, miss: count('miss'), mis: count('mis'), low: count('low') }
}

export type FlagKind = 'extra' | 'miss' | 'mis' | 'low'
export const FLAG_LABEL: Record<FlagKind, [string, string]> = {
  extra: ['Not in the script', 'Extra'],
  miss: ['In the script, not read', 'Not read'],
  mis: ['Misread', 'Misread'],
  low: ['Low confidence', 'Low'],
}
export const isLow = (i: DocItem): boolean => i.st === 'ok' && i.conf < LOW_CONFIDENCE
export function flagOf(i: DocItem): FlagKind | null {
  if (i.cut || i.accepted) return null
  return i.st === 'extra' ? 'extra' : i.st === 'miss' ? 'miss' : i.st === 'mis' ? 'mis' : isLow(i) ? 'low' : null
}
/** The items worth a look, in order. A run of extra words counts once. */
export function flagged(doc: ChapterDoc, kind?: FlagKind): DocItem[] {
  return doc.items.filter((i, k) => {
    const f = flagOf(i)
    if (!f || (kind && f !== kind)) return false
    return !(f === 'extra' && doc.items[k - 1] && flagOf(doc.items[k - 1]) === 'extra' && doc.items[k - 1].run === i.run && doc.items[k - 1].pid === i.pid)
  })
}

/* ---- Selection ---- */

export interface Sel { anchor: string; head: string }

/** The keys between two words, both included, in the order of the text. */
export function rangeKeys(doc: ChapterDoc, a: string, z: string): string[] {
  const i = doc.index.get(a)
  const j = doc.index.get(z)
  if (i == null || j == null) return []
  return doc.items.slice(Math.min(i, j), Math.max(i, j) + 1).map((x) => x.key)
}
export const selKeys = (doc: ChapterDoc, sel: Sel | null): string[] => (sel ? rangeKeys(doc, sel.anchor, sel.head) : [])
/** The word a step of `d` words from `key` lands on; the first or last word at the ends. */
export function stepKey(doc: ChapterDoc, key: string | null, d: number): string | null {
  if (!doc.items.length) return null
  const i = key == null ? (d > 0 ? -1 : doc.items.length) : doc.index.get(key) ?? 0
  return doc.items[Math.max(0, Math.min(doc.items.length - 1, i + d))].key
}
/** The first word of the next (or previous) phrase: the Booth's sentence step. */
export function stepPhrase(doc: ChapterDoc, key: string | null, d: 1 | -1): string | null {
  if (!doc.items.length) return null
  const i = key == null ? 0 : doc.index.get(key) ?? 0
  const u = doc.items[i].uKey
  if (d > 0) return (doc.items.slice(i + 1).find((x) => x.uKey !== u) ?? doc.items[doc.items.length - 1]).key
  const startOfThis = doc.items.findIndex((x) => x.uKey === u)
  if (startOfThis < i) return doc.items[startOfThis].key
  const prev = doc.items[Math.max(0, startOfThis - 1)].uKey
  return doc.items[doc.items.findIndex((x) => x.uKey === prev)].key
}
/** The next (d = 1) or previous flagged word after `key`; null when there is none. */
export function stepFlag(doc: ChapterDoc, key: string | null, d: 1 | -1): string | null {
  const list = flagged(doc)
  if (!list.length) return null
  const at = key == null ? -1 : doc.index.get(key) ?? -1
  const pick = d > 0 ? list.find((x) => (doc.index.get(x.key) ?? 0) > at) : [...list].reverse().find((x) => (doc.index.get(x.key) ?? 0) < at)
  return (pick ?? (d > 0 ? list[0] : list[list.length - 1])).key
}
/** The word that is playing at `t` (seconds now), or the last one that began before it. */
export function itemAt(doc: ChapterDoc, t: number): DocItem | null {
  let hit: DocItem | null = null
  for (const i of doc.items) {
    if (i.t0 == null || i.cut || i.st === 'miss') continue
    if (i.t0 <= t + 1e-6) hit = i
    else break
  }
  return hit
}
/** The first word that is heard at or after `t`. */
export const firstFrom = (doc: ChapterDoc, key: string | null): DocItem | null => {
  const i = key == null ? 0 : doc.index.get(key) ?? 0
  return doc.items.slice(i).find((x) => x.t0 != null && !x.cut && x.st !== 'miss') ?? null
}

/* ---- What a selection comes to ---- */

export interface Range {
  pid: string
  takeId?: string
  keys: string[]
  items: DocItem[]
  /** Seconds now, snapped to a zero crossing. */
  start: number
  end: number
  /** The same range as seconds from the start of the take or the paragraph, before any cut. */
  off0: number
  off1: number
  /** Where the audio sat before any cut. */
  a: number
  b: number
  text: string
}
export interface SelSummary {
  items: DocItem[]
  /** Words that have audio and are not cut. */
  audible: DocItem[]
  /** One range for each paragraph the selection touches (an item of the DAW each). */
  ranges: Range[]
  /** Seconds the audio spans across all ranges. */
  len: number
  start: number
  end: number
  low: number
  /** Every selected word was said and is not in the script. */
  allExtra: boolean
  /** Some words are cut already. */
  hasCut: boolean
  /** Words with an effect already. */
  hasFx: boolean
  words: string
}

/** The words as they sound: what was heard where the script was misread. */
export const spoken = (i: DocItem): string => (i.st === 'mis' && i.heard ? i.heard : i.text)
export const joinWords = (items: DocItem[]): string => items.map(spoken).join(' ').replace(/[,;:]$/, '')

export function summarize(b: BookData, doc: ChapterDoc, keys: string[], padMs = 0): SelSummary {
  const items = keys.map((k) => doc.items[doc.index.get(k) ?? -1]).filter((i): i is DocItem => !!i)
  const audible = items.filter((i) => !i.cut && i.st !== 'miss' && i.t0 != null)
  const cuts = b.cuts
  const eng = alignment()
  const groups = new Map<string, DocItem[]>()
  audible.forEach((i) => groups.set(i.pid + '|' + (i.takeId ?? ''), [...(groups.get(i.pid + '|' + (i.takeId ?? '')) ?? []), i]))
  const pad = padMs / 1000
  const ranges: Range[] = [...groups.values()].map((g) => {
    const first = g[0]
    const last = g[g.length - 1]
    const start = eng.snap(first.t0! + pad)
    const end = Math.max(start + 0.01, eng.snap(last.t1! - pad))
    return {
      pid: first.pid, takeId: first.takeId, keys: g.map((x) => x.key), items: g, start, end,
      off0: r3(first.off0! + pad), off1: r3(last.off1! - pad), a: r3(origTime(cuts, start)), b: r3(origTime(cuts, end)), text: joinWords(g),
    }
  })
  const start = ranges.length ? Math.min(...ranges.map((r) => r.start)) : 0
  const end = ranges.length ? Math.max(...ranges.map((r) => r.end)) : 0
  return {
    items, audible, ranges, len: r3(ranges.reduce((a, r) => a + (r.end - r.start), 0)), start, end,
    low: audible.filter(isLow).length,
    allExtra: items.length > 0 && items.every((i) => i.st === 'extra'),
    hasCut: items.some((i) => i.cut), hasFx: items.some((i) => i.fx.length > 0), words: joinWords(audible.length ? audible : items),
  }
}

/** The passage a range sits in, if it has one, and the id the DAW gave its item (the app holds it to refuse a stale call). */
export function itemKeyOf(b: BookData, chapterId: string, pid: string): string {
  return b.passages.find((p) => p.chapterId === chapterId && p.pid === pid)?.id ?? 'track/' + chapterId
}

/** Where the audio after a range goes when the gap is closed: the first later word and when it sounds now and afterwards. */
export function laterAudio(doc: ChapterDoc, r: Range): { before: number; after: number } | null {
  const last = r.items[r.items.length - 1]
  const at = doc.index.get(last.key)
  if (at == null) return null
  const next = doc.items.slice(at + 1).find((x) => x.t0 != null && !x.cut && x.st !== 'miss')
  return next ? { before: next.t0!, after: r3(next.t0! - (r.end - r.start)) } : null
}

/** The characters of a paragraph that a run of its script words covers, for a note or a mark. Words that were only said (not in the script) are left out. */
export function scriptSpan(p: Paragraph, items: DocItem[]): { pid: string; s: number; e: number; q: string } | null {
  const words = items.filter((i) => i.kind === 'w' && i.pid === p.id).map((i) => Number(i.key.split(':')[1]))
  if (!words.length) return null
  const spans = [...p.text.matchAll(/\S+/g)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const)
  const s = spans[Math.min(...words)]?.[0]
  const e = spans[Math.max(...words)]?.[1]
  return s == null || e == null ? null : { pid: p.id, s, e, q: p.text.slice(s, e) }
}
