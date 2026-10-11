/**
 * Editing: everything the page derives from the book. Takes and their transcripts, the cleanup findings and their
 * thresholds, effect regions and how much of a chapter they cover. Pure functions of BookData; the page and its commands only call these.
 */
import type { BookData, EffectId, FindingType, FxRegion, FxScope, Passage, ProofNote, Take, TakeSource } from '@/domain/schemas'
import { DEAD_AIR_LIMIT } from '@/config/estimates'
import type { MockState } from '@/state/slices/mock'
import { diffWords, key as normKey, tokens } from '@/format/diff'
import { curTime } from './cuts'
import { capabilitiesFor } from './daw'
import { WAVE_TOTAL } from './proof'

type Setup = MockState['setup']

/** The parts of the drawer beside the script. The timeline only appears here where the window is too narrow for the strip. */
export type DrawerTab = 'cleanup' | 'effects' | 'backups' | 'timeline'
export const DRAWER_TABS: Array<[DrawerTab, string]> = [['cleanup', 'Clean up'], ['effects', 'Effects'], ['backups', 'Backups'], ['timeline', 'Timeline']]
/** The tabs a DAW offers: Backups only where the DAW has the capability at all (Audacity keeps no takes, so it clones audio instead); the timeline only where the strip does not fit. */
export const tabsFor = (setup: Setup, stripFits = false): Array<[DrawerTab, string]> =>
  DRAWER_TABS.filter(([k]) => (k !== 'backups' || capabilitiesFor(setup, false).caps.backups.level !== 'unsupported') && (k !== 'timeline' || !stripFits))

/** The sample's chapters are all this long (the same length Proof draws). */
export const chapterSeconds = (_b: BookData, _chapterId: string): number => WAVE_TOTAL

/** Short plain sentences for the page's empty and unavailable states. */
export const EDIT_TEXT = {
  noText: 'This chapter has no text yet.',
  noTakes: 'No restarts found in this chapter.',
  noFindings: 'Nothing found at these settings.',
  noEffects: 'No effects on this chapter.',
  noBackups: 'No backups yet.',
  needsTakes: 'Needs a DAW with takes',
  keepFirst: 'Keep a take first',
}
export const dawOffText = (label: string): string => label + ' is not running.'
export const dawOffNote = (label: string): string => 'You can look at takes, findings and effects. Changes wait until ' + label + ' is running.'

/** Where a take lives, as the narrator would say it. With the built-in recorder every take is the app's own; Audacity's are clips on the track. */
export const SOURCE_LABEL: Record<TakeSource, string> = { reaper: 'REAPER take', recorder: 'Recorder take', clip: 'Audacity clip' }
export const sourceOf = (t: Take, setup: Setup): TakeSource => (setup === 'builtin' ? 'recorder' : setup === 'audacity' ? 'clip' : t.source)

/* ---- Takes ---- */

/** The script for a passage: the manuscript text it was read from. */
export function passageScript(b: BookData, p: Passage): string {
  return b.paragraphs.find((x) => x.id === p.pid)?.text.slice(p.s, p.e) ?? ''
}
export const passageStart = (p: Passage): number => Math.min(...p.takes.map((t) => t.start))

/**
 * A passage with one take that reads the line twice in a row: the narrator restarted and the take was never cut. The second read begins at
 * `at` seconds into the chapter recording. Null when the take reads the line once.
 */
export function duplicateRead(b: BookData, p: Passage): { at: number; first: string; second: string } | null {
  if (p.takes.length !== 1) return null
  const t = p.takes[0]
  const script = tokens(passageScript(b, p))
  const heard = tokens(t.text)
  const head = script.slice(0, Math.min(4, script.length)).map((w) => w.toLowerCase())
  const starts = heard.map((_, i) => i).filter((i) => head.every((h, k) => (heard[i + k] ?? '').toLowerCase() === h))
  if (starts.length < 2) return null
  const cut = starts[1]
  /* The second read was cut from the script: nothing is left to split. */
  const first = tokens(heard.slice(cut).join(' '))[0]
  if (b.cuts.some((c) => c.takeId === t.id && tokens(c.text).length >= 4 && normKey(tokens(c.text)[0]) === normKey(first ?? ''))) return null
  return { at: Math.round((t.start + (t.len * cut) / heard.length) * 10) / 10, first: heard.slice(0, cut).join(' '), second: heard.slice(cut).join(' ') }
}

