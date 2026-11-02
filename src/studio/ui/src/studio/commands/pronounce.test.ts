// @vitest-environment node
// Audit cluster 13 (#2595): a pronunciation has one home, the Story Bible entry's name. Script's Words card and the Story Bible's names grid
// both change it through these commands: one journal entry each, which Undo reverses by writing the earlier value back.
import { describe, expect, it, vi } from 'vitest';
import type { GuidePronunciation } from '../../api/contracts/storyBible';
import { createJournal } from '../journal/createJournal';
import { pronounceFromSource, pronounceOwn, pronounceUseAlternate, type PronounceApi } from './pronounce';

const journal = () => createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
const prior: GuidePronunciation = { ipa: '/ˈæl.ɪs/', source: 'cmu', confidence: 'medium', chosen: true };

function fakeApi(over: Partial<PronounceApi> = {}): PronounceApi {
  return {
    guidePronounceUser: vi.fn(async () => undefined),
    guidePronounce: vi.fn(async () => undefined),
    guidePronunciationUseAlternate: vi.fn(async () => undefined),
    guidePronunciationRestore: vi.fn(async () => undefined),
    ...over,
  };
}

describe('pronounce commands', () => {
  it('own: one entry that Undo reverses by restoring the earlier value of that name', async () => {
    const api = fakeApi();
    const j = journal();
    const done = await pronounceOwn(j, api, { entryId: 'e1', aliasIndex: 2, prior }, 'AL-iss');
    expect(done.ok).toBe(true);
    expect(api.guidePronounceUser).toHaveBeenCalledWith('e1', 'AL-iss', 2);
    expect((await j.entries()).map((row) => row.label)).toEqual(['Changed a pronunciation']);
    await j.undoLast();
    expect(api.guidePronunciationRestore).toHaveBeenCalledWith('e1', prior, 2);
  });

  it('own on the entry name passes no alias index', async () => {
    const api = fakeApi();
    await pronounceOwn(journal(), api, { entryId: 'e1', prior }, 'AL-iss');
    expect(api.guidePronounceUser).toHaveBeenCalledWith('e1', 'AL-iss');
  });

  it('from a source names it in the label and undoes to the earlier value', async () => {
    const api = fakeApi();
    const j = journal();
    await pronounceFromSource(j, api, { entryId: 'e1', prior }, { id: 'espeak', label: 'eSpeak NG' });
    expect(api.guidePronounce).toHaveBeenCalledWith('e1', 'espeak');
    expect((await j.entries())[0].label).toBe('Pronunciation from eSpeak NG');
    await j.undoLast();
    expect(api.guidePronunciationRestore).toHaveBeenCalledWith('e1', prior);
  });

  it('use alternate undoes to the earlier value', async () => {
    const api = fakeApi();
    const j = journal();
    await pronounceUseAlternate(j, api, { entryId: 'e1', prior });
    expect(api.guidePronunciationUseAlternate).toHaveBeenCalledWith('e1');
    await j.undoLast();
    expect(api.guidePronunciationRestore).toHaveBeenCalledWith('e1', prior);
  });

  it('a refusal is the host sentence and journals nothing', async () => {
    const api = fakeApi({ guidePronounceUser: vi.fn(async () => Promise.reject(new Error('This entity is locked.'))) });
    const j = journal();
    const done = await pronounceOwn(j, api, { entryId: 'e1', prior }, 'x');
    expect(!done.ok && done.refusal.reason).toContain('This entity is locked.');
    expect(await j.entries()).toEqual([]);
  });

  it('two names of one entry do not block each other, one name twice does', async () => {
    const api = fakeApi();
    const j = journal();
    await pronounceOwn(j, api, { entryId: 'e1', prior }, 'a');
    await pronounceOwn(j, api, { entryId: 'e1', aliasIndex: 0, prior }, 'b');
    const rows = await j.entries();
    expect(rows[0].touches).toEqual(['storyBible/entries/e1/names/0']);
    expect(rows[1].touches).toEqual(['storyBible/entries/e1/names/own']);
  });
});
