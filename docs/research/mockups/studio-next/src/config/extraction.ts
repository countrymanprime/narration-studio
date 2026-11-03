/**
 * Story Bible extraction: the one place the review threshold lives, and the registry of where a suggestion can come from.
 */

/** A suggestion with no confidence, or one under this, must be verified by the narrator. At or above it is accepted automatically (and stays reviewable). */
export const VERIFY_BELOW = 0.75

/** Where a suggestion came from. Data, so a new provider is one more row. `runs`: the app can start it from the Story Bible. */
export const EXTRACTION_SOURCES = [
  { id: 'rules', label: 'Rules', icon: 'auto', runs: true },
  { id: 'imported', label: 'Imported file', icon: 'import', runs: false },
  { id: 'local-model', label: 'Local model', icon: 'globe', runs: true },
  { id: 'gliner', label: 'GLiNER', icon: 'locate', runs: true },
  { id: 'booknlp', label: 'BookNLP', icon: 'dictionary', runs: true },
] as const
export type ExtractionSourceId = (typeof EXTRACTION_SOURCES)[number]['id']
export const EXTRACTION_SOURCE_IDS = EXTRACTION_SOURCES.map((s) => s.id) as [ExtractionSourceId, ...ExtractionSourceId[]]
export const sourceIcon = (id: string): string => EXTRACTION_SOURCES.find((s) => s.id === id)?.icon ?? 'list'
export const sourceLabel = (id: string): string => EXTRACTION_SOURCES.find((s) => s.id === id)?.label ?? id

/** The reasons a suggestion needs verification, as stored on it. */
export const REASONS = {
  noConfidence: 'No confidence was given.',
  lowConfidence: 'Confidence is under the threshold.',
  quoteNotFound: 'quote not found',
  noEvidence: 'No evidence quote.',
  unknownEntry: 'The entry is not in the Story Bible.',
} as const