/** Passages with more than one take, or one take that reads the line twice, in time order. Anything else has nothing to choose. */
export function passagesOf(b: BookData, chapterId: string): Passage[] {
  return b.passages.filter((p) => p.chapterId === chapterId && (p.takes.length > 1 || !!duplicateRead(b, p))).sort((a, c) => passageStart(a) - passageStart(c))
}
export const activeTake = (p: Passage): Take | undefined => p.takes.find((t) => t.active)

/** The passage a proof note about takes points at. */
export const passageOfNote = (b: BookData, n: Pick<ProofNote, 'chapterId' | 'pid'>): Passage | undefined =>
  n.pid ? b.passages.find((p) => p.chapterId === n.chapterId && p.pid === n.pid) : undefined

/** The paragraphs before and after the passage, for context. */
export function passageContext(b: BookData, p: Passage): { before: string; after: string } {
  const ps = b.paragraphs.filter((x) => x.chapterId === p.chapterId)
  const i = ps.findIndex((x) => x.id === p.pid)
  return { before: ps[i - 1]?.text ?? '', after: ps[i + 1]?.text ?? '' }
}

export { diffWords, tokens, type WordPart } from '@/format/diff'

export interface TakeMatch { same: number; missing: number; extra: number; pct: number; exact: boolean }
export function takeMatch(script: string, heard: string): TakeMatch {
  const parts = diffWords(script, heard)
  const same = parts.filter((p) => p.k === 'same').length
  const missing = parts.filter((p) => p.k === 'del').length
  const extra = parts.filter((p) => p.k === 'ins').length
  const total = same + missing
  return { same, missing, extra, pct: total ? Math.round((same / total) * 100) : 0, exact: missing === 0 && extra === 0 }
}

/** Which takes the narrator still has in front of them: the hidden ones are muted and out of the way. */
export const shownTakes = (p: Passage): Take[] => p.takes.filter((t) => !t.hidden)

/* ---- Cleanup ---- */

export type CleanupKind = 'gaps' | 'breaths' | 'clicks' | 'plosives' | 'noise'
export type Level = 'light' | 'standard' | 'heavy'
export const LEVELS: Array<[Level, string]> = [['light', 'Light'], ['standard', 'Standard'], ['heavy', 'Heavy']]
export type ParamKey = 'limit' | 'above' | 'reduce'
export type CleanupParams = Partial<Record<ParamKey, number>>
export interface OpField { key: ParamKey; label: string; unit: string; min: number; max: number; step: number }
export interface OpSpec {
  kind: CleanupKind
  label: string
  /** What one finding is called. */
  noun: [string, string]
  ty: FindingType
  fields: OpField[]
  levels: Record<Level, CleanupParams>
}

const ABOVE = (label: string): OpField => ({ key: 'above', label, unit: 'dB', min: -60, max: 0, step: 1 })
const REDUCE: OpField = { key: 'reduce', label: 'Reduce by', unit: 'dB', min: 1, max: 24, step: 1 }

