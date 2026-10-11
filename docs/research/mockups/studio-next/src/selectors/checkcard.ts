/**
 * The recording check card on Proof's chapter view: whether the chapter has been checked, how long the recording is against the script,
 * what the check found by category, and each finding as a suggestion. Pure functions of the book and the check provider.
 */
import type { BookData } from '@/domain/schemas'
import { WPH } from '@/config/estimates'
import type { CheckCategory, CheckFinding, FindingKind } from '@/fixtures/recordingcheck'
import { fmtD, parseIso } from '@/format/time'
import { recordingCheck } from '@/providers/recordingcheck'
import { checkOf, checkState, textKey } from './checks'
import { WAVE_TOTAL } from './proof'

export type CardState = 'none' | 'checking' | 'current' | 'stale'
export const CARD_LABEL: Record<CardState, string> = { none: 'Not checked', checking: 'Checking', current: 'Up to date', stale: 'Out of date' }
export const CARD_KIND = { none: 'neutral', checking: 'info', current: 'ok', stale: 'warn' } as const

export type ReviewStatus = 'todo' | 'accepted' | 'ignored'
export interface CardFinding extends CheckFinding { category: CheckCategory; status: ReviewStatus }

export interface CheckCard {
  state: CardState
  /** Seconds of audio on the chapter's track, and the script's length at the standard rate. Null when nothing is recorded. */
  recorded: number | null
  estimate: number
  /** How many differences the stored check found, and by category (null while there is no result). */
  differences: number | null
  counts: Partial<Record<FindingKind, number>> | null
  /** "Sep 26, 8:40 am": the saved project the check is as of, when the recorder keeps one. */
  asOf: string | null
  /** Why a check is out of date. */
  staleWhy: 'text' | 'recording' | 'save' | null
  findings: CardFinding[]
  tally: Record<ReviewStatus, number>
}

/** "2026-09-26T08:40" as "Sep 26, 8:40 am". */
export function fmtBasis(basis: string): string {
  const [day, time] = basis.split('T')
  const d = fmtD(parseIso(day))
  if (!time) return d
  const [h, m] = time.split(':').map(Number)
  return d + ', ' + (((h + 11) % 12) + 1) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'am' : 'pm')
}

export function staleWhy(b: BookData, chapterId: string, basis?: string): CheckCard['staleWhy'] {
  const k = checkOf(b, chapterId)
  const c = b.chapters.find((x) => x.id === chapterId)
  if (!k || !c || checkState(b, chapterId, basis) !== 'stale') return null
  if (k.textKey !== textKey(b, chapterId)) return 'text'
  if (k.rec !== c.rec) return 'recording'
  return 'save'
}

export function checkCard(b: BookData, chapterId: string, basis: string | undefined, run: { chapterId: string; pct: number } | null): CheckCard {
  const c = b.chapters.find((x) => x.id === chapterId)
  const cats = recordingCheck().categories()
  const base = checkState(b, chapterId, basis)
  const state: CardState = run && run.chapterId === chapterId ? 'checking' : base
  const k = checkOf(b, chapterId)
  const have = state === 'current' || state === 'stale'
  const all = have ? recordingCheck().findings(chapterId) : []
  const reviews = new Map<string, ReviewStatus>(b.findingReviews.filter((r) => r.chapterId === chapterId).map((r) => [r.id, r.status]))
  const findings: CardFinding[] = all.map((f) => ({ ...f, category: cats.find((x) => x.id === f.kind) as CheckCategory, status: reviews.get(f.id) ?? 'todo' })).filter((f) => !!f.category)
  const counts: Partial<Record<FindingKind, number>> | null = have ? Object.fromEntries(cats.map((x) => [x.id, all.filter((f) => f.kind === x.id).length])) : null
  return {
    state,
    recorded: c && c.rec > 0 ? Math.round((WAVE_TOTAL * c.rec) / 100) : null,
    estimate: c ? Math.round((c.words / WPH) * 3600) : 0,
    differences: have ? all.length : null,
    counts,
    asOf: have && k?.basis ? fmtBasis(k.basis) : null,
    staleWhy: staleWhy(b, chapterId, basis),
    findings,
    tally: { todo: findings.filter((f) => f.status === 'todo').length, accepted: findings.filter((f) => f.status === 'accepted').length, ignored: findings.filter((f) => f.status === 'ignored').length },
  }
}

/** "Checked against the script: 12 differences found". */
export const checkSentence = (n: number): string =>
  'Checked against the script: ' + (n === 0 ? 'no differences found' : n + (n === 1 ? ' difference' : ' differences') + ' found')
