import { describe, expect, it } from 'vitest';
import type { DocItem } from '../model';
import {
  clampSpan,
  coverage,
  dragCreate,
  moveEdge,
  moveSpan,
  nudgeEdge,
  nudgeStep,
  snapTo,
  spanOfKeys,
  stepBoundary,
  wordAtTime,
  wordBoundaries,
  wordsCovered,
  MIN_RANGE,
} from './rangeMath';

/** Four words: a 0.5 s word, a 0.5 s word, a 0.1 s gap, a 1 s word, then a cut word and a word that was not heard. */
const word = (key: string, t0: number | null, t1: number | null, extra: Partial<DocItem> = {}): DocItem =>
  ({ key, t0, t1, cut: undefined, st: 'ok', ...extra }) as unknown as DocItem;
const items = [
  word('p:0', 10, 10.5),
  word('p:1', 10.5, 11),
  word('p:2', 11.1, 12.1),
  word('p:3', 12.1, 12.4, { cut: 'c1' }),
  word('p:4', null, null, { st: 'miss' }),
];
const bounds = { start: 10, end: 14 };

describe('clampSpan', () => {
  it('keeps a span inside the bounds and at least the minimum wide', () => {
    expect(clampSpan({ start: 9, end: 11 }, bounds)).toEqual({ start: 10, end: 11 });
    expect(clampSpan({ start: 13, end: 15 }, bounds)).toEqual({ start: 13, end: 14 });
    expect(clampSpan({ start: 11, end: 11.01 }, bounds)).toEqual({ start: 11, end: 11 + MIN_RANGE });
    expect(clampSpan({ start: 13.99, end: 14 }, bounds)).toEqual({ start: 14 - MIN_RANGE, end: 14 });
  });
  it('is the whole bounds for a span that is wider, and never inverts', () => {
    expect(clampSpan({ start: 0, end: 99 }, bounds)).toEqual(bounds);
    expect(clampSpan({ start: 12, end: 11 }, bounds).end).toBeGreaterThan(clampSpan({ start: 12, end: 11 }, bounds).start);
  });
  it('is the bounds themselves when they are narrower than the minimum', () => {
    expect(clampSpan({ start: 1, end: 2 }, { start: 5, end: 5.02 })).toEqual({ start: 5, end: 5.02 });
  });
});

describe('dragCreate', () => {
  it('runs from where the pointer went down to where it is, either way', () => {
    expect(dragCreate(11, 12, bounds)).toEqual({ start: 11, end: 12 });
    expect(dragCreate(12, 11, bounds)).toEqual({ start: 11, end: 12 });
  });
  it('is the minimum wide from the anchor outward for a tap or a tiny drag', () => {
    expect(dragCreate(11, 11, bounds)).toEqual({ start: 11, end: 11 + MIN_RANGE });
    expect(dragCreate(11, 10.999, bounds)).toEqual({ start: 11 - MIN_RANGE, end: 11 });
  });
  it('clamps to the bounds when dragged past either end', () => {
    expect(dragCreate(12, 99, bounds)).toEqual({ start: 12, end: 14 });
    expect(dragCreate(12, -5, bounds)).toEqual({ start: 10, end: 12 });
  });
  it('starts at the end of the bounds without leaving them', () => {
    expect(dragCreate(14, 14, bounds)).toEqual({ start: 14 - MIN_RANGE, end: 14 });
    expect(dragCreate(10, 10, bounds)).toEqual({ start: 10, end: 10 + MIN_RANGE });
  });
});

describe('moveEdge', () => {
  const span = { start: 11, end: 12 };
  it('moves one edge and leaves the other', () => {
    expect(moveEdge(span, 'start', 11.4, bounds)).toEqual({ start: 11.4, end: 12 });
    expect(moveEdge(span, 'end', 12.5, bounds)).toEqual({ start: 11, end: 12.5 });
  });
  it('stops a minimum short of the other edge instead of crossing it', () => {
    expect(moveEdge(span, 'start', 12.5, bounds)).toEqual({ start: 12 - MIN_RANGE, end: 12 });
    expect(moveEdge(span, 'end', 10, bounds)).toEqual({ start: 11, end: 11 + MIN_RANGE });
  });
  it('stops at the bounds', () => {
    expect(moveEdge(span, 'start', -3, bounds)).toEqual({ start: 10, end: 12 });
    expect(moveEdge(span, 'end', 99, bounds)).toEqual({ start: 11, end: 14 });
  });
});

describe('moveSpan', () => {
  it('keeps the width and slides, stopping at either end of the bounds', () => {
    expect(moveSpan({ start: 11, end: 12 }, 0.5, bounds)).toEqual({ start: 11.5, end: 12.5 });
    expect(moveSpan({ start: 11, end: 12 }, -5, bounds)).toEqual({ start: 10, end: 11 });
    expect(moveSpan({ start: 11, end: 12 }, 5, bounds)).toEqual({ start: 13, end: 14 });
  });
});

describe('nudging', () => {
  it('steps by a hundredth of the view, at least 10 ms, ten times that with Shift', () => {
    expect(nudgeStep(1, false)).toBe(0.01);
    expect(nudgeStep(1, true)).toBe(0.1);
    expect(nudgeStep(30, false)).toBe(0.3);
    expect(nudgeStep(30, true)).toBe(3);
    expect(nudgeStep(0.2, false)).toBe(0.01);
  });
  it('moves an edge by a step either way and keeps the rules of moveEdge', () => {
    const span = { start: 11, end: 11.06 };
    expect(nudgeEdge(span, 'start', 1, 0.1, bounds)).toEqual({ start: 11.06 - MIN_RANGE, end: 11.06 });
    const moved = nudgeEdge(span, 'end', 1, 0.1, bounds);
    expect(moved.start).toBe(11);
    expect(moved.end).toBeCloseTo(11.16, 9);
    expect(nudgeEdge({ start: 10, end: 11 }, 'start', -1, 0.1, bounds)).toEqual({ start: 10, end: 11 });
  });
});

