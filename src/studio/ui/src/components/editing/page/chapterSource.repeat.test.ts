import { describe, expect, it } from 'vitest';

import type { WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import type { HeardAnswer, HeardWord } from '../../../ports/alignment';
import { docOf, doubledCut, doubledStart, type ChapterRead } from './chapterSource';

// Issue #2251 item 30: where a line said twice is split into two takes, from the recording check's repeat. Seconds are
// from the paragraph's span origin (its first word less the 0.15 s lead), as `doubledCut` has always answered.

const script = (pid: string, words: string, at: number, from = 0): HeardWord[] =>
  words.split(' ').map((text, k) => ({ text, paragraphId: pid, ordinal: from + k, item: 0, off0: at + k * 0.5, off1: at + k * 0.5 + 0.4, conf: 1 }));
const added = (words: string, at: number, repeats?: HeardWord['repeats']): HeardWord[] =>
  words.split(' ').map((text, k) => ({ text, item: 0, off0: at + k * 0.5, off1: at + k * 0.5 + 0.4, conf: 1, added: true, ...(repeats ? { repeats } : {}) }));

const workspace: WorkspaceAlignmentResult = {
  chapterId: 'c-1',
  state: 'current',
  reasons: [],
  needsAlignAgain: false,
  paragraphs: [
    { id: 'p-1', text: 'Alice was beginning to get very tired.' },
    { id: 'p-2', text: 'So she was considering in her own mind.' },
  ],
  tokens: [],
  extras: [],
  items: [],
  engine: { id: 'whisper:small', name: 'Whisper small' },
};
const readOf = (words: HeardWord[]): ChapterRead => {
  const answer: HeardAnswer = { heard: { engine: { id: 'whisper:small', name: 'Whisper small' }, words } };
  return { workspace, answer, cuts: [], effects: [], accepted: [], items: [], place: 'track', audio: { kind: 'ready' } };
};

describe('a line said twice, from the check', () => {
  // p-1 is heard from 1.0 to 4.4 s; its origin is 0.85 s.
  const p1 = script('p-1', 'Alice was beginning to get very tired.', 1);
  const p2 = (at: number) => script('p-2', 'So she was considering in her own mind.', at);

  it('splits a retake before the run: the aside goes with the second read', () => {
    const read = readOf([...p1, ...added('sorry very tired.', 5, 'previous'), ...p2(8)]);
    expect(doubledStart(read, 'p-1')).toBeCloseTo(5 - 0.85, 3);
    expect(doubledCut(read, 'p-1')).toBeCloseTo((4.4 + 5) / 2 - 0.85, 3);
    expect(doubledStart(read, 'p-2')).toBeNull();
  });

  it('splits a restart after the run, on the line it restarts', () => {
    const read = readOf([...p1, ...added('So she was sorry', 5, 'next'), ...p2(8)]);
    expect(doubledStart(read, 'p-1')).toBeNull();
    // p-2's span starts at the restart (5 s), so its origin is 4.85 s; the second read starts at 8 s.
    expect(doubledStart(read, 'p-2')).toBeCloseTo(8 - 4.85, 3);
    expect(doubledCut(read, 'p-2')).toBeCloseTo((6.9 + 8) / 2 - 4.85, 3);
    expect(docOf(read).items.filter((i) => i.pid === 'p-2' && i.dup)).toHaveLength(4);
  });

  it('has no split for an aside', () => {
    const read = readOf([...p1, ...added('um well', 5), ...p2(8)]);
    expect([doubledStart(read, 'p-1'), doubledCut(read, 'p-1')]).toEqual([null, null]);
  });
});
