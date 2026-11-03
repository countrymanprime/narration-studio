// @vitest-environment node
// #2595: a word no dictionary has is saved to the narrator's own dictionary, a dictionary layer of the project, never the Story Bible.
import { describe, expect, it, vi } from 'vitest';
import { createJournal } from '../journal/createJournal';
import { saveToMyDictionary, subscribeUserDictionaryChanged, type UserDictionaryApi } from './userDictionary';

const journal = () => createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
const fakeApi = (over: Partial<UserDictionaryApi> = {}): UserDictionaryApi => ({
  userDictionarySave: vi.fn(async (word: string, say: string) => ({ word, records: [{ say, source: 'user_dictionary', addedAt: '' }] })),
  userDictionaryRemove: vi.fn(async (word: string) => ({ word, records: [] })),
  ...over,
});

describe('saveToMyDictionary', () => {
  it('is one journal entry; Undo removes the record it made', async () => {
    const api = fakeApi();
    const j = journal();
    expect((await saveToMyDictionary(j, api, 'quorlen', ' KWOR-len ')).ok).toBe(true);
    expect(api.userDictionarySave).toHaveBeenCalledWith('quorlen', 'KWOR-len');
    expect((await j.entries()).map((row) => row.label)).toEqual(['Saved to my dictionary']);
    await j.undoLast();
    expect(api.userDictionaryRemove).toHaveBeenCalledWith('quorlen', 'user_dictionary', 'KWOR-len');
  });

  it('Undo of a replacement puts the earlier value back', async () => {
    const api = fakeApi();
    const j = journal();
    await saveToMyDictionary(j, api, 'quorlen', 'KWOR-len', 'KWAR-len');
    await j.undoLast();
    expect(api.userDictionarySave).toHaveBeenLastCalledWith('quorlen', 'KWAR-len');
  });

  it('a refusal is the host sentence, journals nothing and tells nobody', async () => {
    const heard = vi.fn();
    const off = subscribeUserDictionaryChanged(heard);
    const j = journal();
    const done = await saveToMyDictionary(j, fakeApi({ userDictionarySave: vi.fn(async () => Promise.reject(new Error('Too long.'))) }), 'x', 'y');
    expect(!done.ok && done.refusal.reason).toContain('Too long.');
    expect(await j.entries()).toEqual([]);
    expect(heard).not.toHaveBeenCalled();
    off();
  });
});
