import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { WorkspaceAlignmentResult } from '../api/contracts/workspace';
import { workspaceAlignmentResultSchema } from '../api/schemas/workspace';
import { createHostAlignment, type HeardWord } from './alignment';

// Issue #2251 item 30: an extra run that says the chapter text again is a second take. The port marks its words with the
// side of the script they repeat, so the Editing page can show "Read twice" on the live page.
const GOLDEN = fileURLToPath(new URL('../../../../../tests/fixtures/contracts/workspace-alignment-repeat.json', import.meta.url));
const golden = workspaceAlignmentResultSchema.parse(JSON.parse(readFileSync(GOLDEN, 'utf8')));

const heard = async (result: WorkspaceAlignmentResult): Promise<HeardWord[]> => {
  const port = createHostAlignment({ workspaceAlignment: () => Promise.resolve(result), workspaceSnap: () => Promise.reject(new Error('unused')) });
  const answer = await port.heard(result.chapterId);
  if (!answer.heard) throw new Error(answer.reason);
  return answer.heard.words;
};

describe('the alignment port reads a repeat', () => {
  it('marks every word of a run that says the words before it again as repeating the previous words, after them', async () => {
    const words = await heard(golden);
    expect(words.map((w) => w.text)).toEqual(['Alice', 'was', 'begging', 'to', 'get', 'very', 'tired.', 'sorry', 'very', 'tired.']);
    expect(words.slice(7).every((w) => w.added && w.repeats === 'previous')).toBe(true);
    expect(words.slice(0, 7).every((w) => w.repeats === undefined)).toBe(true);
  });

  it('puts a restart (a run that says the words after it) before the word it restarts, marked as repeating the next words', async () => {
    const [extra] = golden.extras;
    const restart: WorkspaceAlignmentResult = {
      ...golden,
      extras: [
        {
          ...extra,
          text: 'to get sorry',
          words: (extra.words ?? []).map((w, k) => ({ ...w, text: ['to', 'get', 'sorry'][k] })),
          afterToken: 1,
          repeatOf: { start: 3, end: 5, first: 0, last: 2, text: 'to get' },
        },
      ],
    };
    const texts = (await heard(restart)).map((w) => `${w.text}${w.repeats ? `:${w.repeats}` : ''}`);
    expect(texts).toEqual(['Alice', 'was', 'begging', 'to:next', 'get:next', 'sorry:next', 'to', 'get', 'very', 'tired.']);
  });

  it('leaves an aside unmarked', async () => {
    const [extra] = golden.extras;
    const aside = { ...extra };
    delete aside.repeatOf;
    const words = await heard({ ...golden, extras: [aside] });
    expect(words.every((w) => w.repeats === undefined)).toBe(true);
  });
});
