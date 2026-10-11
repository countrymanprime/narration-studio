/**
 * The speech engines. Two jobs, two engines:
 *  - the live check listens to the narrator while a take runs, in the Booth only (Moonshine). It only suspects: a flag says "this may
 *    have been skipped or read again", and the narrator can dismiss it. Nothing here flags by hand.
 *  - the offline check transcribes a finished recording after the fact and compares it with the manuscript (Whisper-class), for the
 *    Check recordings dialog. Its engines are whatever the host reports.
 * The mock answers from sample data; a real engine replaces it without any screen changing.
 */
import type { LiveFlag } from '@/domain/daw'
import type { Chapter, Paragraph } from '@/domain/schemas'
import { wordsIn } from '@/format/text'
import { DEFAULT_OFFLINE_ENGINE, HEAR_EDITS, LIVE_ENGINE, LIVE_FLAGS, OFFLINE_ENGINES, RECHECKS, UNREAD_START, type HearEdit, type Recheck, type SpeechEngine } from '@/fixtures/speech'
import { classifyGaps, type Gap, type GapResult } from '@/selectors/gaps'

export type { SpeechEngine }

/** A gap with how sure the check is of it. Null with a reason when it cannot say. */
export interface Finding extends Gap { conf: number | null; confReason?: string }
export interface CheckOutcome extends GapResult { findings: Finding[]; engine: string }
export type NoteRecheck = Recheck

export interface SpeechProvider {
  /** Suspected skips and restarts in the paragraphs just read. */
  liveFlags(read: { chapterId: string; pids: string[] }): LiveFlag[]
  /** The engine that listens while a take runs. */
  liveEngine(): SpeechEngine
  /** The engines the host offers to check a finished recording, and the one chosen first. */
  engines(): SpeechEngine[]
  defaultEngine(): string
  /** Transcribe the chapter's recording and compare it with its text. */
  check(req: { chapter: Chapter; paragraphs: Paragraph[]; engine: string }): CheckOutcome
  /** What a new check hears differently on notes already made in these chapters. */
  recheck(chapterIds: string[]): NoteRecheck[]
}

/** The text an engine would have heard in a paragraph, given how the recording differs from it. */
function heardWith(text: string, edit: HearEdit | undefined): string | null {
  if (!edit) return text
  if (edit.op === 'skip') return null
  const w = text.split(/\s+/)
  if (edit.op === 'drop') return [...w.slice(0, edit.from), ...w.slice(edit.to)].join(' ')
  if (edit.op === 'add') return [...w.slice(0, edit.at), edit.words, ...w.slice(edit.at)].join(' ')
  return [...w.slice(0, edit.from), edit.words, ...w.slice(edit.to)].join(' ')
}

export function createMockSpeech(
  flags: LiveFlag[] = LIVE_FLAGS, offline: SpeechEngine[] = OFFLINE_ENGINES, edits: Record<string, HearEdit[]> = HEAR_EDITS,
  unreadStart: Record<string, number> = UNREAD_START, rechecks: Record<string, Recheck[]> = RECHECKS,
): SpeechProvider {
  return {
    liveFlags: ({ chapterId, pids }) => flags.filter((f) => f.chapterId === chapterId && pids.includes(f.pid)),
    liveEngine: () => LIVE_ENGINE,
    engines: () => offline,
    defaultEngine: () => (offline.some((e) => e.id === DEFAULT_OFFLINE_ENGINE) ? DEFAULT_OFFLINE_ENGINE : offline[0]?.id ?? ''),
    check({ chapter, paragraphs, engine }) {
      /* The recording covers the recorded share of the chapter's text; a paragraph that starts inside it was read. */
      const recordedWords = (paragraphs.reduce((a, p) => a + wordsIn(p.text), 0) * chapter.rec) / 100
      let before = 0
      const own = edits[chapter.id] ?? []
      const heard = paragraphs.map((p, i) => {
        const read = i >= (unreadStart[chapter.id] ?? 0) && before < recordedWords
        before += wordsIn(p.text)
        return read ? heardWith(p.text, own.find((e) => e.pid === p.id)) : null
      })
      const res = classifyGaps(paragraphs, heard)
      const findings = res.gaps.map((g) => {
        const e = own.find((x) => x.pid === g.pid)
        return { ...g, conf: e ? e.conf : null, ...(e ? (e.confReason ? { confReason: e.confReason } : {}) : { confReason: 'The engine gave no score for this gap.' }) }
      })
      return { ...res, findings, engine }
    },
    recheck: (ids) => ids.flatMap((c) => rechecks[c] ?? []),
  }
}

let current: SpeechProvider = createMockSpeech()
export function speech(): SpeechProvider {
  return current
}
/** Swap the provider (a real one, or a test double). */
export function setSpeechProvider(p: SpeechProvider): void {
  current = p
}

/**
 * The same suspicion read twice is one pickup: the key is the chapter, paragraph, kind, words and which one of those it is
 * (`ordinal`), so a re-read does not add it again and a dismissed one stays dismissed.
 */
export const flagKey = (f: LiveFlag, ordinal = 0): string => ['f', f.chapterId, f.pid, f.kind, f.words.join('-'), ordinal].join(':')
