import { describe, expect, it } from 'vitest';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import type { HeardAnswer, HeardWord } from '../../../ports/alignment';
import type { DocCut } from '../model/cuts';
import { docFromHeard, type TextParagraph } from '../script/docFromHeard';
import { speechPeaks, type Said } from './clockFixtures';
import { itemClocks, placePeaks, sameClock, shiftPeaks, type ItemClocks } from './docClock';
import { peaksWindowAll, type PeakColumn } from './peaksWindow';
import { ribbonLayout } from './ribbonLayout';
import { pickEntries, type RibbonPeaks } from './useRibbonPeaks';

const LOUD = 100;
const loudAt = (cols: readonly PeakColumn[], t0: number, t1: number, t: number, level = LOUD): boolean =>
  t >= t0 && t < t1 && cols[Math.floor(((t - t0) / (t1 - t0)) * cols.length)][1] >= level;
const silent = (cols: readonly PeakColumn[]): number => cols.filter(([lo, hi]) => lo === 0 && hi === 0).length;
const ready = (...peaks: WorkspacePeaks[]): RibbonPeaks => ({
  status: 'ready',
  result: { chapterId: 'c', items: peaks.map((p, index) => ({ index, peaks: p })) },
});

// The owner's paragraph, 'It is not about perfect people in perfect capes saving a perfect world.': its ribbon says "recording · 0:18.8 to 0:23.1"
// (the document clock) while its words, and the peaks entry the host read for them (21.94 to 26.74), are in the source file's seconds.
// 'It' is heard from 22.2, so the document's 18.79 is the source's 22.2: the document runs 3.41 s ahead of the file here.
const OWNER_WORDS: Said[] = [
  [22.2, 22.32], [22.32, 22.44], [22.44, 22.62], [22.62, 23.0], [23.0, 23.38], [23.38, 23.86], [23.86, 24.26],
  [24.26, 24.58], [24.58, 25.06], [25.06, 25.42], [25.42, 25.68], [25.68, 25.98], [25.98, 26.32],
]; // prettier-ignore
const OWNER = { t0: 18.79, t1: 23.14, shift: 18.79 - 22.2, entry: () => speechPeaks(21.94, 4.8, OWNER_WORDS) };

describe("the owner's ribbon: peaks put on the clock the window is on", () => {
  it.each([
    { name: 'on the source clock, as it was drawn', shift: 0, silentShare: 0.72 },
    { name: 'on the document clock', shift: OWNER.shift, silentShare: 0 },
  ])('$name: $silentShare of the window is silent', ({ shift, silentShare }) => {
    const cols = peaksWindowAll([shiftPeaks(OWNER.entry(), shift)], OWNER.t0, OWNER.t1, 100)!;
    expect(silent(cols) / cols.length).toBeCloseTo(silentShare, 1);
  });

  it('draws the loud columns where the words are heard, from the first word to the last', () => {
    const cols = peaksWindowAll([shiftPeaks(OWNER.entry(), OWNER.shift)], OWNER.t0, OWNER.t1, 400)!;
    expect(silent(cols)).toBe(0);
    // Every word's middle is loud; the quiet before the first word and after the last (the runway) is not.
    for (const [a, b] of OWNER_WORDS) expect(loudAt(cols, OWNER.t0, OWNER.t1, (a + b) / 2 + OWNER.shift)).toBe(true);
    expect(loudAt(cols, OWNER.t0, OWNER.t1, 22.1 + OWNER.shift)).toBe(false);
    expect(loudAt(cols, OWNER.t0, OWNER.t1, 26.5 + OWNER.shift)).toBe(false);
    // The first loud column is the window's start: the window begins on the first word.
    expect(cols.findIndex(([, hi]) => hi >= LOUD)).toBeLessThanOrEqual(1);
  });

  it('puts the loud columns under the words the range selection would cover, because both read the one document clock', () => {
    // wordsCovered/coverage read DocItem t0/t1; the ribbon's columns and those are the same seconds, so a span over the loud columns covers those words.
    const cols = peaksWindowAll([shiftPeaks(OWNER.entry(), OWNER.shift)], OWNER.t0, OWNER.t1, 400)!;
    const at = (c: number): number => OWNER.t0 + ((c + 0.5) / cols.length) * (OWNER.t1 - OWNER.t0);
    const loud = cols.map((c, i) => (c[1] >= LOUD ? at(i) : null)).filter((t): t is number => t !== null);
    expect(loud[0]).toBeCloseTo(22.2 + OWNER.shift, 1);
    expect(loud.at(-1)).toBeCloseTo(26.32 + OWNER.shift, 1);
  });
});

