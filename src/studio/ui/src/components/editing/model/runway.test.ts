import { describe, expect, it } from 'vitest';
import { marksDoc } from '../script/scriptFixtures';
import type { ChapterDoc, DocItem } from './doc';
import { summarize } from './selection';
import { heardWindow, MIN_TAIL_SECONDS, RUNWAY_SECONDS, runwayEnd, WORD_LEAD_SECONDS, WORD_TAIL_SECONDS } from './runway';

const doc = marksDoc();
const heard = doc.items.filter((i) => i.t0 != null && i.t1 != null && i.st !== 'miss' && !i.cut);
const lastOf = (pid: string) => [...heard].filter((i) => i.pid === pid).at(-1)!;
const firstOf = (pid: string) => heard.find((i) => i.pid === pid)!;

// The aligner's end time for a word can fall before the sound has died away, so a play that stops at the last word of a paragraph clips it.
describe('runwayEnd', () => {
  it('gives the last word of a paragraph room to ramp down', () => {
    const last = lastOf('p-1');
    const end = last.t1 as number;
    const got = runwayEnd(doc, last.key, end);
    expect(got).toBeGreaterThan(end);
    expect(got - end).toBeLessThanOrEqual(RUNWAY_SECONDS + 1e-9);
  });

  it('never runs into the next paragraph', () => {
    const last = lastOf('p-1');
    const next = firstOf('p-2').t0 as number;
    expect(runwayEnd(doc, last.key, last.t1 as number)).toBeLessThan(next);
  });

  it('leaves a word in the middle of a paragraph alone', () => {
    const word = heard.find((i) => i.pid === 'p-1')!;
    expect(runwayEnd(doc, word.key, word.t1 as number)).toBe(word.t1);
  });

  it('gives the very last word of the chapter the whole runway', () => {
    const last = heard.at(-1)!;
    expect(runwayEnd(doc, last.key, last.t1 as number)).toBeCloseTo((last.t1 as number) + RUNWAY_SECONDS, 6);
  });

  it('leaves an unknown word as it was', () => {
    expect(runwayEnd(doc, 'no-such-key', 12.5)).toBe(12.5);
  });
});

/** Words as the recognizer times them: `[key, line, start, end]`. */
const timed = (words: [string, string, number, number][]): ChapterDoc => {
  const items = words.map(([key, pid, t0, t1]) => ({ key, pid, t0, t1, st: 'ok', text: key }) as unknown as DocItem);
  return {
    paras: [],
    items,
    index: new Map(items.map((i, n) => [i.key, n])),
    aligned: true,
    engine: { id: 'e', name: 'e' },
    counts: {},
  } as unknown as ChapterDoc;
};

