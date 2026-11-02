// @vitest-environment node
// Audit cluster 13 (#2595): a pronunciation has one home, the Story Bible entry's name. Script's Words card and the Story Bible's names grid
// both change it through these commands: one journal entry each, which Undo reverses by writing the earlier value back.
import { describe, expect, it, vi } from 'vitest';
import type { GuidePronunciation } from '../../api/contracts/storyBible';
import { createJournal } from '../journal/createJournal';
import { pronounceFromSource, pronounceOwn, pronounceUseAlternate, subscribePronunciationChanged, type PronounceApi } from './pronounce';

const journal = () => createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
const prior: GuidePronunciation = { ipa: '/ˈæl.ɪs/', source: 'cmu', confidence: 'medium', chosen: true };
/** What the host lists now: entry e1 "Alice", with aliases "Al", "Allie" and "Ally". */
const listed = (aliases = ['Al', 'Allie', 'Ally'], id = 'e1') => [
  { id, canonical_name: 'Alice', aliases: aliases.map((text) => ({ text, pronunciation: prior, occurrences: [] })), pronunciation: prior },
];

function fakeApi(over: Partial<PronounceApi> = {}): PronounceApi {
  return {
    guidePronounceUser: vi.fn(async () => undefined),
    guidePronounce: vi.fn(async () => undefined),
    guidePronunciationUseAlternate: vi.fn(async () => undefined),
    guidePronunciationRestore: vi.fn(async () => undefined),
    guideEntities: vi.fn(async () => listed() as never),
    ...over,
  };
}

describe('pronounce commands', () => {
  it('own: one entry that Undo reverses by restoring the earlier value of that name', async () => {
    const api = fakeApi();
    const j = journal();
    const done = await pronounceOwn(j, api, { entryId: 'e1', aliasIndex: 2, name: 'Ally', prior }, 'AL-iss');
    expect(done.ok).toBe(true);
    expect(api.guidePronounceUser).toHaveBeenCalledWith('e1', 'AL-iss', 2);
    expect((await j.entries()).map((row) => row.label)).toEqual(['Changed a pronunciation']);
    await j.undoLast();
    expect(api.guidePronunciationRestore).toHaveBeenCalledWith('e1', prior, 2);
  });

  it('own on the entry name passes no alias index', async () => {
    const api = fakeApi();
    await pronounceOwn(journal(), api, { entryId: 'e1', name: 'Alice', prior }, 'AL-iss');
    expect(api.guidePronounceUser).toHaveBeenCalledWith('e1', 'AL-iss');
  });

  it('from a source names it in the label and undoes to the earlier value', async () => {
    const api = fakeApi();
    const j = journal();
    await pronounceFromSource(j, api, { entryId: 'e1', name: 'Alice', prior }, { id: 'espeak', label: 'eSpeak NG' });
    expect(api.guidePronounce).toHaveBeenCalledWith('e1', 'espeak');
    expect((await j.entries())[0].label).toBe('Pronunciation from eSpeak NG');
    await j.undoLast();
    expect(api.guidePronunciationRestore).toHaveBeenCalledWith('e1', prior);
  });

  it('use alternate undoes to the earlier value', async () => {
    const api = fakeApi();
    const j = journal();
    await pronounceUseAlternate(j, api, { entryId: 'e1', name: 'Alice', prior });
    expect(api.guidePronunciationUseAlternate).toHaveBeenCalledWith('e1');
    await j.undoLast();
    expect(api.guidePronunciationRestore).toHaveBeenCalledWith('e1', prior);
  });

  it('a refusal is the host sentence and journals nothing', async () => {
    const api = fakeApi({ guidePronounceUser: vi.fn(async () => Promise.reject(new Error('This entity is locked.'))) });
    const j = journal();
    const done = await pronounceOwn(j, api, { entryId: 'e1', name: 'Alice', prior }, 'x');
    expect(!done.ok && done.refusal.reason).toContain('This entity is locked.');
    expect(await j.entries()).toEqual([]);
  });

  it('two names of one entry do not block each other, one name twice does', async () => {
    const api = fakeApi();
    const j = journal();
    await pronounceOwn(j, api, { entryId: 'e1', name: 'Alice', prior }, 'a');
    await pronounceOwn(j, api, { entryId: 'e1', aliasIndex: 0, name: 'Al', prior }, 'b');
    const rows = await j.entries();
    expect(rows[0].touches).toEqual(['storyBible/entities/e1/names/0']);
    expect(rows[1].touches).toEqual(['storyBible/entities/e1/names/own']);
  });

  it('tells every page that shows names after a change and after its undo, never after a refusal', async () => {
    const heard = vi.fn();
    const off = subscribePronunciationChanged(heard);
    const j = journal();
    await pronounceOwn(j, fakeApi(), { entryId: 'e1', name: 'Alice', prior }, 'a');
    expect(heard).toHaveBeenCalledTimes(1);
    await j.undoLast();
    expect(heard).toHaveBeenCalledTimes(2);
    await pronounceOwn(j, fakeApi({ guidePronounceUser: vi.fn(async () => Promise.reject(new Error('No.'))) }), { entryId: 'e1', name: 'Alice', prior }, 'b');
    expect(heard).toHaveBeenCalledTimes(2);
    off();
    await pronounceOwn(j, fakeApi(), { entryId: 'e1', name: 'Alice', prior }, 'c');
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('Undo refuses, and writes nothing, when the entry is gone or the alias at that place is another name now', async () => {
    const restore = vi.fn(async () => undefined);
    for (const [now, reason] of [
      [listed(['Allie', 'Ally']), 'That name is no longer in the Story Bible.'],
      [[], 'That name is no longer in the Story Bible.'],
    ] as const) {
      const j = journal();
      await pronounceOwn(
        j,
        fakeApi({ guidePronunciationRestore: restore, guideEntities: vi.fn(async () => now as never) }),
        { entryId: 'e1', aliasIndex: 2, name: 'Ally', prior },
        'x',
      );
      const undone = await j.undoLast();
      expect(!undone.ok && undone.refusal.reason).toBe(reason);
    }
    expect(restore).not.toHaveBeenCalled();
  });

  it("its journal keys are the Story Bible page's own (`storyBible/entities/<id>`), so an edit there and a pronunciation here order their undos", async () => {
    const j = journal();
    await pronounceOwn(j, fakeApi(), { entryId: 'e1', name: 'Alice', prior }, 'a');
    expect((await j.entries())[0]!.touches.every((key) => key.startsWith('storyBible/entities/e1'))).toBe(true);
  });
});
