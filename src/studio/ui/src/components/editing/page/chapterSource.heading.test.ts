import { describe, expect, it } from 'vitest';

import type { WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import { HEADING_PARAGRAPH, type HeardAnswer, type HeardWord } from '../../../ports/alignment';
import { docOf, type ChapterRead } from './chapterSource';

const word = (text: string, paragraphId: string | undefined, ordinal: number | undefined, at: number): HeardWord => ({
  text,
  ...(paragraphId !== undefined ? { paragraphId, ordinal } : {}),
  item: 0,
  off0: at,
  off1: at + 0.4,
  conf: 1,
});

const workspace = (heading: { title?: string; subtitle?: string }): WorkspaceAlignmentResult => ({
  chapterId: 'c-1',
  state: 'current',
  reasons: [],
  needsAlignAgain: false,
  ...heading,
  paragraphs: [{ id: 'p-1', text: 'Alice began to read.' }],
  tokens: [],
  extras: [],
  items: [],
  engine: { id: 'whisper:small', name: 'Whisper small' },
});

const readOf = (heading: { title?: string; subtitle?: string }, words: HeardWord[]): ChapterRead => {
  const answer: HeardAnswer = { heard: { engine: { id: 'whisper:small', name: 'Whisper small' }, words } };
  return { workspace: workspace(heading), answer, cuts: [], effects: [], accepted: [], items: [], place: 'track', audio: { kind: 'ready' } };
};

const body = [word('Alice', 'p-1', 0, 2), word('began', 'p-1', 1, 2.4), word('to', 'p-1', 2, 2.8), word('read', 'p-1', 3, 3.2)];
const spoken = [
  word('Chapter', HEADING_PARAGRAPH, 0, 0.2),
  word('One', HEADING_PARAGRAPH, 1, 0.6),
  word('Down', HEADING_PARAGRAPH, 2, 1),
  word('the', HEADING_PARAGRAPH, 3, 1.4),
  word('Rabbit-Hole', HEADING_PARAGRAPH, 4, 1.8),
];
const flagged = (read: ChapterRead, st: string) => docOf(read).items.filter((item) => item.st === st);

describe('the chapter heading in the Editing page text', () => {
  const heading = { title: 'Chapter One', subtitle: 'Down the Rabbit-Hole' };

  it('puts the title and subtitle first, as the chapter heading paragraph', () => {
    const doc = docOf(readOf(heading, [...spoken, ...body]));
    expect(doc.paras.map((para) => para.p.id)).toEqual([HEADING_PARAGRAPH, 'p-1']);
    expect(doc.paras[0]!.p.text).toBe('Chapter One. Down the Rabbit-Hole');
  });

  it('does not call a spoken heading extra words', () => {
    expect(flagged(readOf(heading, [...spoken, ...body]), 'extra')).toHaveLength(0);
  });

  it('does not call an unread heading missing: the heading is optional', () => {
    const read = readOf(heading, body);
    expect(flagged(read, 'miss')).toHaveLength(0);
    expect(flagged(read, 'extra')).toHaveLength(0);
  });

  it('still calls a word missing from the body missing', () => {
    expect(flagged(readOf(heading, [...spoken, ...body.slice(0, 3)]), 'miss')).toHaveLength(1);
  });

  it('adds no heading paragraph for a chapter with no title, as for a credits row', () => {
    const doc = docOf(readOf({}, body));
    expect(doc.paras.map((para) => para.p.id)).toEqual(['p-1']);
  });

  it('uses the title alone when there is no subtitle', () => {
    const doc = docOf(readOf({ title: 'Prologue' }, body));
    expect(doc.paras[0]!.p.text).toBe('Prologue');
  });

  it('is plain script text with the heading first when nothing was heard', () => {
    const read: ChapterRead = { ...readOf(heading, []), answer: { heard: null, reason: 'none', reasons: [] } };
    expect(docOf(read).paras.map((para) => para.p.id)).toEqual([HEADING_PARAGRAPH, 'p-1']);
  });
});
