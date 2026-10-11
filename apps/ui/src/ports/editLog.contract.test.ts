import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createMockApi } from '../api/mockApi';
import { acceptedWordsChangeSchema, acceptedWordsSchema } from '../api/schemas/editLog';
import { parseWire } from '../api/wire/parseWire';
import { acceptedKeys, createHostEditLog, type EditLogHostApi, type EditLogPort } from './editLog';
import { type ContractCase, describeProviderContract, type Goldens } from './providerContract';

// One suite over both adapters: the mock over its own manuscript, and the host adapter fed by the goldens the Go host wrote
// (apps/desktop/bindings_editlog_contract_test.go). The stand-in host below knows the goldens' manuscript and refuses with the
// host's own sentences what the real host refuses; the cases ask each adapter for a word it has, so the answers compare.

const GOLDEN_DIR = fileURLToPath(new URL('../../../../tests/fixtures/contracts/', import.meta.url));
const GOLDEN_FILES = ['edit-accepted-list-empty.json', 'edit-accepted-list.json', 'edit-accepted-accept.json', 'edit-accepted-unaccept.json'] as const;
const goldens: Goldens = Object.fromEntries(GOLDEN_FILES.map((file) => [file, JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'))]));

const list = (file: string) => parseWire(acceptedWordsSchema, goldens[file], { boundary: 'editLog contract', payload: file });
const change = (file: string) => parseWire(acceptedWordsChangeSchema, goldens[file], { boundary: 'editLog contract', payload: file });

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

const hostApi = (): EditLogHostApi => ({
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
