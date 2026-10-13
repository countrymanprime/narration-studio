import { describe, expect, it } from 'vitest';
import { openPickupsBeyondNotes, proofProgress } from './proof.selectors';

describe('proofProgress (one definition of cleared, ADR 0793)', () => {
  it('reports decided, cleared and total as the host counted them, and open as what is not cleared', () => {
    expect(proofProgress({ total: 10, decided: 6, cleared: 4 }, 0)).toEqual({ decided: 6, cleared: 4, total: 10, open: 6, percent: 40 });
  });

  it('counts an open pickup as open and keeps the percent below 100', () => {
    const progress = proofProgress({ total: 4, decided: 4, cleared: 4 }, 1);
    expect(progress.open).toBe(1);
    expect(progress.percent).toBe(99);
  });

  it('reads 100 only when nothing is open and no pickup is open', () => {
    expect(proofProgress({ total: 4, decided: 4, cleared: 4 }, 0).percent).toBe(100);
    expect(proofProgress({ total: 4, decided: 4, cleared: 3 }, 0).percent).toBe(75);
  });

  it('is 0 for an empty queue, without dividing by zero', () => {
    expect(proofProgress({ total: 0, decided: 0, cleared: 0 }, 0)).toEqual({ decided: 0, cleared: 0, total: 0, open: 0, percent: 0 });
  });
});

describe('openPickupsBeyondNotes', () => {
  const pickups = [
    { chapterId: 'c1', done: false },
    { chapterId: 'c1', done: false, findingId: 'f1' },
    { chapterId: 'c1', done: true },
    { chapterId: 'c2', done: false },
  ];

  it('counts the open pickups no note stands for, in the book or one chapter', () => {
    expect(openPickupsBeyondNotes(pickups)).toBe(2);
    expect(openPickupsBeyondNotes(pickups, 'c1')).toBe(1);
    expect(openPickupsBeyondNotes(pickups, 'c3')).toBe(0);
  });
});