describe('snapping to word boundaries', () => {
  const edges = wordBoundaries(items);
  it('lists the start and end of every heard word that is not cut, once, in order', () => {
    expect(edges).toEqual([10, 10.5, 11, 11.1, 12.1]);
  });
  it('snaps a time to the nearest boundary, the earlier one on a tie', () => {
    expect(snapTo(edges, 10.2)).toBe(10);
    expect(snapTo(edges, 10.3)).toBe(10.5);
    expect(snapTo(edges, 10.75)).toBe(10.5);
    expect(snapTo(edges, 11.05)).toBe(11);
    expect(snapTo(edges, 99)).toBe(12.1);
    expect(snapTo([], 3)).toBe(3);
  });
  it('steps to the next boundary past a time in a direction, or stays at the last one', () => {
    expect(stepBoundary(edges, 10.5, 1)).toBe(11);
    expect(stepBoundary(edges, 10.6, -1)).toBe(10.5);
    expect(stepBoundary(edges, 12.1, 1)).toBe(12.1);
    expect(stepBoundary(edges, 10, -1)).toBe(10);
  });
});

describe('word coverage', () => {
  it('is the fraction of each heard word the span lies over', () => {
    const c = coverage(items, { start: 10.25, end: 11.05 });
    expect(c.map((x) => [x.key, Number(x.fraction.toFixed(2))])).toEqual([
      ['p:0', 0.5],
      ['p:1', 1],
    ]);
  });

  it('selects the words at least half covered, whole words first', () => {
    const got = wordsCovered(items, { start: 10, end: 11 });
    expect(got.keys).toEqual(['p:0', 'p:1']);
    expect(got.applied).toEqual({ start: 10, end: 11 });
    expect(got.start).toBeNull();
    expect(got.end).toBeNull();
  });

  it('reports the partial word an edge cuts through, and leaves a word under half out', () => {
    const got = wordsCovered(items, { start: 10.4, end: 11.15 });
    // p:0 is 20% covered (left out), p:1 whole, p:2 is 5% covered (left out)
    expect(got.keys).toEqual(['p:1']);
    expect(got.start).toEqual({ key: 'p:0', fraction: expect.closeTo(0.2, 6) });
    expect(got.end).toEqual({ key: 'p:2', fraction: expect.closeTo(0.05, 6) });
    expect(got.applied).toEqual({ start: 10.5, end: 11 });
  });

  it('takes a word with half or more of it covered at an edge, and still calls the edge partial', () => {
    const got = wordsCovered(items, { start: 10.2, end: 11.6 });
    expect(got.keys).toEqual(['p:0', 'p:1', 'p:2']);
    expect(got.start).toEqual({ key: 'p:0', fraction: expect.closeTo(0.6, 6) });
    expect(got.end).toEqual({ key: 'p:2', fraction: expect.closeTo(0.5, 6) });
    expect(got.applied).toEqual({ start: 10, end: 12.1 });
  });

  it('picks the word it lies over most when a span sits inside one word', () => {
    const got = wordsCovered(items, { start: 11.2, end: 11.4 });
    expect(got.keys).toEqual(['p:2']);
    expect(got.start).toEqual({ key: 'p:2', fraction: expect.closeTo(0.2, 6) });
    expect(got.end).toEqual({ key: 'p:2', fraction: expect.closeTo(0.2, 6) });
  });

  it('is no words for a span in a gap, past the words, over a cut word or over a word that was not heard', () => {
    expect(wordsCovered(items, { start: 11.02, end: 11.08 })).toMatchObject({ keys: [], applied: null, start: null, end: null });
    expect(wordsCovered(items, { start: 13, end: 14 }).keys).toEqual([]);
    expect(wordsCovered(items, { start: 12.15, end: 12.35 }).keys).toEqual([]);
  });

  it('gives a word with no length the span lies on or inside', () => {
    const blip = [word('b:0', 5, 5)];
    expect(wordsCovered(blip, { start: 4.9, end: 5.1 }).keys).toEqual(['b:0']);
    expect(wordsCovered(blip, { start: 5.2, end: 5.4 }).keys).toEqual([]);
  });

  it('is the span of the keys, the first start to the last end, ignoring words with no time', () => {
    expect(spanOfKeys(items, ['p:1', 'p:2'])).toEqual({ start: 10.5, end: 12.1 });
    expect(spanOfKeys(items, ['p:3', 'p:4'])).toBeNull();
    expect(spanOfKeys(items, [])).toBeNull();
  });
});

describe('wordAtTime', () => {
  it('is the audible word sounding at a time, the start of a word being in it and its end not', () => {
    expect(wordAtTime(items, 10.2)?.key).toBe('p:0');
    expect(wordAtTime(items, 10.5)?.key).toBe('p:1');
    expect(wordAtTime(items, 11)).toBeNull();
  });
  it('is null in a gap, over a cut or unheard word, and past the words; the last word includes its own end', () => {
    expect(wordAtTime(items, 11.05)).toBeNull();
    expect(wordAtTime(items, 12.2)).toBeNull();
    expect(wordAtTime(items, 12.1)?.key).toBe('p:2');
    expect(wordAtTime(items, 99)).toBeNull();
    expect(wordAtTime([word('a:0', 1, 2)], 2)?.key).toBe('a:0');
  });
});
