/**
 * The narrator's pronunciation sources and one source's candidate for one word (Go: `apps/desktop/bindings_pronunciationsources.go`,
 * ADR 0792 decision 1, ADR 0405). The host lists the sources of the pronunciation port, the keyed online one when a key is saved and
 * the narrator's own entry; it reports no icon, so the UI maps a source id to one. Both calls take a word and a source id only.
 */

/** `lookup` answers from a dictionary entry for the word; `generated` guesses from its spelling; `manual` is the narrator's own. */
export type PronunciationSourceKind = 'generated' | 'lookup' | 'manual';

/** What a source needs before it can answer. */
export type PronunciationSourceNeeds = 'localDictionary' | 'network';

export interface PronunciationSource {
  /** The registry id (`cmu`, `wiktextract`, `espeak`), the online dictionary's id, or `manual`. */
  id: string;
  label: string;
  kind: PronunciationSourceKind;
  needs?: PronunciationSourceNeeds;
  /** False when the source cannot answer now; `reason` then says why in one sentence. */
  available: boolean;
  reason?: string;
}

export interface PronunciationSourceList {
  /** In the order they are offered: the registry's, the keyed online source when a key is saved, then `manual`. */
  sources: PronunciationSource[];
  /** The id taken first for a name with nothing yet: the narrator's setting when available, else the first available source. Never `manual`. */
  default: string;
}

/** What one source says for a word, or why it cannot say. A miss is a result, never a thrown error. */
export type PronunciationCandidate = { ok: true; say: string } | { ok: false; reason: string };

export interface PronunciationSourcesApi {
  pronunciationSources(): Promise<PronunciationSourceList>;
  /** Asks one source how it would say `word` and changes nothing. Only the online source sends anything, and only this one word. */
  pronunciationCandidate(word: string, source: string): Promise<PronunciationCandidate>;
}
