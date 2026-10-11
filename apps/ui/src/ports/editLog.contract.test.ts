import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createMockApi } from '../api/mockApi';
import type { EditCutRequest } from '../api/contracts/editCuts';
import { editCutsChangeSchema, editCutsSchema } from '../api/schemas/editCuts';
import { acceptedWordsChangeSchema, acceptedWordsSchema } from '../api/schemas/editLog';
import type { WordFxRequest } from '../api/contracts/wordFx';
import { wordFxChangeSchema, wordFxListSchema } from '../api/schemas/wordFx';
import { parseWire } from '../api/wire/parseWire';
import { acceptedKeys, createHostEditLog, cutKeys, type EditLogHostApi, type EditLogPort, wordFxByKey } from './editLog';
import { type ContractCase, describeProviderContract, type Goldens } from './providerContract';

// One suite over both adapters: the mock over its own manuscript, and the host adapter fed by the goldens the Go host wrote
// (apps/desktop/bindings_editlog_contract_test.go). The stand-in host below knows the goldens' manuscript and refuses with the
// host's own sentences what the real host refuses; the cases ask each adapter for a word it has, so the answers compare.

const GOLDEN_DIR = fileURLToPath(new URL('../../../../tests/fixtures/contracts/', import.meta.url));
const GOLDEN_FILES = [
  'edit-accepted-list-empty.json',
  'edit-accepted-list.json',
  'edit-accepted-accept.json',
  'edit-accepted-unaccept.json',
  'edit-cuts-list.json',
  'edit-cuts-record.json',
  'edit-cuts-remove.json',
  'edit-wordfx-list.json',
  'edit-wordfx-record.json',
  'edit-wordfx-remove.json',
] as const;
const goldens: Goldens = Object.fromEntries(GOLDEN_FILES.map((file) => [file, JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'))]));

const list = (file: string) => parseWire(acceptedWordsSchema, goldens[file], { boundary: 'editLog contract', payload: file });
const change = (file: string) => parseWire(acceptedWordsChangeSchema, goldens[file], { boundary: 'editLog contract', payload: file });
const cutsList = (file: string) => parseWire(editCutsSchema, goldens[file], { boundary: 'editLog contract', payload: file });
const cutsChange = (file: string) => parseWire(editCutsChangeSchema, goldens[file], { boundary: 'editLog contract', payload: file });
const fxList = (file: string) => parseWire(wordFxListSchema, goldens[file], { boundary: 'editLog contract', payload: file });
const fxChange = (file: string) => parseWire(wordFxChangeSchema, goldens[file], { boundary: 'editLog contract', payload: file });

/** The goldens' manuscript: chapter c-0001, and how many words each of its lines has. */
const HOST_CHAPTER = 'c-0001';
const HOST_LINES: Record<string, number> = { 'p-000001': 7, 'p-000002': 4 };

function checkKeys(chapterId: string, keys: string[]): void {
  if (keys.length === 0) throw new Error('choose a word first');
  for (const key of keys) {
    const cut = key.lastIndexOf(':');
    if (cut <= 0 || !/^(0|[1-9]\d*)$/.test(key.slice(cut + 1))) throw new Error('that is not a word of the script');
  }
  if (chapterId !== HOST_CHAPTER) throw new Error('that chapter is not in the manuscript');
  for (const key of keys) {
    const cut = key.lastIndexOf(':');
    const words = HOST_LINES[key.slice(0, cut)];
    if (words === undefined) throw new Error('that word is not in this chapter');
    if (Number(key.slice(cut + 1)) >= words) throw new Error('that word is past the end of its line');
  }
}

/** The host's refusals of a cut, in its order (apps/desktop/internal/editlog/cuts.go). */
function checkCut(chapterId: string, cut: EditCutRequest): void {
  if (typeof (cut as { undoSteps?: unknown }).undoSteps !== 'number' || !cut.guid.trim() || !cut.daw.trim())
    throw new Error('a cut is recorded only after the DAW made it: its result is missing');
  if (cut.mode !== 'close' && cut.mode !== 'gap') throw new Error('a cut either closes the gap or leaves it');
  if (![0, 6, 12, 25].includes(cut.fadeMs)) throw new Error('that crossfade is not one of the choices');
  if (!(cut.a >= 0) || !(cut.b >= 0)) throw new Error("a cut's times must be seconds from the start of the recording");
  if (cut.b <= cut.a) throw new Error('a cut must end after it starts');
  checkKeys(chapterId, cut.keys);
  if (cut.keys.some((key) => key.slice(0, key.lastIndexOf(':')) !== cut.pid)) throw new Error("a cut's words must all be in its paragraph");
}

/** The host's refusals of a word effect, in its order (apps/desktop/internal/editlog/wordfx.go). */
function checkWordFx(chapterId: string, fx: WordFxRequest): void {
  if (!fx.guid.trim() || !fx.daw.trim()) throw new Error('an effect is recorded only after the DAW added it: its result is missing');
  const listName = (name: string) =>
    name.trim() !== '' && !/[\\:\p{Cc}]/u.test(name) && name.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
  if (!listName(fx.chainId) || !listName(fx.chainName)) throw new Error('that is not the name of an effect chain the DAW lists, so nothing was saved');
  if (!fx.source.trim()) throw new Error('an effect must name the list it came from');
  if (!(fx.a >= 0) || !(fx.b >= 0)) throw new Error("an effect's times must be seconds from the start of the recording");
  if (fx.b <= fx.a) throw new Error('an effect must end after it starts');
  checkKeys(chapterId, fx.keys);
  if (fx.keys.some((key) => key.slice(0, key.lastIndexOf(':')) !== fx.pid))
    throw new Error('these words sit in more than one take: an effect needs words from one take');
}

const reject = (error: unknown) => Promise.reject(error instanceof Error ? error : new Error(String(error)));

const hostApi = (): EditLogHostApi => ({
  editingCutsList: (chapterId) => Promise.resolve(chapterId === HOST_CHAPTER ? cutsList('edit-cuts-list.json') : { chapterId, cuts: [] }),
  editingCutRecord: (chapterId, cut) => {
    try {
      checkCut(chapterId, cut);
    } catch (error) {
      return reject(error);
    }
    return Promise.resolve(cutsChange('edit-cuts-record.json'));
  },
  editingCutRemove: () => Promise.resolve(cutsChange('edit-cuts-remove.json')),
  editingWordFxList: (chapterId) => Promise.resolve(chapterId === HOST_CHAPTER ? fxList('edit-wordfx-list.json') : { chapterId, effects: [] }),
  editingWordFxRecord: (chapterId, fx) => {
    try {
      checkWordFx(chapterId, fx);
    } catch (error) {
      return reject(error);
    }
    return Promise.resolve(fxChange('edit-wordfx-record.json'));
  },
  editingWordFxRemove: () => Promise.resolve(fxChange('edit-wordfx-remove.json')),
  editingAcceptedList: (chapterId) => Promise.resolve(chapterId === HOST_CHAPTER ? list('edit-accepted-list.json') : { chapterId, words: [] }),
  editingAccept: (chapterId, keys) => {
    try {
      checkKeys(chapterId, keys);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return Promise.resolve(change('edit-accepted-accept.json'));
  },
  editingUnaccept: () => Promise.resolve(change('edit-accepted-unaccept.json')),
});

// The mock port is built over one mock API, and the cases need its manuscript's ids, so the mock factory shares that API.
let mockApi = createMockApi();
const mockPort = (): EditLogPort => {
  mockApi = createMockApi();
  return createHostEditLog(mockApi);
};
/** A chapter and a word each adapter has: the goldens' "the" for the host, the mock manuscript's first word for the mock. */
async function wordOf(adapter: 'mock' | 'host'): Promise<{ chapterId: string; key: string; paragraph: string }> {
  if (adapter === 'host') return { chapterId: HOST_CHAPTER, key: 'p-000001:4', paragraph: 'p-000001' };
  const [chapter] = await mockApi.manuscriptChapters();
  const [line] = await mockApi.manuscriptParagraphs(chapter?.id ?? '');
  return { chapterId: chapter?.id ?? '', key: `${line?.id ?? ''}:0`, paragraph: line?.id ?? '' };
}

/** A cut of a line's first word, as the app sends it after the DAW accepted it. */
const cutOf = (paragraph: string): EditCutRequest => ({
  pid: paragraph,
  keys: [`${paragraph}:0`],
  text: 'the word',
  a: 12,
  b: 13,
  off0: 0,
  off1: 1,
  mode: 'close',
  fadeMs: 12,
  daw: 'reaper',
  guid: '{CUT}',
  undoSteps: 1,
});

/** An effect on a line's first word, as the app sends it after the DAW accepted applyFxToRange. */
const fxOf = (paragraph: string): WordFxRequest => ({
  pid: paragraph,
  keys: [`${paragraph}:0`],
  text: 'the word',
  a: 12,
  b: 13,
  off0: 0,
  off1: 1,
  chainId: 'Voice/Polish.RfxChain',
  chainName: 'Voice polish',
  source: 'Your REAPER FX chains',
  fadeMs: 8,
  daw: 'reaper',
  guid: '{FX}',
});

/** Records an effect with `change` applied to the request, on a word each adapter has. */
const recordFx =
  (change: Partial<WordFxRequest>) =>
  async (port: EditLogPort, { adapter }: { adapter: 'mock' | 'host' }) => {
    const { chapterId, paragraph } = await wordOf(adapter);
    return port.editingWordFxRecord(chapterId, { ...fxOf(paragraph), ...change });
  };

const cases: ReadonlyArray<ContractCase<EditLogPort>> = [
  {
    name: 'answers-are-the-wire-shape',
    check: async (port, { adapter }) => {
      const { chapterId, key } = await wordOf(adapter);
      acceptedWordsSchema.parse(await port.editingAcceptedList(chapterId));
      acceptedWordsChangeSchema.parse(await port.editingAccept(chapterId, [key]));
      acceptedWordsChangeSchema.parse(await port.editingUnaccept(chapterId, [key]));
    },
  },
  {
    name: 'a-known-word-is-accepted-alike',
    observe: async (port, { adapter }) => {
      const { chapterId, key } = await wordOf(adapter);
      const answer = await port.editingAccept(chapterId, [key]);
      return { changed: answer.changed.includes(key), listed: answer.words.some((word) => word.key === key && !word.stale) };
    },
  },
  { name: 'an-unknown-chapter-is-refused-alike', observe: async (port, { adapter }) => port.editingAccept('no-such-chapter', [(await wordOf(adapter)).key]) },
  {
    name: 'a-word-in-another-chapter-is-refused-alike',
    observe: async (port, { adapter }) => port.editingAccept((await wordOf(adapter)).chapterId, ['no-such-line:0']),
  },
  {
    name: 'an-ordinal-past-the-line-is-refused-alike',
    observe: async (port, { adapter }) => {
      const { chapterId, paragraph } = await wordOf(adapter);
      return port.editingAccept(chapterId, [`${paragraph}:9999`]);
    },
  },
  {
    name: 'a-path-shaped-key-is-refused-alike',
    observe: async (port, { adapter }) => port.editingAccept((await wordOf(adapter)).chapterId, ['../../etc/passwd:0']),
  },
  { name: 'a-negative-ordinal-is-refused-alike', observe: async (port, { adapter }) => port.editingAccept((await wordOf(adapter)).chapterId, ['p-000001:-1']) },
  {
    name: 'cut-answers-are-the-wire-shape',
    check: async (port, { adapter }) => {
      const { chapterId, paragraph } = await wordOf(adapter);
      editCutsSchema.parse(await port.editingCutsList(chapterId));
      const recorded = editCutsChangeSchema.parse(await port.editingCutRecord(chapterId, cutOf(paragraph)));
      editCutsChangeSchema.parse(await port.editingCutRemove(chapterId, recorded.changed[0] ?? ''));
    },
  },
  {
    name: 'a-cut-the-daw-made-is-recorded-alike',
    observe: async (port, { adapter }) => {
      const { chapterId, paragraph } = await wordOf(adapter);
      const answer = await port.editingCutRecord(chapterId, cutOf(paragraph));
      return { changed: answer.changed.length, listed: answer.cuts.some((cut) => cut.id === answer.changed[0] && !cut.stale && cut.a === 12) };
    },
  },
  {
    name: 'a-cut-without-a-daw-result-is-refused-alike',
    observe: async (port, { adapter }) => {
      const { chapterId, paragraph } = await wordOf(adapter);
      return port.editingCutRecord(chapterId, { ...cutOf(paragraph), guid: '' });
    },
  },
  {
    name: 'a-cut-that-ends-before-it-starts-is-refused-alike',
    observe: async (port, { adapter }) => {
      const { chapterId, paragraph } = await wordOf(adapter);
      return port.editingCutRecord(chapterId, { ...cutOf(paragraph), b: 11 });
    },
  },
  {
    name: 'a-cut-fade-off-the-choices-is-refused-alike',
    observe: async (port, { adapter }) => {
      const { chapterId, paragraph } = await wordOf(adapter);
      return port.editingCutRecord(chapterId, { ...cutOf(paragraph), fadeMs: 13 });
    },
  },
  {
    name: 'a-cut-of-a-path-shaped-key-is-refused-alike',
    observe: async (port, { adapter }) => {
      const { chapterId, paragraph } = await wordOf(adapter);
      return port.editingCutRecord(chapterId, { ...cutOf(paragraph), keys: [`${paragraph}:0`, '../../etc/passwd:0'] });
    },
  },
  {
    name: 'a-cut-in-an-unknown-chapter-is-refused-alike',
    observe: async (port, { adapter }) => port.editingCutRecord('no-such-chapter', cutOf((await wordOf(adapter)).paragraph)),
  },
  {
    name: 'word-fx-answers-are-the-wire-shape',
    check: async (port, { adapter }) => {
      const { chapterId, paragraph } = await wordOf(adapter);
      wordFxListSchema.parse(await port.editingWordFxList(chapterId));
      const recorded = wordFxChangeSchema.parse(await port.editingWordFxRecord(chapterId, fxOf(paragraph)));
      wordFxChangeSchema.parse(await port.editingWordFxRemove(chapterId, recorded.changed[0] ?? ''));
    },
  },
  {
    name: 'an-effect-the-daw-added-is-recorded-alike',
    observe: async (port, { adapter }) => {
      const { chapterId, paragraph } = await wordOf(adapter);
      const answer = await port.editingWordFxRecord(chapterId, fxOf(paragraph));
      const fx = answer.effects.find((effect) => effect.id === answer.changed[0]);
      return { changed: answer.changed.length, listed: !!fx && !fx.stale };
    },
  },
  { name: 'an-effect-without-a-daw-result-is-refused-alike', observe: recordFx({ guid: '' }) },
  { name: 'an-effect-that-ends-before-it-starts-is-refused-alike', observe: recordFx({ b: 11 }) },
  { name: 'an-effect-at-a-negative-time-is-refused-alike', observe: recordFx({ a: -1 }) },
  { name: 'a-chain-named-by-a-windows-path-is-refused-alike', observe: recordFx({ chainId: 'C:\\FXChains\\Polish.RfxChain' }) },
  { name: 'a-chain-named-by-an-absolute-path-is-refused-alike', observe: recordFx({ chainId: '/etc/passwd' }) },
  { name: 'a-chain-name-that-climbs-out-is-refused-alike', observe: recordFx({ chainName: '../Polish.RfxChain' }) },
  {
    name: 'an-effect-on-words-in-two-takes-is-refused-alike',
    observe: async (port, { adapter }) => {
      const { chapterId, paragraph } = await wordOf(adapter);
      return port.editingWordFxRecord(chapterId, { ...fxOf(paragraph), keys: [`${paragraph}:0`, 'p-other:0'] });
    },
  },
  {
    name: 'an-effect-in-an-unknown-chapter-is-refused-alike',
    observe: async (port, { adapter }) => port.editingWordFxRecord('no-such-chapter', fxOf((await wordOf(adapter)).paragraph)),
  },
  { name: 'no-key-is-refused-alike', observe: async (port, { adapter }) => port.editingAccept((await wordOf(adapter)).chapterId, []) },
];

describeProviderContract<EditLogPort>('editLog', { mock: mockPort, host: () => createHostEditLog(hostApi()) }, cases, { goldens });

describe('acceptedKeys', () => {
  it('word-text-travels-with-the-key-and-stale-is-reported: a stale word does not hide its flag', () => {
    const golden = list('edit-accepted-list.json');
    expect([...acceptedKeys(golden.words)]).toEqual(['p-000001:4', 'p-000001:5']);
    expect(acceptedKeys(golden.words).has('p-000002:1')).toBe(false);
  });
});

describe('cutKeys', () => {
  it('stale-cut-is-reported-not-moved: a stale cut strikes no word', () => {
    const golden = cutsList('edit-cuts-list.json');
    expect([...cutKeys(golden.cuts)]).toEqual(['p-000001:4', 'p-000001:5', 'p-000001:6']);
  });
});

describe('wordFxByKey', () => {
  it('stale-effect-is-reported-not-moved: a stale effect underlines no word, and a word under two takes the first', () => {
    const golden = fxList('edit-wordfx-list.json');
    const byKey = wordFxByKey(golden.effects);
    expect([...byKey.keys()].sort()).toEqual(['p-000001:4', 'p-000001:5', 'p-000001:6']);
    expect(byKey.get('p-000001:6')?.id).toBe('fx2');
  });
});
