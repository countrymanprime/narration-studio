/**
 * Where a pronunciation comes from. Screens and commands ask this interface for the list of sources and for a candidate
 * pronunciation of a word from one of them; they never know how it was made. The mock reads sample data; a real
 * implementation (a speech engine, a dictionary service) replaces it without any screen changing.
 */
import type { PronSource } from '@/domain/schemas'
import { PRON_CANDIDATES, PRON_DEFAULT_SOURCE, PRON_SOURCES } from '@/fixtures/pronunciation'
import { getState } from '@/state/store'

export type PronCandidate = { ok: true; say: string } | { ok: false; reason: string }

export interface PronunciationProvider {
  /** The sources that can be offered, the narrator's own entry among them. */
  sources(): PronSource[]
  /** The source taken first for a word that has nothing yet. */
  defaultSource(): string
  /** What this source says for the word, or why it cannot say. */
  candidate(word: string, source: string): PronCandidate
}

export function createMockPronunciation(
  sources: PronSource[] = PRON_SOURCES,
  candidates: Record<string, Record<string, string>> = PRON_CANDIDATES,
  defaultSource: string = PRON_DEFAULT_SOURCE,
): PronunciationProvider {
  return {
    sources: () => sources,
    defaultSource: () => defaultSource,
    candidate(word, id) {
      const src = sources.find((s) => s.id === id)
      if (!src) return { ok: false, reason: 'That source is not available.' }
      if (src.kind === 'manual') return { ok: false, reason: 'Type it in.' }
      const { mock } = getState()
      if (src.needs === 'network' && mock.net === 'offline') return { ok: false, reason: src.label + ' cannot be reached.' }
      if (src.needs === 'localDictionary' && mock.dictLocal !== 'installed') return { ok: false, reason: src.label + ' is not installed.' }
      const say = candidates[id]?.[word.trim().toLowerCase()]
      return say ? { ok: true, say } : { ok: false, reason: src.label + ' has nothing for “' + word.trim() + '”.' }
    },
  }
}

let current: PronunciationProvider = createMockPronunciation()
export const pronunciation = (): PronunciationProvider => current
/** Swap the provider (a real one, or a test double). */
export function setPronunciationProvider(p: PronunciationProvider): void {
  current = p
}
