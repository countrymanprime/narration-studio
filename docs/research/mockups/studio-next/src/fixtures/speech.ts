/**
 * Sample data behind the mock speech providers: what the live check suspects while a chapter is read, the engines the host reports
 * for the offline check, and how the sample recordings differ from the manuscript. A real engine replaces the providers without any
 * screen changing.
 */
import { LiveFlag } from '@/domain/daw'

export const LIVE_FLAGS: LiveFlag[] = [
  { chapterId: '8', pid: '8-9', kind: 'skip', words: [8, 13], heard: '“Would you tell me,” said Alice, a little timidly' },
  { chapterId: '8', pid: '8-12', kind: 'restart', words: [0, 4], heard: 'First came ten soldiers First came ten soldiers' },
  { chapterId: '7', pid: '7-2', kind: 'skip', words: [0, 6] },
].map((f) => LiveFlag.parse(f))

/** Why a suspicion from the live check has no confidence: it listens for a mess-up and does not score it. */
export const LIVE_NO_SCORE = 'The live check only suspects a slip; it does not score it.'

/** A speech engine as the host reports it. `factor` is the check's time per minute of audio, before sharing it between workers. */
export interface SpeechEngine { id: string; label: string; family: string; factor: number }

/** The engine that listens to the microphone while the narrator reads. It runs in the Booth only. */
export const LIVE_ENGINE: SpeechEngine = { id: 'Moonshine base', label: 'Moonshine base', family: 'moonshine', factor: 0.06 }

/** The engines the host offers for checking a finished recording: Whisper-class only. */
export const OFFLINE_ENGINES: SpeechEngine[] = [
  { id: 'Whisper tiny', label: 'Whisper tiny', family: 'whisper', factor: 0.05 },
  { id: 'Whisper base', label: 'Whisper base', family: 'whisper', factor: 0.08 },
  { id: 'Whisper small', label: 'Whisper small', family: 'whisper', factor: 0.2 },
  { id: 'Whisper medium', label: 'Whisper medium', family: 'whisper', factor: 0.45 },
]
export const DEFAULT_OFFLINE_ENGINE = 'Whisper base'

/** How a sample recording differs from the text. The check turns each of these into what the engine would have heard. */
export type HearEdit = (
  | { op: 'skip' }
  | { op: 'drop'; from: number; to: number }
  | { op: 'add'; at: number; words: string }
  | { op: 'swap'; from: number; to: number; words: string }
) & { pid: string; conf: number | null; confReason?: string }

export const HEAR_EDITS: Record<string, HearEdit[]> = {
  '3': [
    { pid: '3-2', op: 'drop', from: 11, to: 16, conf: 0.93 },
    { pid: '3-4', op: 'swap', from: 11, to: 13, words: 'accept of', conf: 0.91 },
  ],
  '5': [{ pid: '5-8', op: 'swap', from: 1, to: 2, words: 'is not', conf: null, confReason: 'The words are too short for the engine to score.' }],
  '7': [{ pid: '7-1', op: 'add', at: 0, words: 'Well then', conf: 0.88 }],
}
/** Paragraphs at the start of a chapter's recording that were not read (the take started later). */
export const UNREAD_START: Record<string, number> = {}

/** What a re-check hears differently from the first check, by chapter and proof note id. A note that changed has new evidence. */
export interface Recheck { id: number; heard: string; conf: number | null; confReason?: string }
export const RECHECKS: Record<string, Recheck[]> = {
  '5': [
    { id: 2, heard: '“I can’t explain <del>myself</del>, I’m <del>afraid</del>, sir,”', conf: 0.71 },
    { id: 8, heard: '“<del>curious</del><ins>curiouser</ins> and <ins>curiouser</ins>”', conf: 0.66 },
  ],
}