describe('shifts', () => {
  it('a shift of zero changes nothing: the entry is read at its own seconds', () => {
    const e = speechPeaks(2, 3, [[3, 4]]);
    const cols = peaksWindowAll([shiftPeaks(e, 0)], 2, 5, 300)!;
    expect(loudAt(cols, 2, 5, 3.5)).toBe(true);
    expect(loudAt(cols, 2, 5, 2.5)).toBe(false);
    expect(loudAt(cols, 2, 5, 4.5)).toBe(false);
  });

  it('a window past the shifted entry is null, as before', () => {
    expect(peaksWindowAll([shiftPeaks(speechPeaks(10, 2, []), -5)], 10, 12, 10)).toBeNull();
    expect(peaksWindowAll([shiftPeaks(speechPeaks(10, 2, []), -5)], 5, 7, 10)).not.toBeNull();
  });

  it('a line of two items at two shifts: each at its own place, and the gap between them silent', () => {
    const one = speechPeaks(21.94, 4.8, [[22.2, 23.0]]); // heard at 18.79 to 19.59 (shift -3.41)
    const two = speechPeaks(40, 4, [[40.5, 41.3]]); // heard at 22.0 to 22.8 (shift -18.5)
    const cols = peaksWindowAll([shiftPeaks(one, -3.41), shiftPeaks(two, -18.5)], 18.79, 23.0, 420)!;
    expect(loudAt(cols, 18.79, 23, 19.2)).toBe(true);
    expect(loudAt(cols, 18.79, 23, 22.4)).toBe(true);
    expect(loudAt(cols, 18.79, 23, 21.0)).toBe(false);
    expect(silent(cols)).toBeLessThan(cols.length);
  });

  it('pickEntries takes each item at its own clock, and leaves out an item no word is heard on', () => {
    const state = ready(speechPeaks(21.94, 4.8, []), speechPeaks(40, 4, []), speechPeaks(21.94, 4.8, []));
    const clocks: ItemClocks = new Map([
      [0, [{ from: -Infinity, to: Infinity, shift: -3.41 }]],
      [1, [{ from: -Infinity, to: Infinity, shift: -18.5 }]],
    ]);
    const got = pickEntries(state, clocks, 18.79, 23.14);
    expect('peaks' in got && got.peaks.map((d) => d.piece.shift)).toEqual([-3.41, -18.5]);
    expect(pickEntries(state, clocks, 18.79, 23.14, [2])).toEqual({ reason: 'This line lies outside the audio the host read.' });
  });

  it('a piece clips the entry to its stretch of the document clock', () => {
    const e = speechPeaks(0, 10, [[0, 10]]);
    const cols = peaksWindowAll(placePeaks(e, [{ from: -Infinity, to: 5, shift: 0 }]), 0, 10, 100)!;
    expect(loudAt(cols, 0, 10, 4)).toBe(true);
    expect(loudAt(cols, 0, 10, 6)).toBe(false);
  });
});

// A small chapter whose document drifts from its recording: each line is said 2 s after the last in the file, and the document lays them 0.5 s apart.
const PARAS: TextParagraph[] = [
  { id: 'p-0', text: 'Prologue' },
  { id: 'p-1', text: 'Alice was tired of sitting' },
  { id: 'p-2', text: 'by her sister on the bank' },
];
const ENGINE = { id: 'whisper:small', name: 'Whisper small' };
/** Contiguous 0.3 s words from `start`, source seconds. */
const said = (pid: string, text: string, start: number, item = 0, from = 0): HeardWord[] =>
  text.split(' ').map((w, i) => ({ text: w, paragraphId: pid, ordinal: from + i, item, off0: start + i * 0.3, off1: start + (i + 1) * 0.3, conf: 0.95 }));
const answerOf = (words: HeardWord[]): HeardAnswer => ({ heard: { engine: ENGINE, words } });
const DRIFT = answerOf([
  { text: 'Prologue', paragraphId: 'p-0', ordinal: 0, item: 0, off0: 1, off1: 1.6, conf: 0.9 },
  ...said('p-1', 'Alice was tired of sitting', 10),
  ...said('p-2', 'by her sister on the bank', 20),
]);

