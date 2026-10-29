import { describe, expect, it } from 'vitest';
import type { DocItem } from '../model';
import { marksDoc } from '../script/scriptFixtures';
import { buildWordClock } from './wordClock';
import { linear, wordTimesFor } from './wordTimesFixtures';

const doc = marksDoc();
const words = doc.items.filter((i): i is DocItem & { t0: number; t1: number } => i.kind === 'w' && i.t0 != null && i.t1 != null && i.t1 > i.t0);
const first = words[0];
const second = words[1];
const near = (actual: number | null, expected: number | null): void => {
  if (expected === null) expect(actual).toBeNull();
  else expect(actual).toBeCloseTo(expected, 6);
};

describe('the word clock', () => {
  it('places a word of an item that sits at project second 0', () => {
    const { table, tokenOf } = wordTimesFor(doc, linear(0));
    const clock = buildWordClock(table, doc, tokenOf);
    near(clock.projectAt(first.t0), first.t0);
    near(clock.docAt(first.t0 + 0.05), first.t0 + 0.05);
    expect(clock.wordAt(first.t0 + 0.05)?.key).toBe(first.key);
  });

  describe('whyNotPlaced', () => {
    it('names a second with no recorded word', () => {
      const { table, tokenOf } = wordTimesFor(doc, linear(100));
      expect(buildWordClock(table, doc, tokenOf).whyNotPlaced(9999, 'REAPER')).toMatch(/no recorded word at that time/);
    });
    it('names a word whose audio the project no longer plays', () => {
      const { table, tokenOf } = wordTimesFor(doc, (w) => (w.key === second.key ? null : linear(100)(w)));
      expect(buildWordClock(table, doc, tokenOf).whyNotPlaced(second.t0 + 0.01, 'REAPER')).toMatch(
        /not in REAPER's project now.*cut out, trimmed off or muted/,
      );
    });
    it('names a word with no token in the alignment', () => {
      const { table } = wordTimesFor(doc, linear(100));
      expect(buildWordClock(table, doc, () => undefined).whyNotPlaced(first.t0 + 0.01, 'REAPER')).toMatch(/not in the recording check's alignment/);
    });
    it('names a word the check heard nothing for', () => {
      const { table, tokenOf } = wordTimesFor(doc, linear(100));
      const heardNothing = { ...table, words: table.words.map((w) => ({ ...w, state: 'not_heard' as const, start: 0, end: 0 })) };
      expect(buildWordClock(heardNothing, doc, tokenOf).whyNotPlaced(first.t0 + 0.01, 'REAPER')).toMatch(/heard nothing for that word/);
    });
  });

  it('maps a word start to its project start and back, for an item that plays the page at twice the speed', () => {
    const { table, tokenOf } = wordTimesFor(doc, linear(100, 0, 2));
    const clock = buildWordClock(table, doc, tokenOf);
    for (const w of words) {
      near(clock.projectAt(w.t0), 100 + w.t0 / 2);
      near(clock.docAt(100 + w.t0 / 2), w.t0);
    }
  });

  it('puts a project second inside a word at the same fraction of the word on the page', () => {
    const spread = wordTimesFor(doc, (w) => ({ start: 200 + w.t0 * 10, end: 200 + w.t0 * 10 + 1 }));
    const clock = buildWordClock(spread.table, doc, spread.tokenOf);
    near(clock.docAt(200 + first.t0 * 10 + 0.5), first.t0 + (first.t1 - first.t0) / 2);
    expect(spread.tokenOf(first.key)).toBe(0);
  });

  it('lights the word whose project time it is, word by word, never a sentence ahead', () => {
    const { table, tokenOf } = wordTimesFor(doc, linear(100));
    const clock = buildWordClock(table, doc, tokenOf);
    const seen: string[] = [];
    for (let t = 100 + first.t0; t < 100 + words[words.length - 1].t1; t += 0.05) {
      const at = clock.wordAt(t);
      if (at && seen[seen.length - 1] !== at.key) seen.push(at.key);
    }
    expect(seen).toEqual(words.map((w) => w.key));
  });

  it('has no time for a project second between words or outside every word', () => {
    const { table, tokenOf } = wordTimesFor(doc, (w) => ({ start: 100 + w.t0, end: 100 + w.t0 + (w.t1 - w.t0) / 2 }));
    const clock = buildWordClock(table, doc, tokenOf);
    near(clock.docAt(100 + first.t0 + (first.t1 - first.t0) * 0.75), null);
    near(clock.docAt(99), null);
    near(clock.docAt(100 + words[words.length - 1].t1 + 5), null);
  });

  it("never gives a word the DAW does not play a neighbour's time", () => {
    const { table, tokenOf } = wordTimesFor(doc, (w) => (w.key === second.key ? null : linear(100)(w)));
    const clock = buildWordClock(table, doc, tokenOf);
    near(clock.projectAt(second.t0), null);
    near(clock.projectAt((second.t0 + second.t1) / 2), null);
    near(clock.docAt(100 + second.t0), null);
    near(clock.wordAt(100 + (second.t0 + second.t1) / 2)?.t ?? null, null);
    near(clock.projectAt(first.t0), 100 + first.t0);
  });

  it('follows words that were moved around in the project, in project order', () => {
    // The second half of the words plays first, 500 s earlier than the project's start.
    const mid = words[Math.floor(words.length / 2)].t0;
    const { table, tokenOf } = wordTimesFor(doc, (w) => linear(w.t0 >= mid ? 10 : 400, w.t0 >= mid ? mid : 0)(w));
    const clock = buildWordClock(table, doc, tokenOf);
    near(clock.docAt(10), mid);
    near(clock.docAt(400 + first.t0), first.t0);
  });

  it('plays the later-starting word where words overlap, as the DAW does', () => {
    const { table, tokenOf } = wordTimesFor(doc, (w) =>
      w.key === first.key ? { start: 100, end: 110 } : w.key === second.key ? { start: 105, end: 106 } : null,
    );
    const clock = buildWordClock(table, doc, tokenOf);
    expect(clock.wordAt(105.5)?.key).toBe(second.key);
    expect(clock.wordAt(102)?.key).toBe(first.key);
    expect(clock.wordAt(108)?.key).toBe(first.key);
  });

  it('ends a play at the exact end of the last word, and carries a tail past it for up to a second', () => {
    const { table, tokenOf } = wordTimesFor(doc, linear(100));
    const clock = buildWordClock(table, doc, tokenOf);
    near(clock.projectEndAt(second.t1), 100 + second.t1);
    near(clock.projectEndAt(words[words.length - 1].t1 + 0.5), 100 + words[words.length - 1].t1 + 0.5);
    near(clock.projectEndAt(words[words.length - 1].t1 + 5), null);
    near(clock.projectEndAt(-1), null);
  });

  it("is the end of the chapter's last placed word", () => {
    const { table, tokenOf } = wordTimesFor(doc, linear(100));
    near(buildWordClock(table, doc, tokenOf).end(), 100 + words[words.length - 1].t1);
    const none = wordTimesFor(doc, () => null);
    near(buildWordClock(none.table, doc, none.tokenOf).end(), null);
  });

  it("carries the table's version", () => {
    const { table, tokenOf } = wordTimesFor(doc, linear(100), { version: 'rec@9' });
    expect(buildWordClock(table, doc, tokenOf).version).toBe('rec@9');
  });

  it('rejects times that are not numbers', () => {
    const { table, tokenOf } = wordTimesFor(doc, linear(100));
    const clock = buildWordClock(table, doc, tokenOf);
    for (const bad of [NaN, Infinity, -1]) {
      expect(clock.docAt(bad)).toBeNull();
      expect(clock.projectAt(bad)).toBeNull();
    }
  });
});
