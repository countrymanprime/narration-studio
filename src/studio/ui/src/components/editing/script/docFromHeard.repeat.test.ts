import { describe, expect, it } from 'vitest';
import type { HeardAnswer, HeardWord } from '../../../ports/alignment';
import { buildDoc, type ChapterDoc, type ScriptParagraph } from '../model';
import { docFromHeard, type TextParagraph } from './docFromHeard';

// Issue #2251 item 30: a phrase said twice is a second take. On the live page (no take per line) the sidecar's repeat
// reaches the doc as `dup`, so the "Read twice" card shows instead of "Not in the script".

const PARAS: TextParagraph[] = [
  { id: 'p-1', text: 'Alice was beginning to get very tired.' },
  { id: 'p-2', text: 'So she was considering in her own mind.' },
];
const ENGINE = { id: 'whisper:small', name: 'Whisper small' };
let clock = 0;
const said = (pid: string, text: string, from = 0): HeardWord[] =>
  text.split(' ').map((t, i) => ({
    text: t,
    paragraphId: pid,
    ordinal: from + i,
    item: 0,
    off0: (clock += 0.3),
    off1: clock + 0.25,
    conf: null,
    confReason: 'no_word_scores',
  }));
const added = (text: string, repeats?: HeardWord['repeats']): HeardWord[] =>
  text.split(' ').map((t) => ({
    text: t,
    item: 0,
    off0: (clock += 0.3),
    off1: clock + 0.25,
    conf: null,
    confReason: 'no_word_scores',
    added: true,
    timing: 'spread',
    ...(repeats ? { repeats } : {}),
  }));
const answer = (...runs: HeardWord[][]): HeardAnswer => ({ heard: { engine: ENGINE, words: runs.flat() } });
const extras = (doc: ChapterDoc, pid: string) => doc.items.filter((i) => i.pid === pid && i.st === 'extra');

describe('docFromHeard: a repeat on the live page is a second read', () => {
  it('marks a run that says the end of the line again as dup, on that line', () => {
    const doc = docFromHeard(PARAS, answer(said('p-1', PARAS[0].text), added('sorry very tired.', 'previous'), said('p-2', PARAS[1].text)));
    const run = extras(doc, 'p-1');
    expect(run.map((i) => i.text)).toEqual(['sorry', 'very', 'tired.']);
    expect(run.every((i) => i.dup)).toBe(true);
    expect(extras(doc, 'p-2')).toEqual([]);
  });

  it('puts a restart with the line it restarts and marks it dup there', () => {
    const doc = docFromHeard(PARAS, answer(said('p-1', PARAS[0].text), added('So she was sorry', 'next'), said('p-2', PARAS[1].text)));
    expect(extras(doc, 'p-1')).toEqual([]);
    const run = extras(doc, 'p-2');
    expect(run).toHaveLength(4);
    expect(run.every((i) => i.dup)).toBe(true);
  });

  it('marks a repeat in the middle of a line, where no head words are repeated', () => {
    const doc = docFromHeard(PARAS, answer(said('p-1', 'Alice was beginning to get', 0), added('beginning to get', 'previous'), said('p-1', 'very tired.', 5)));
    expect(extras(doc, 'p-1').every((i) => i.dup)).toBe(true);
    expect(extras(doc, 'p-1')).toHaveLength(3);
  });

  it('leaves an aside as words not in the script', () => {
    const doc = docFromHeard(PARAS, answer(said('p-1', PARAS[0].text), added('um well'), said('p-2', PARAS[1].text)));
    expect(extras(doc, 'p-1').map((i) => [i.text, i.dup ?? false])).toEqual([
      ['um', false],
      ['well', false],
    ]);
  });
});

describe('buildDoc: a take that says the script beside the extra words again', () => {
  const text = 'The cat sat down on the mat.';
  const take = (): ScriptParagraph => ({
    id: 'p1',
    text,
    units: [{ key: 'u0', s: 0, e: text.length }],
    take: { id: 'T1', text, start: 0, len: 9, s: 0, e: text.length },
  });
  const docOf = (heard: string) =>
    buildDoc({
      paragraphs: [take()],
      aligner: {
        engine: () => ENGINE,
        snap: (s) => s,
        heard: () => {
          let t = 0;
          return { words: heard.split(' ').map((x) => ({ text: x, off0: (t += 0.4), off1: t + 0.3, conf: 0.95 })), len: t + 0.5 };
        },
      },
      cuts: [],
      effects: [],
      accepted: [],
    });

  it('is a second read for three words or more anywhere in the line, not only the first four', () => {
    const run = docOf('The cat sat down on sat down on the mat.').items.filter((i) => i.st === 'extra');
    expect(run).toHaveLength(3);
    expect(run.every((i) => i.dup)).toBe(true);
  });

  it('is not a second read for a two-word echo or for words from elsewhere', () => {
    expect(docOf('The cat sat sat down on the mat.').items.filter((i) => i.dup)).toEqual([]);
    expect(docOf('The cat sat down well well well on the mat.').items.filter((i) => i.dup)).toEqual([]);
  });
});