/** The thresholds behind Light, Standard and Heavy are starting values to tune on real recordings. */
export const CLEANUP_OPS: OpSpec[] = [
  { kind: 'gaps', label: 'Gaps', noun: ['gap', 'gaps'], ty: 'pacing', fields: [{ key: 'limit', label: 'Longest gap left', unit: 's', min: 0.2, max: 5, step: 0.1 }],
    levels: { light: { limit: 2 }, standard: { limit: DEAD_AIR_LIMIT }, heavy: { limit: 0.8 } } },
  { kind: 'breaths', label: 'Breaths', noun: ['breath', 'breaths'], ty: 'breath', fields: [ABOVE('Louder than'), REDUCE],
    levels: { light: { above: -20, reduce: 6 }, standard: { above: -26, reduce: 9 }, heavy: { above: -32, reduce: 12 } } },
  { kind: 'clicks', label: 'Clicks', noun: ['click', 'clicks'], ty: 'mouth', fields: [ABOVE('Louder than')],
    levels: { light: { above: -22 }, standard: { above: -28 }, heavy: { above: -34 } } },
  { kind: 'plosives', label: 'Plosives', noun: ['plosive', 'plosives'], ty: 'plosive', fields: [ABOVE('Louder than'), REDUCE],
    levels: { light: { above: -9, reduce: 4 }, standard: { above: -14, reduce: 6 }, heavy: { above: -18, reduce: 9 } } },
  { kind: 'noise', label: 'Noise', noun: ['noise', 'noises'], ty: 'noise', fields: [ABOVE('Louder than'), REDUCE],
    levels: { light: { above: -32, reduce: 8 }, standard: { above: -36, reduce: 12 }, heavy: { above: -40, reduce: 16 } } },
]
export const opSpec = (k: CleanupKind): OpSpec => CLEANUP_OPS.find((o) => o.kind === k)!

export const initialParams = (): Record<CleanupKind, CleanupParams> =>
  Object.fromEntries(CLEANUP_OPS.map((o) => [o.kind, { ...o.levels.standard }])) as Record<CleanupKind, CleanupParams>
export const initialLevels = (): Record<CleanupKind, Level | null> =>
  Object.fromEntries(CLEANUP_OPS.map((o) => [o.kind, 'standard'])) as Record<CleanupKind, Level | null>

/** The level whose thresholds these are, or null for custom ones. */
export function levelOf(kind: CleanupKind, p: CleanupParams): Level | null {
  const spec = opSpec(kind)
  return LEVELS.map(([l]) => l).find((l) => spec.fields.every((f) => spec.levels[l][f.key] === p[f.key])) ?? null
}

export interface CleanupRow { key: string; ty: FindingType; sec: number; dur: number; db?: number; done: boolean; src: 'note' | 'detection'; id: string }

/** Everything measured of this kind in the chapter: proof notes of the type and the app's own detections, in time order. */
export function cleanupRows(b: BookData, chapterId: string, kind: CleanupKind): CleanupRow[] {
  const ty = opSpec(kind).ty
  const notes: CleanupRow[] = b.proofNotes
    .filter((n) => n.chapterId === chapterId && n.ty === ty && (!n.res || n.res === 'edit' || n.res === 'fixed'))
    .map((n) => ({ key: 'note:' + n.id, id: String(n.id), src: 'note', ty, sec: n.sec, dur: n.dur ?? 0, db: n.db, done: n.res === 'fixed' }))
  const found: CleanupRow[] = b.detections
    .filter((d) => d.chapterId === chapterId && d.ty === ty)
    .map((d) => ({ key: 'det:' + d.id, id: d.id, src: 'detection', ty, sec: d.sec, dur: d.dur, db: d.db, done: d.res === 'fixed' }))
  return [...notes, ...found].sort((a, c) => a.sec - c.sec)
}

/** Does this finding pass the thresholds, so the page proposes a fix? */
export function passes(kind: CleanupKind, p: CleanupParams, r: CleanupRow): boolean {
  return kind === 'gaps' ? r.dur > (p.limit ?? DEAD_AIR_LIMIT) : (r.db ?? -Infinity) > (p.above ?? 0)
}
/** The rows the list shows: those that pass, and those already fixed. */
export function proposals(b: BookData, chapterId: string, kind: CleanupKind, p: CleanupParams): CleanupRow[] {
  return cleanupRows(b, chapterId, kind).filter((r) => r.done || passes(kind, p, r))
}
export const selectedRows = (rows: CleanupRow[], skip: string[]): CleanupRow[] => rows.filter((r) => !r.done && !skip.includes(r.key))

