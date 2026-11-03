/**
 * Sample data behind the recording check card on Proof: what a check of a chapter finds, and the categories the findings fall into.
 * A real engine (speech recognition for the words, audio analysis for the sound) replaces the provider without any screen changing.
 */
import type { FindingType, Resolution } from '@/domain/schemas'

export type FindingKind = 'misread' | 'skipped' | 'repeated' | 'extra' | 'noise' | 'breath' | 'click'
export type FindingSource = 'speech' | 'audio'

export interface CheckCategory {
  id: FindingKind
  label: string
  source: FindingSource
  /** The kind of note an accepted finding becomes, and the decision it starts with. */
  ty: FindingType
  suggest: Resolution
  colour: string
}
export const CHECK_GROUPS: Record<FindingSource, string> = { speech: 'Detected from speech', audio: 'Detected from audio' }
export const CHECK_CATEGORIES: CheckCategory[] = [
  { id: 'misread', label: 'Misread words', source: 'speech', ty: 'misread', suggest: 'pickup', colour: 'var(--bad)' },
  { id: 'skipped', label: 'Skipped', source: 'speech', ty: 'skip', suggest: 'pickup', colour: 'var(--bad)' },
  { id: 'repeated', label: 'Repeated', source: 'speech', ty: 'repeat', suggest: 'pickup', colour: 'var(--copper)' },
  { id: 'extra', label: 'Extra words', source: 'speech', ty: 'repeat', suggest: 'pickup', colour: 'var(--info)' },
  { id: 'noise', label: 'Background noise', source: 'audio', ty: 'noise', suggest: 'edit', colour: 'var(--warn)' },
  { id: 'breath', label: 'Breaths', source: 'audio', ty: 'breath', suggest: 'edit', colour: 'var(--warn)' },
  { id: 'click', label: 'Clicks', source: 'audio', ty: 'mouth', suggest: 'edit', colour: 'var(--warn)' },
]

export interface CheckFinding {
  id: string
  chapterId: string
  kind: FindingKind
  /** Seconds into the chapter recording. */
  sec: number
  pid: string | null
  /** What the finding says, and (for the words) the script and what was heard. */
  text: string
  script?: string
  heard?: string
  /** How sure the check is; null with a reason when it cannot say (audio findings carry no score). */
  conf: number | null
  confReason?: string
}

const NO_AUDIO_SCORE = 'The audio analysis gives no score.'
const f = (chapterId: string, n: number, kind: FindingKind, sec: number, pid: string, text: string, conf: number | null, extra: Partial<CheckFinding> = {}): CheckFinding =>
  ({ id: 'f' + chapterId + '-' + n, chapterId, kind, sec, pid, text, conf, ...(conf == null ? { confReason: NO_AUDIO_SCORE } : {}), ...extra })

export const CHECK_FINDINGS: CheckFinding[] = [
  f('5', 1, 'breath', 71.2, '5-1', 'Loud breath before “at last”', null),
  f('5', 2, 'misread', 31, '5-1', 'Misread: “languid” heard as “languish”', 0.84, { script: 'a <b>languid</b>, sleepy voice', heard: 'a <del>languid</del><ins>languish</ins>, sleepy voice' }),
  f('5', 3, 'misread', 118.5, '5-3', 'Misread: “just at present” heard as “just at the present”', 0.78),
  f('5', 4, 'skipped', 190.6, '5-4', 'Skipped: “sternly” not heard', 0.93, { script: 'said the Caterpillar <b>sternly</b>.', heard: 'said the Caterpillar <del>sternly</del>.' }),
  f('5', 5, 'noise', 268.4, '5-6', 'Background noise, 540 ms', null),
  f('5', 6, 'misread', 305.2, '5-7', 'Misread: “confusing” heard as “confused”', 0.9),
  f('5', 7, 'click', 349.7, '5-8', 'Click before “It isn’t”', null),
  f('5', 8, 'skipped', 410.4, '5-9', 'Skipped: “you know” not heard', 0.88),
  f('5', 9, 'repeated', 455.9, '5-9', 'Repeated: “then after that”', 0.95),
  f('5', 10, 'breath', 512.8, '5-9', 'Loud breath before “I should think”', null),
  f('5', 11, 'misread', 540.3, '5-11', 'Misread: “queer” heard as “clear”', 0.62),
  f('5', 12, 'extra', 575, '5-12', 'Extra words: “oh” before “You!”', 0.71),
  f('3', 1, 'misread', 131, '3-1', 'Misread: “older” heard as “elder”', 0.97),
  f('3', 2, 'skipped', 348.2, '3-2', 'Skipped: “and uncomfortable” not heard', 0.93),
  f('3', 3, 'noise', 450.9, '3-4', 'Background noise, 380 ms', null),
]
