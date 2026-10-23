import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { workspaceAlignmentResultSchema } from '../api/schemas/workspace';
import { workspaceSnapResultSchema } from '../api/schemas/workspaceSnap';
import { parseWire } from '../api/wire/parseWire';
import { createHostAlignment, createMockAlignment, type AlignmentHostApi, type AlignmentPort, type HeardWord } from './alignment';
import { describeProviderContract, type Goldens } from './providerContract';

const GOLDEN_DIR = fileURLToPath(new URL('../../../../tests/fixtures/contracts/', import.meta.url));
// The chapter id each golden answers for, in the host adapter fed by the goldens.
const CHAPTERS = {
  'c-current': 'workspace-alignment-current.json',
  'c-stale': 'workspace-alignment-stale.json',
  'c-added': 'workspace-alignment-added-words.json',
  'c-never': 'workspace-alignment-never.json',
  'c-align-again': 'workspace-alignment-needs-align-again.json',
} as const;
const UNTRANSCRIBED = ['c-never', 'c-align-again'];
const SNAPS = ['workspace-snap-moved.json', 'workspace-snap-refused.json'];
const goldens: Goldens = Object.fromEntries(
  [...Object.values(CHAPTERS), ...SNAPS].map((file) => [file, JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'))]),
);
// The host adapter's snap answers the golden whose item and time were asked, and the moved golden moved to any other
// time by the same offset: what the host sent, for the times the contract asks about.
const snapGolden = (file: string) => parseWire(workspaceSnapResultSchema, goldens[file], { boundary: 'alignment contract', payload: file });

const hostApi = (calls: string[] = []): AlignmentHostApi => ({
  workspaceAlignment: (chapterId) => {
    calls.push(chapterId);
    const file = CHAPTERS[chapterId as keyof typeof CHAPTERS] ?? 'workspace-alignment-never.json';
    return Promise.resolve(parseWire(workspaceAlignmentResultSchema, goldens[file], { boundary: 'alignment contract', payload: file }));
  },
  workspaceSnap: (chapterId, itemGuid, sourceTime) => {
    calls.push(`snap ${chapterId} ${itemGuid} ${sourceTime}`);
    const refused = snapGolden('workspace-snap-refused.json');
    if (itemGuid === refused.itemGuid) return Promise.resolve({ ...refused, chapterId, sourceTime, time: sourceTime });
    const moved = snapGolden('workspace-snap-moved.json');
    return Promise.resolve({ ...moved, chapterId, itemGuid, sourceTime, time: sourceTime + moved.moved });
  },
});

const wordsOf = async (port: AlignmentPort, chapterId: string): Promise<HeardWord[]> => {
  const answer = await port.heard(chapterId);
  if (!answer.heard) throw new Error(`${chapterId} answered null: ${answer.reason}`);
  return answer.heard.words;
};

const cases = [
  {
    name: 'port-heard-is-null-until-transcribed',
    observe: async (port: AlignmentPort) =>
      Promise.all(
        UNTRANSCRIBED.map(async (id) => {
          const answer = await port.heard(id);
          return answer.heard === null && answer.reason.length > 0;
        }),
      ),
  },
  {
    name: 'port-heard-lists-words-in-reading-order: each word is timed, scored null with a reason, and starts after the one before it on its item',
    check: async (port: AlignmentPort) => {
      for (const id of ['c-current', 'c-added']) {
        const words = await wordsOf(port, id);
        expect(words.length).toBeGreaterThan(0);
        const last = new Map<number, number>();
        for (const word of words) {
          expect(word.off1).toBeGreaterThanOrEqual(word.off0);
          expect(word.off0).toBeGreaterThanOrEqual(last.get(word.item) ?? -Infinity);
          last.set(word.item, word.off0);
          expect(word.conf === null ? word.confReason : 'scored').toBeTruthy();
          if (word.added) expect(word.paragraphId).toBeUndefined();
          else expect([word.paragraphId, word.ordinal].every((v) => v !== undefined)).toBe(true);
        }
      }
    },
  },
  {
    name: 'port-snap-matches-the-mock: a cut moves at most 2 ms, the same way for the same time',
    check: async (port: AlignmentPort) => {
      for (const t of [0.5, 12.3456, 166.5, 200]) {
        const first = await port.snap('c-current', '{ITEM-1}', t);
        expect(first.snapped).toBe(true);
        expect(Math.abs(first.time - t)).toBeLessThanOrEqual(0.002 + 1e-9);
        expect(first.moved).toBeCloseTo(first.time - t, 12);
        expect(first.time).toBeGreaterThanOrEqual(0);
        expect(await port.snap('c-current', '{ITEM-1}', t)).toEqual(first);
      }
    },
  },
  {
    name: 'an-engine-names-who-heard',
    check: async (port: AlignmentPort) => {
      const answer = await port.heard('c-current');
      expect(answer.heard?.engine.name).toMatch(/\S/);
    },
  },
];

describeProviderContract<AlignmentPort>(
  'alignment',
  { mock: () => createMockAlignment({ untranscribed: UNTRANSCRIBED }), host: () => createHostAlignment(hostApi()) },
  cases,
  { goldens },
);

describe('the host adapter', () => {
  it('port-heard-is-null-until-transcribed: carries the reasons the host gave and never starts a run', async () => {
    const calls: string[] = [];
    const port = createHostAlignment(hostApi(calls));
    const never = await port.heard('c-never');
    expect(never).toMatchObject({ heard: null });
    expect(never.heard === null && never.reasons).toEqual([]);
    expect((await port.heard('c-align-again')).heard).toBeNull();
    // The only call it makes is the read; AlignmentHostApi has nothing else to call.
    expect(calls).toEqual(['c-never', 'c-align-again']);
  });

  it('port-heard-lists-words-in-reading-order: the misread is the word heard, extra runs sit where they were said', async () => {
    const words = await wordsOf(createHostAlignment(hostApi()), 'c-added');
    expect(words.map((word) => word.text)).toEqual(['chapter', 'one', 'Alice', 'was', 'begging', 'to', 'get', 'sorry', 'very', 'very', 'tired.', 'um']);
    expect(words[0]).toMatchObject({ added: true, timing: 'spread', item: 0, off0: 4, conf: null, confReason: 'no_word_scores' });
    expect(words[7]).toMatchObject({ added: true, timing: 'unplaced', off0: 6.3, off1: 6.3 });
    expect(words[4]).toMatchObject({ paragraphId: 'p-000001', ordinal: 2, item: 0, off0: 5.5, off1: 6 });
  });
});

describe('the host adapter snap', () => {
  it('port-snap-matches-the-mock: carries the host time and a refusal with the time unchanged', async () => {
    const calls: string[] = [];
    const port = createHostAlignment(hostApi(calls));
    const moved = snapGolden('workspace-snap-moved.json');
    expect(await port.snap(moved.chapterId, moved.itemGuid, moved.sourceTime)).toEqual({ snapped: true, time: moved.time, moved: moved.moved });
    const refused = await port.snap('c-current', '{ITEM-GONE}', 3.25);
    expect(refused).toMatchObject({ snapped: false, time: 3.25, moved: 0, reason: 'stale' });
    expect(refused.snapped === false && refused.message).toMatch(/\S/);
    expect(calls).toEqual([`snap ${moved.chapterId} ${moved.itemGuid} ${moved.sourceTime}`, 'snap c-current {ITEM-GONE} 3.25']);
  });
});

describe('the mock', () => {
  it('a swapped mock changes the words with no change to a caller', async () => {
    const caller = async (port: AlignmentPort) => (await wordsOf(port, 'c-1')).map((word) => word.text).join(' ');
    const swapped = createMockAlignment({ words: [{ text: 'hello', item: 0, off0: 0, off1: 0.4, conf: null, confReason: 'no_word_scores' }] });
    expect(await caller(createMockAlignment())).toContain('begging');
    expect(await caller(swapped)).toBe('hello');
  });

  it('answers null for every chapter when nothing has been transcribed', async () => {
    expect((await createMockAlignment({ none: true }).heard('c-1')).heard).toBeNull();
  });
});