const dB = (n: number): string => (n < 0 ? '−' : '+') + Math.abs(n) + ' dB'
export function measureText(kind: CleanupKind, r: CleanupRow): string {
  if (kind === 'gaps') return r.dur + ' s'
  const len = r.dur < 0.1 ? Math.round(r.dur * 1000) + ' ms' : r.dur + ' s'
  return (r.db != null ? dB(r.db) + ' · ' : '') + len
}
export function actionText(kind: CleanupKind, p: CleanupParams): string {
  if (kind === 'gaps') return 'Shorten to ' + p.limit + ' s'
  if (kind === 'clicks') return 'Repair the click'
  return 'Reduce by ' + p.reduce + ' dB'
}
/** The history label of an apply: "Shortened 3 gaps". */
export function appliedLabel(kind: CleanupKind, n: number, p: CleanupParams): string {
  const spec = opSpec(kind)
  const noun = n + ' ' + spec.noun[n > 1 ? 1 : 0]
  if (kind === 'gaps') return 'Shortened ' + noun
  if (kind === 'clicks') return 'Repaired ' + noun
  return (kind === 'plosives' ? 'Softened ' : 'Reduced ') + noun + ' by ' + p.reduce + ' dB'
}
/** The amount handed to the DAW: the longest gap left, or the dB to take off. */
export const amountOf = (kind: CleanupKind, p: CleanupParams): number => (kind === 'gaps' ? p.limit ?? DEAD_AIR_LIMIT : p.reduce ?? 0)

/* ---- Effects ---- */

export interface ParamDef { key: string; label: string; unit: string; min: number; max: number; step: number; control: 'slider' | 'number' }
export interface EffectDef { id: EffectId; name: string; params: ParamDef[] }
const P = (key: string, label: string, unit: string, min: number, max: number, step: number, control: ParamDef['control']): ParamDef => ({ key, label, unit, min, max, step, control })
export const EFFECTS: Record<EffectId, EffectDef> = {
  pitch: { id: 'pitch', name: 'Pitch shift', params: [P('semitones', 'Pitch', 'semitones', -12, 12, 1, 'slider'), P('mix', 'Mix', '%', 0, 100, 5, 'slider')] },
  deess: { id: 'deess', name: 'De-esser', params: [P('freq', 'Frequency', 'kHz', 3, 12, 0.5, 'number'), P('amount', 'Reduction', 'dB', 0, 12, 1, 'slider')] },
  deplosive: { id: 'deplosive', name: 'De-plosive', params: [P('cutoff', 'Cutoff', 'Hz', 40, 200, 5, 'number'), P('amount', 'Reduction', 'dB', 0, 12, 1, 'slider')] },
  declick: { id: 'declick', name: 'De-click', params: [P('sensitivity', 'Sensitivity', '%', 0, 100, 5, 'slider')] },
  denoise: { id: 'denoise', name: 'Noise reduction', params: [P('reduction', 'Reduction', 'dB', 0, 24, 1, 'slider')] },
  eq: { id: 'eq', name: 'EQ', params: [P('lowcut', 'Low cut', 'Hz', 20, 300, 5, 'number'), P('presence', 'Presence', 'dB', -6, 6, 1, 'slider')] },
}
export const SCOPE_LABEL: Record<FxScope, string> = { section: 'Section', take: 'One take', track: 'Whole track' }
export const SCOPE_OPTIONS = (setup: Setup): Array<{ value: FxScope; label: string; disabled?: boolean }> =>
  (['section', 'take', 'track'] as const).map((v) => {
    const no = v === 'take' && !regionAvailable(setup, { scope: 'take' })
    return { value: v, label: SCOPE_LABEL[v] + (no ? ' · ' + EDIT_TEXT.needsTakes : ''), disabled: no }
  })

