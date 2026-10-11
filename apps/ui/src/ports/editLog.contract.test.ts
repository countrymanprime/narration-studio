import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createMockApi } from '../api/mockApi';
import type { EditCutRequest } from '../api/contracts/editCuts';
import { editCutsChangeSchema, editCutsSchema } from '../api/schemas/editCuts';
import { acceptedWordsChangeSchema, acceptedWordsSchema } from '../api/schemas/editLog';
import { parseWire } from '../api/wire/parseWire';
import { acceptedKeys, createHostEditLog, cutKeys, type EditLogHostApi, type EditLogPort } from './editLog';
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
] as const;
const goldens: Goldens = Object.fromEntries(GOLDEN_FILES.map((file) => [file, JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'))]));

const list = (file: string) => parseWire(acceptedWordsSchema, goldens[file], { boundary: 'editLog contract', payload: file });
const change = (file: string) => parseWire(acceptedWordsChangeSchema, goldens[file], { boundary: 'editLog contract', payload: file });
const cutsList = (file: string) => parseWire(editCutsSchema, goldens[file], { boundary: 'editLog contract', payload: file });
const cutsChange = (file: string) => parseWire(editCutsChangeSchema, goldens[file], { boundary: 'editLog contract', payload: file });

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