describe('itemClocks: where an item’s source seconds sit on the document clock', () => {
  it('is document minus source for each paragraph, and moves from one paragraph to the next', () => {
    const doc = docFromHeard(PARAS, DRIFT);
    const clocks = itemClocks(doc, DRIFT);
    const pieces = clocks.get(0)!;
    expect(pieces).toHaveLength(3);
    for (const [k, pid] of ['p-0', 'p-1', 'p-2'].entries()) {
      const first = doc.items.find((i) => i.pid === pid && i.t0 != null)!;
      const word = DRIFT.heard!.words.find((w) => w.paragraphId === pid)!;
      expect(pieces[k].shift).toBeCloseTo(first.t0! - word.off0, 2);
    }
    // The document is not the recording here: that is the whole bug.
    expect(Math.abs(pieces[1].shift)).toBeGreaterThan(1);
    expect(pieces[1].shift).not.toBeCloseTo(pieces[2].shift, 1);
  });

  it('draws every line of the chapter where it is heard: the loud columns are the ticks of the layout', () => {
    const doc = docFromHeard(PARAS, DRIFT);
    const clocks = itemClocks(doc, DRIFT);
    const file = speechPeaks(0, 30, [
      [1, 1.6],
      [10, 11.5],
      [20, 21.5],
    ]);
    for (const pid of ['p-1', 'p-2']) {
      const l = ribbonLayout(doc, pid, [], null)!;
      const got = pickEntries(ready(file), clocks, l.t0, l.t1, [0]);
      if (!('peaks' in got)) throw new Error(got.reason);
      const cols = peaksWindowAll(got.peaks, l.t0, l.t1, 200)!;
      expect(silent(cols)).toBe(0);
      expect(loudAt(cols, l.t0, l.t1, (l.ticks[0] + l.ticks[l.ticks.length - 1]) / 2)).toBe(true);
      expect(loudAt(cols, l.t0, l.t1, l.ticks[0] + 0.05)).toBe(true);
      // On the source clock the same window finds almost nothing of the line.
      const old = peaksWindowAll([shiftPeaks(file, 0)], l.t0, l.t1, 200)!;
      expect(loudAt(old, l.t0, l.t1, l.ticks[0] + 0.05)).toBe(false);
    }
  });

  it('is zero where the document is the recording', () => {
    const answer = answerOf([...said('p-1', 'Alice was tired of sitting', 0.65 - 0.15 + 0.15)]);
    const doc = docFromHeard(PARAS.slice(1, 2), answer);
    const first = doc.items[0];
    // The document puts a line at 0.5 s + lead-in; a recording that says it there has no shift.
    const pieces = itemClocks(doc, answer).get(0)!;
    expect(pieces).toHaveLength(1);
    expect(pieces[0].shift).toBeCloseTo(first.t0! - 0.65, 3);
  });

  it('has no entry for an item no word was heard on, and none for a chapter nothing was heard in', () => {
    const doc = docFromHeard(PARAS, DRIFT);
    expect(itemClocks(doc, DRIFT).has(1)).toBe(false);
    expect(itemClocks(docFromHeard(PARAS, { heard: null, reason: 'x', reasons: [] }), { heard: null, reason: 'x', reasons: [] }).size).toBe(0);
  });

  it('keeps a second item of the line on its own piece', () => {
    const answer = answerOf([...said('p-1', 'Alice was tired', 10, 0), ...said('p-1', 'of sitting', 10.9, 1, 3)]);
    const doc = docFromHeard(PARAS.slice(1, 2), answer);
    const clocks = itemClocks(doc, answer);
    expect([...clocks.keys()]).toEqual([0, 1]);
    for (const item of [0, 1]) for (const piece of clocks.get(item)!) expect(Number.isFinite(piece.shift)).toBe(true);
  });
});

