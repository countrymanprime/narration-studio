/**
 * Where Story Bible suggestions come from. A provider only offers `RawSuggestion`s (what it found, how sure it is, the quotes behind it);
 * the app verifies the quotes, stores, applies and takes back (state/extractionCore.ts). The mock rules provider reads fixture
 * data; an imported file is parsed by pure functions; a local model is the same interface once one exists. No provider needs a network.
 */
import { EXTRACTION_SOURCES, type ExtractionSourceId } from '@/config/extraction'
import type { BookData } from '@/domain/schemas'
import { BOOKNLP_FINDINGS, GLINER_FINDINGS, LOCAL_MODEL_STATE, RULES_FINDINGS, type BookNlpFinding, type BookNlpVariant } from '@/fixtures/extraction'
import { parseImport } from '@/format/extractionImport'
import { getState } from '@/state/store'
import { planImport } from '@/selectors/extractionImport'
import type { RawSuggestion } from '@/state/extractionCore'

export type Availability = { ok: true } | { ok: false; reason: string }

export interface ExtractionProvider {
  id: ExtractionSourceId
  available(): Availability
  /** Look at the book (and, for an imported file, its text) and offer suggestions. Never writes the Story Bible. */
  run(book: BookData, input?: string): Promise<RawSuggestion[]>
}

export function createMockRules(findings: RawSuggestion[] = RULES_FINDINGS): ExtractionProvider {
  return { id: 'rules', available: () => ({ ok: true }), run: async () => findings.map((f) => ({ ...f })) }
}
export function createImported(): ExtractionProvider {
  return {
    id: 'imported',
    available: () => ({ ok: true }),
    run: async (book, input = '') => {
      const parsed = parseImport(input)
      return planImport(book, parsed.rows).raws
    },
  }
}
export function createMockLocalModel(state: { installed: boolean; reason: string } = LOCAL_MODEL_STATE): ExtractionProvider {
  return {
    id: 'local-model',
    available: () => (state.installed ? { ok: true } : { ok: false, reason: state.reason }),
    run: async () => [],
  }
}

/** Which analysis tools are on this computer. The default reads the narrator's preferences; a test passes its own. */
export type InstalledIds = () => string[]
const installedFromPrefs: InstalledIds = () => getState().ui.prefs.installedComponents

/** GLiNER: candidate names. Offers nothing until it has been downloaded. */
export function createMockGliner(findings: RawSuggestion[] = GLINER_FINDINGS, installed: InstalledIds = installedFromPrefs): ExtractionProvider {
  return {
    id: 'gliner',
    available: () => (installed().includes('gliner') ? { ok: true } : { ok: false, reason: 'GLiNER is not downloaded.' }),
    run: async () => findings.map((f) => ({ ...f })),
  }
}

/** BookNLP: names, speakers, gender. The large download, when both are there, gives the surer answers. */
export function createMockBookNlp(findings: BookNlpFinding[] = BOOKNLP_FINDINGS, installed: InstalledIds = installedFromPrefs): ExtractionProvider {
  const variantOf = (): BookNlpVariant | null => {
    const ids = installed()
    return ids.includes('booknlp-big') ? 'big' : ids.includes('booknlp-small') ? 'small' : null
  }
  return {
    id: 'booknlp',
    available: () => (variantOf() ? { ok: true } : { ok: false, reason: 'BookNLP is not downloaded.' }),
    run: async () => {
      const v = variantOf()
      if (!v) return []
      return findings.flatMap(({ conf, ...f }) => (conf[v] === null ? [] : [{ ...f, confidence: conf[v] }]))
    },
  }
}

let providers: ExtractionProvider[] = [createMockRules(), createImported(), createMockLocalModel(), createMockGliner(), createMockBookNlp()]
export const extractionProviders = (): ExtractionProvider[] => providers
export const extractionProvider = (id: ExtractionSourceId): ExtractionProvider | undefined => providers.find((p) => p.id === id)
/** The sources the narrator can start from the Story Bible, in the registry's order. */
export const runnableSources = (): ExtractionProvider[] => EXTRACTION_SOURCES.filter((s) => s.runs).flatMap((s) => extractionProvider(s.id) ?? [])
/** Swap a provider (a real one, or a test double). */
export function setExtractionProvider(p: ExtractionProvider): void {
  providers = providers.some((x) => x.id === p.id) ? providers.map((x) => (x.id === p.id ? p : x)) : [...providers, p]
}
