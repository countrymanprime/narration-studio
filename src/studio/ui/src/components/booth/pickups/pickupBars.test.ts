import { describe, expect, it } from 'vitest';
import type { PickupItem } from '../../../api/contracts/pickups';
import { boothUnits } from '../reading/boothUnits';
import { nextLine, openCount, pickupBars, ranOver, sessionLines } from './pickupBars';

const line = (id: string, chapterId: string, paragraphId: string | null, done = false, extra: Partial<PickupItem> = {}): PickupItem => ({
  id,
  chapterId,
  paragraphId,
  paragraph: null,
  time: null,
  at: null,
  type: 'misread',
  script: `line ${id}`,
  context: '',
  source: 'you',
  confidence: null,
  confReason: '',
  included: true,
  done,
  waiting: false,
  ...extra,
});

const LIST = [line('a', 'c3', 'p1'), line('b', 'c3', 'p2', true), line('c', 'c3', 'p4'), line('d', 'c5', 'q1'), line('e', 'c3', 'p9')];
const PARAGRAPHS = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, text: `Text of ${id}.` }));

describe('sessionLines', () => {
  it('keeps the session order and drops ids the list no longer has', () => {
    expect(sessionLines(LIST, ['c', 'zz', 'a']).map((l) => l.id)).toEqual(['c', 'a']);
  });
});

describe('pickupBars', () => {
  it('bars the paragraphs of this chapter, done or open, and leaves other chapters and unplaced lines out', () => {
    const lines = sessionLines([...LIST, line('f', 'c3', null)], ['a', 'b', 'c', 'd', 'f']);
    expect(pickupBars(lines, 'c3')).toEqual([
      { paragraphId: 'p1', done: false },
      { paragraphId: 'p2', done: true },
      { paragraphId: 'p4', done: false },
    ]);
  });
});

describe('openCount', () => {
  it('counts the lines not done', () => {
    expect(openCount(sessionLines(LIST, ['a', 'b', 'c']))).toBe(2);
  });
});

describe('nextLine', () => {
  const lines = sessionLines(LIST, ['a', 'c', 'd']);
  it('goes forward across chapters and wraps', () => {
    expect(nextLine(lines, 'a', 1)?.id).toBe('c');
    expect(nextLine(lines, 'c', 1)?.id).toBe('d');
    expect(nextLine(lines, 'd', 1)?.id).toBe('a');
  });
  it('goes back and wraps', () => {
    expect(nextLine(lines, 'd', -1)?.id).toBe('c');
    expect(nextLine(lines, 'a', -1)?.id).toBe('d');
  });
  it('starts at the first (or last) line when none is current, and is nothing without lines', () => {
    expect(nextLine(lines, null, 1)?.id).toBe('a');
    expect(nextLine(lines, null, -1)?.id).toBe('d');
    expect(nextLine([], null, 1)).toBeUndefined();
  });
});

describe('ranOver', () => {
  const units = boothUnits(PARAGRAPHS);
  const lines = sessionLines(LIST, ['a', 'b', 'c', 'd']);
  it('is the open lines of this chapter between where the take began and where it stopped', () => {
    expect(ranOver(lines, 'c3', units, 0, 2)).toEqual(['a']);
    expect(ranOver(lines, 'c3', units, 0, 3)).toEqual(['a', 'c']);
  });
  it('counts a take that began after it stopped (punched back) the same way, and leaves a line it stopped before open', () => {
    expect(ranOver(lines, 'c3', units, 3, 0)).toEqual(['a', 'c']);
    expect(ranOver(lines, 'c3', units, 1, 1)).toEqual([]);
  });
  it('ignores a line whose paragraph is not in the text', () => {
    expect(ranOver(sessionLines(LIST, ['e']), 'c3', units, 0, 3)).toEqual([]);
  });
});
