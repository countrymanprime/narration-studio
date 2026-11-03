import { apiErrorMessage } from '../../api/errorMessage';
import { USER_DICTIONARY_SOURCE, type PronunciationSourcesApi, type UserDictionaryWord } from '../../api/contracts/pronunciationSources';
import type { Journal, Result } from '../journal/createJournal';

/** The host calls that change the user dictionary. No other UI file calls them (`pronunciationSingleStore.test.ts`). */
export type UserDictionaryApi = Pick<PronunciationSourcesApi, 'userDictionarySave' | 'userDictionaryRemove'>;

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
 * Story Bible. One journal entry; Undo removes the record, or puts back the one it replaced. `prior` is the narrator's earlier record of it.
 */
export const saveToMyDictionary = (journal: Pick<Journal, 'act'>, api: UserDictionaryApi, word: string, say: string, prior?: string) =>
  journal.act<UserDictionaryWord>({
    label: 'Saved to my dictionary',
    touches: [`userDictionary/${word.trim().toLowerCase()}`],
    run: () => announced(() => api.userDictionarySave(word, say.trim())),
    undo: () =>
      prior ? announced(() => api.userDictionarySave(word, prior)) : announced(() => api.userDictionaryRemove(word, USER_DICTIONARY_SOURCE, say.trim())),
  });
