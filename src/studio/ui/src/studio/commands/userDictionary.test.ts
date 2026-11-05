// @vitest-environment node
// #2595: a word no dictionary has is saved to the narrator's own dictionary, a dictionary layer of the project, never the Story Bible.
import { describe, expect, it, vi } from 'vitest';
import { createJournal } from '../journal/createJournal';
import { removeFromMyDictionary, saveToMyDictionary, subscribeUserDictionaryChanged, type UserDictionaryApi } from './userDictionary';

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

  it('every change has the one journal key of the dictionary, so "Café" and "CAFÉ" order their undos as the host folds them (QA)', async () => {
    const j = journal();
    await saveToMyDictionary(j, fakeApi(), 'Café', 'ka-FAY');
    await removeFromMyDictionary(j, fakeApi(), 'CAFE\u0301', 'ka-FAY');
    expect((await j.entries()).map((row) => row.touches)).toEqual([['userDictionary'], ['userDictionary']]);
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

  it("removing the narrator's own record is one entry; Undo saves it back", async () => {
    const api = fakeApi();
    const j = journal();
    expect((await removeFromMyDictionary(j, api, 'zarvex', 'ZAR-vex')).ok).toBe(true);
    expect(api.userDictionaryRemove).toHaveBeenCalledWith('zarvex', 'user_dictionary', 'ZAR-vex');
    expect((await j.entries()).map((row) => row.label)).toEqual(['Removed from my dictionary']);
    await j.undoLast();
    expect(api.userDictionarySave).toHaveBeenLastCalledWith('zarvex', 'ZAR-vex');
  });
});
