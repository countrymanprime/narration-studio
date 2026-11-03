import type { GuidePreview } from './storyBible';
/**
 * The narrator's pronunciation sources and one source's candidate for one word (Go: `src/studio/desktop/bindings_pronunciationsources.go`,
 * docs/guides/using-the-app/story-bible.md#how-you-say-each-name). The host lists the sources of the pronunciation port, the keyed online one when a key is saved and
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

/** The project's user dictionary (#2595): words no dictionary has, saved by the narrator (`user_dictionary`, "My dictionary"), and the
 * Script page's old flagged words moved in once when the project opened (`script_imported`, "Script (imported)"). Never the Story Bible. */
export const USER_DICTIONARY_SOURCE = 'user_dictionary';
export const SCRIPT_IMPORTED_SOURCE = 'script_imported';
export type UserDictionaryRecord = { say: string; source: string; addedAt: string };
export type UserDictionaryWord = { word: string; records: UserDictionaryRecord[] };
export type UserDictionary = { words: UserDictionaryWord[] };

/** One source's answer for a word, with the source it came from. */
export type PronunciationCandidateRow = { sourceId: string; label: string; say: string };
/** A source that has nothing for the word, and why. */
export type PronunciationCandidateMiss = { sourceId: string; label: string; reason: string };
/** What every local source and the user dictionary say for one word, in the order the sources are offered. The online source is never
 * asked here: only by the narrator's own pick of it (D72). */
export type PronunciationCandidates = { candidates: PronunciationCandidateRow[]; misses: PronunciationCandidateMiss[] };

export interface PronunciationSourcesApi {
  pronunciationSources(): Promise<PronunciationSourceList>;
  /** Asks one source how it would say `word` and changes nothing. Only the online source sends anything, and only this one word. */
  pronunciationCandidate(word: string, source: string): Promise<PronunciationCandidate>;
  /** Every local source's candidate for a word and the user dictionary's records for it; a miss is a row, never a throw. */
  pronunciationCandidates(word: string): Promise<PronunciationCandidates>;
  /** The preview voice saying `ipa` for `text`, before the narrator picks it; the Story Bible's preview shape. */
  pronunciationPreview(text: string, ipa: string): Promise<GuidePreview>;
  userDictionaryList(): Promise<UserDictionary>;
  /** Saves how the narrator says a word in their dictionary (their own record replaces their earlier one). Answers the word. */
  userDictionarySave(word: string, say: string): Promise<UserDictionaryWord>;
  /** Removes one record; the word goes with its last. Answers the word, its records possibly empty. */
  userDictionaryRemove(word: string, source: string, say: string): Promise<UserDictionaryWord>;
}
