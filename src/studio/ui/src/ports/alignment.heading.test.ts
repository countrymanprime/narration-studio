import { describe, expect, it } from 'vitest';

import type { WorkspaceAlignmentResult } from '../api/contracts/workspace';
import { createHostAlignment, HEADING_PARAGRAPH, tokenParagraph } from './alignment';

const result = (): WorkspaceAlignmentResult => ({
  chapterId: 'c-1',
  state: 'current',
  reasons: [],
  needsAlignAgain: false,
  title: 'Chapter One',
  subtitle: 'Down the Rabbit-Hole',
  paragraphs: [{ id: 'p-1', text: 'Alice began.' }],
  tokens: [
    // The sidecar's heading tokens carry no paragraph: they are the optional title and subtitle, and each has its own ordinal.
    { i: 0, w: 0, text: 'Chapter', status: 'heading', item: 0, start: 1, end: 1.4, conf: null },
    { i: 1, w: 1, text: 'One', status: 'heading', item: 0, start: 1.4, end: 1.8, conf: null },
    { i: 2, p: 'p-1', w: 0, text: 'Alice', status: 'read', item: 0, start: 2, end: 2.4, conf: null },
  ],
  extras: [],
  items: [],
  engine: { id: 'whisper:small', name: 'Whisper small' },
});

describe('the alignment port and the chapter heading', () => {
  it('gives a spoken heading word the heading paragraph and its ordinal, so it is the heading the narrator read and not an extra word', async () => {
    const port = createHostAlignment({ workspaceAlignment: async () => result(), workspaceSnap: async () => Promise.reject(new Error('not asked')) });
    const answer = await port.heard('c-1');
    if (!answer.heard) throw new Error('expected heard words');
    expect(answer.heard.words.map((w) => [w.text, w.paragraphId, w.ordinal])).toEqual([
      ['Chapter', HEADING_PARAGRAPH, 0],
      ['One', HEADING_PARAGRAPH, 1],
      ['Alice', 'p-1', 0],
    ]);
  });

  it('names the paragraph of a token: its own, the heading for a heading token, none otherwise', () => {
    const [first, , third] = result().tokens;
    expect(tokenParagraph(first!)).toBe(HEADING_PARAGRAPH);
    expect(tokenParagraph(third!)).toBe('p-1');
    expect(tokenParagraph({ status: 'skip' })).toBeUndefined();
  });
});