// The owner heard "U" for "Up": a play stopped on the recognizer's end time, which falls before an "s", a plosive's release or a word's
// unvoiced tail. Every Editing play of words takes its window from heardWindow.
describe('heardWindow', () => {
  it('runs past a word ending in "s" that the next word starts right after (touching boundaries, as the recognizer gives them)', () => {
    const d = timed([
      ['p:0', 'p', 0.5, 0.9],
      ['p:1', 'p', 0.9, 1.2], // "was": the "s" sounds after 1.2
      ['p:2', 'p', 1.2, 1.6],
    ]);
    const [, end] = heardWindow(d, 'p:1', 'p:1', 0.9, 1.2);
    expect(end).toBeCloseTo(1.2 + MIN_TAIL_SECONDS, 6);
  });

  it('never runs past the middle of a short next word', () => {
    const d = timed([
      ['p:0', 'p', 1, 1.2],
      ['p:1', 'p', 1.2, 1.3],
    ]);
    expect(heardWindow(d, 'p:0', 'p:0', 1, 1.2)[1]).toBeCloseTo(1.25, 6);
  });

  it('runs the whole tail into a pause inside the line', () => {
    const d = timed([
      ['p:0', 'p', 0.5, 0.8], // "Up"
      ['p:1', 'p', 1.5, 1.8],
    ]);
    expect(heardWindow(d, 'p:0', 'p:0', 0.5, 0.8)[1]).toBeCloseTo(0.8 + WORD_TAIL_SECONDS, 6);
  });

  it('stops short of the next word when the gap is smaller than the tail', () => {
    const d = timed([
      ['p:0', 'p', 0.5, 0.8],
      ['p:1', 'p', 0.9, 1.2],
    ]);
    expect(heardWindow(d, 'p:0', 'p:0', 0.5, 0.8)[1]).toBeCloseTo(0.88, 6);
  });

  it('gives the last word of a line the runway, never into the next line', () => {
    const d = timed([
      ['a:0', 'a', 0.5, 0.8],
      ['b:0', 'b', 2, 2.3],
    ]);
    expect(heardWindow(d, 'a:0', 'a:0', 0.5, 0.8)[1]).toBeCloseTo(0.8 + RUNWAY_SECONDS, 6);
    const near = timed([
      ['a:0', 'a', 0.5, 0.8],
      ['b:0', 'b', 1, 1.3],
    ]);
    expect(heardWindow(near, 'a:0', 'a:0', 0.5, 0.8)[1]).toBeCloseTo(0.98, 6);
  });

  it('gives the last word of the recording the runway; the playlist ends the play at the clip end', () => {
    const d = timed([['p:0', 'p', 0.5, 0.8]]);
    expect(heardWindow(d, 'p:0', 'p:0', 0.5, 0.8)[1]).toBeCloseTo(0.8 + RUNWAY_SECONDS, 6);
  });

  it('finds the next word by its time, not by where it sits in the list', () => {
    const d = timed([
      ['p:0', 'p', 0.5, 0.8],
      ['p:x0', 'p', 0.8, 1.1], // an extra word laid after the line's last script word
      ['p:1', 'p', 3, 3.3],
    ]);
    const word = d.items.splice(1, 1)[0];
    d.items.push(word);
    d.index = new Map(d.items.map((i, n) => [i.key, n]));
    expect(heardWindow(d, 'p:0', 'p:0', 0.5, 0.8)[1]).toBeCloseTo(0.8 + MIN_TAIL_SECONDS, 6);
  });

  it('starts a little early for a plosive, never before the previous word ends or the chapter starts', () => {
    const gap = timed([
      ['p:0', 'p', 0.2, 0.5],
      ['p:1', 'p', 1, 1.3],
    ]);
    expect(heardWindow(gap, 'p:1', 'p:1', 1, 1.3)[0]).toBeCloseTo(1 - WORD_LEAD_SECONDS, 6);
    const touching = timed([
      ['p:0', 'p', 0.2, 1],
      ['p:1', 'p', 1, 1.3],
    ]);
    expect(heardWindow(touching, 'p:1', 'p:1', 1, 1.3)[0]).toBe(1);
    const first = timed([['p:0', 'p', 0.02, 0.3]]);
    expect(heardWindow(first, 'p:0', 'p:0', 0.02, 0.3)[0]).toBe(0);
  });

  it('leaves an unknown word as it was', () => {
    expect(heardWindow(doc, 'nope', 'nope', 1, 2)).toEqual([1, 2]);
  });

  it('plays past a mid-line word of the fixture chapter, whose words touch', () => {
    const word = heard.find((i) => i.pid === 'p-1')!;
    expect(heardWindow(doc, word.key, word.key, word.t0 as number, word.t1 as number)[1]).toBeGreaterThan(word.t1 as number);
  });
});

// The owner's report: the line says "Up" and the app played "U". The aligner ended "Up" before the release of its "p".
describe('regression: "Up" heard as "U"', () => {
  const up = (after: [string, string, number, number] | null): ChapterDoc => timed([['a:0', 'a', 1, 1.18], ...(after ? [after] : [])]);

  it('keeps the "p" of "Up" when it ends a line', () => {
    expect(heardWindow(up(['b:0', 'b', 2.5, 2.8]), 'a:0', 'a:0', 1, 1.18)[1]).toBeCloseTo(1.18 + RUNWAY_SECONDS, 6);
  });

  it('keeps the "p" of "Up" in the middle of a line, the next word touching it', () => {
    expect(heardWindow(up(['a:1', 'a', 1.18, 1.5]), 'a:0', 'a:0', 1, 1.18)[1]).toBeCloseTo(1.18 + MIN_TAIL_SECONDS, 6);
  });

  it('keeps the "p" of "Up" when a pause follows it', () => {
    expect(heardWindow(up(['a:1', 'a', 1.6, 1.9]), 'a:0', 'a:0', 1, 1.18)[1]).toBeCloseTo(1.18 + WORD_TAIL_SECONDS, 6);
  });
});

// Cuts, replacements and click repairs are made from the words' own aligned times (summarize, padded inward), never from a play's window.
describe('cut bounds are not the play window', () => {
  it('summarize still gives the aligned start and end of the words', () => {
    const words = heard.filter((i) => i.pid === 'p-1').slice(1, 3);
    const sum = summarize(
      doc,
      words.map((w) => w.key),
      [],
      (x) => x,
    );
    expect(sum.start).toBe(words[0].t0);
    expect(sum.end).toBe(words[words.length - 1].t1);
    const [start, end] = heardWindow(doc, words[0].key, words[words.length - 1].key, sum.start, sum.end);
    expect(end).toBeGreaterThan(sum.end);
    expect(start).toBeLessThanOrEqual(sum.start);
  });
});