/** A take-level effect needs a DAW that keeps takes on tracks. The recorder has none. */
export const regionAvailable = (setup: Setup, r: Pick<FxRegion, 'scope'>): boolean => r.scope !== 'take' || ['supported', 'experimental'].includes(capabilitiesFor(setup, false).caps.takeFx.level)

export const regionsOf = (b: BookData, chapterId: string): FxRegion[] => b.fxRegions.filter((r) => r.chapterId === chapterId).sort((a, c) => a.start - c.start)
export function regionName(b: BookData, r: FxRegion): string {
  return b.fxPresets.find((p) => p.id === r.presetId)?.name ?? EFFECTS[r.effect].name
}
export const regionLen = (r: Pick<FxRegion, 'start' | 'end'>): number => r.end - r.start
/** The share of the chapter one region covers (percent). A whole-track region is all of it. */
export const regionShare = (b: BookData, r: FxRegion): number => (r.scope === 'track' ? 100 : (regionLen(r) / chapterSeconds(b, r.chapterId)) * 100)

export interface Span { start: number; end: number }
export interface CoverSeg { start: number; end: number; n: number }
const spanOf = (r: FxRegion, total: number): Span => (r.scope === 'track' ? { start: 0, end: total } : { start: r.start, end: Math.min(total, r.end) })

/** The regions that are on: not bypassed, and available with this recorder. */
export const activeRegions = (b: BookData, chapterId: string, setup: Setup): FxRegion[] => regionsOf(b, chapterId).filter((r) => !r.bypass && regionAvailable(setup, r))

/** The chapter cut at every region edge, with how many effects stack on each piece. Pieces with none are left out. */
export function coverSegments(spans: Span[], total: number): CoverSeg[] {
  const cuts = [...new Set([0, total, ...spans.flatMap((s) => [s.start, s.end])])].filter((x) => x >= 0 && x <= total).sort((a, c) => a - c)
  const out: CoverSeg[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const mid = (cuts[i] + cuts[i + 1]) / 2
    const n = spans.filter((s) => s.start <= mid && mid < s.end).length
    if (n) out.push({ start: cuts[i], end: cuts[i + 1], n })
  }
  return out
}
export const coveredSeconds = (spans: Span[], total: number): number => coverSegments(spans, total).reduce((a, s) => a + (s.end - s.start), 0)

export interface Coverage { sec: number; pct: number; segs: CoverSeg[]; total: number }
/** How much of the chapter has an effect on it, counting `extra` as if it were added. */
export function coverage(b: BookData, chapterId: string, setup: Setup, extra: Span[] = []): Coverage {
  const total = chapterSeconds(b, chapterId)
  /* An effect on words covers the stretch of those words, where they sound now. */
  const onWords = b.wordFx.filter((f) => f.chapterId === chapterId).map((f) => ({ start: curTime(b.cuts, f.a), end: curTime(b.cuts, f.b) }))
  const spans = [...activeRegions(b, chapterId, setup).map((r) => spanOf(r, total)), ...onWords, ...extra]
  const segs = coverSegments(spans, total)
  const sec = segs.reduce((a, s) => a + (s.end - s.start), 0)
  return { sec, pct: total ? (sec / total) * 100 : 0, segs, total }
}
export const spanFor = (scope: FxScope, start: number, end: number, total: number): Span => (scope === 'track' ? { start: 0, end: total } : { start, end })

export type CapState = 'within' | 'over' | 'far'
/** Over the cap warns; twice the cap warns louder. */
export const capState = (pct: number, cap: number): CapState => (pct > cap * 2 ? 'far' : pct > cap ? 'over' : 'within')
export const fmtPct = (n: number): string => (Math.round(n * 10) / 10).toFixed(1) + '%'

export const chapterTakes = (b: BookData, chapterId: string): Take[] => b.passages.filter((p) => p.chapterId === chapterId).flatMap((p) => p.takes)
export const nextRegionId = (b: BookData): string => 'fx' + (Math.max(0, ...b.fxRegions.map((r) => +r.id.replace(/\D/g, '') || 0)) + 1)
