import { apiErrorMessage } from '../../api/errorMessage';
import { USER_DICTIONARY_SOURCE, type PronunciationSourcesApi, type UserDictionaryWord } from '../../api/contracts/pronunciationSources';
import type { Journal, Result } from '../journal/createJournal';

/** The host calls that change the user dictionary. No other UI file calls them (`pronunciationSingleStore.test.ts`). */
export type UserDictionaryApi = Pick<PronunciationSourcesApi, 'userDictionarySave' | 'userDictionaryRemove'>;

/**
 * The journal key of every user-dictionary change: the whole dictionary, not one word, since the host folds a word's spelling (case,
 * width, accents) in ways a key made here would not, and two keys for one word would let their undos run out of order (QA #2595).
 */
const DOMAIN = 'userDictionary';

const listeners = new Set<() => void>();

/** Calls `listener` after the user dictionary changes or a change is undone, so a page showing dictionary candidates reads them again. */
export function subscribeUserDictionaryChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const announced = async <R>(call: () => Promise<R>): Promise<Result<R>> => {
  try {
    const value = await call();
    listeners.forEach((listener) => listener());
    return { ok: true, value };
  } catch (error) {
    return { ok: false, refusal: { code: 'host-refused', reason: apiErrorMessage(error) } };
  }
};

/**
 * Saves how the narrator says a word that no dictionary has, in their own dictionary (#2595): a dictionary layer of the project, never the
 * Story Bible. One journal entry; Undo removes the record.
 */
export const saveToMyDictionary = (journal: Pick<Journal, 'act'>, api: UserDictionaryApi, word: string, say: string) =>
  journal.act<UserDictionaryWord>({
    label: 'Saved to my dictionary',
    touches: [DOMAIN],
    run: () => announced(() => api.userDictionarySave(word, say.trim())),
    undo: () => announced(() => api.userDictionaryRemove(word, USER_DICTIONARY_SOURCE, say.trim())),
  });

/** Removes the narrator's own record of a word (a value they saved, never one the Script import kept). Undo saves it back. */
export const removeFromMyDictionary = (journal: Pick<Journal, 'act'>, api: UserDictionaryApi, word: string, say: string) =>
  journal.act<UserDictionaryWord>({
    label: 'Removed from my dictionary',
    touches: [DOMAIN],
    run: () => announced(() => api.userDictionaryRemove(word, USER_DICTIONARY_SOURCE, say)),
    undo: () => announced(() => api.userDictionarySave(word, say)),
  });