describe('a closed cut inside a line', () => {
  // 'was tired' is cut from 'Alice was tired of sitting' and the gap closed: the words after it come 0.6 s sooner, so the shift is not constant.
  const base = docFromHeard(PARAS.slice(1, 2), answerOf(said('p-1', 'Alice was tired of sitting', 10)));
  const was = base.items[1];
  const tired = base.items[2];
  const cut: DocCut = { id: 'cut-1', a: was.t0!, b: tired.t1!, mode: 'close', keys: [was.key, tired.key], off0: was.off0!, off1: tired.off1! };
  const doc = docFromHeard(PARAS.slice(1, 2), answerOf(said('p-1', 'Alice was tired of sitting', 10)), { cuts: [cut] });
  const answer = answerOf(said('p-1', 'Alice was tired of sitting', 10));

  it('splits the item into a piece before the cut and a piece after it, at shifts 0.6 s apart', () => {
    const pieces = itemClocks(doc, answer).get(0)!;
    expect(pieces).toHaveLength(2);
    expect(pieces[0].shift - pieces[1].shift).toBeCloseTo(0.6, 2);
    expect(pieces[0].to).toBeLessThanOrEqual(pieces[1].from + 1e-9);
  });

  it('draws the words either side of the cut where they are heard, and the cut audio nowhere', () => {
    const l = ribbonLayout(doc, 'p-1', [], null)!;
    const clocks = itemClocks(doc, answer);
    const columns = (entry: WorkspacePeaks): PeakColumn[] => {
      const got = pickEntries(ready(entry), clocks, l.t0, l.t1, [0]);
      if (!('peaks' in got)) throw new Error(got.reason);
      return peaksWindowAll(got.peaks, l.t0, l.t1, 300)!;
    };
    // Only the cut words' audio (10.3 to 10.9) is loud: none of it is heard, so none of it is drawn.
    expect(Math.max(...columns(speechPeaks(9, 6, [[10.3, 10.9]], 127)).map((c) => c[1]))).toBeLessThan(127);
    // The kept words are loud: 'Alice' (10 to 10.3) where it starts, 'of sitting' (from 10.9) where the document has them, 0.6 s sooner than the file.
    const kept = columns(
      speechPeaks(
        9,
        6,
        [
          [10, 10.3],
          [10.9, 11.5],
        ],
        60,
      ),
    );
    const [alice, of] = [doc.items[0], doc.items.find((i) => i.text === 'of')!];
    expect(loudAt(kept, l.t0, l.t1, alice.t0! + 0.1, 50)).toBe(true);
    expect(loudAt(kept, l.t0, l.t1, of.t0! + 0.1, 50)).toBe(true);
    expect(of.t0).toBeCloseTo(10.9 - 10 + alice.t0! - 0.6, 2);
  });

  it('shows where it is approximate: with a pause before the next word, up to the runway of the cut audio is still drawn', () => {
    // The word after the cut is said 0.5 s after the cut ends in the file, so the piece before the cut cannot tell where the cut audio stops.
    const late = answerOf([...said('p-1', 'Alice was tired', 10), ...said('p-1', 'of sitting', 11.4, 0, 3)]);
    const lateBase = docFromHeard(PARAS.slice(1, 2), late);
    const c: DocCut = {
      id: 'c',
      a: lateBase.items[1].t0!,
      b: lateBase.items[2].t1!,
      mode: 'close',
      keys: [lateBase.items[1].key, lateBase.items[2].key],
      off0: lateBase.items[1].off0!,
      off1: lateBase.items[2].off1!,
    };
    const cutDoc = docFromHeard(PARAS.slice(1, 2), late, { cuts: [c] });
    const pieces = itemClocks(cutDoc, late).get(0)!;
    const alice = cutDoc.items[0];
    expect(pieces[0].to - alice.t1!).toBeLessThanOrEqual(0.35 + 1e-9);
    expect(pieces[0].to - alice.t1!).toBeGreaterThan(0.2);
  });
});

describe('the clock is required', () => {
  it('cannot window a raw entry: the type says it must be put on a clock first', () => {
    // @ts-expect-error a WorkspacePeaks is on the file's clock; peaksWindowAll takes DocPeaks
    const raw = () => peaksWindowAll([speechPeaks(0, 1, [])], 0, 1, 4);
    expect(raw).toBeTypeOf('function');
  });
  it('cannot pick entries without the item clocks', () => {
    // @ts-expect-error clocks is required
    const noClocks = () => pickEntries(ready(speechPeaks(0, 1, [])), 0, 1);
    expect(noClocks).toBeTypeOf('function');
  });
  it('has the same-clock helper for chapters that are their recording', () => {
    expect(sameClock([0, 2]).get(2)).toEqual([{ from: -Infinity, to: Infinity, shift: 0 }]);
  });
});
