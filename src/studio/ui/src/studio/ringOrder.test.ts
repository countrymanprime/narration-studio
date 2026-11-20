import { describe, expect, it, vi } from 'vitest';
import { createRingPrefetch, ringOrder } from './ringOrder';

describe('ringOrder (#3658)', () => {
  it('reads the center, then next, previous, two ahead, two back, one ring at a time', () => {
    expect(ringOrder(10, 5)).toEqual([5, 6, 4, 7, 3, 8, 2, 9, 1, 0]);
  });

  it('bounds the walk by rings', () => {
    expect(ringOrder(10, 5, 1)).toEqual([5, 6, 4]);
    expect(ringOrder(10, 5, 2)).toEqual([5, 6, 4, 7, 3]);
    expect(ringOrder(10, 5, 0)).toEqual([5]);
  });

  it('keeps to the list at its ends and reads each index once', () => {
    expect(ringOrder(5, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(ringOrder(5, 4)).toEqual([4, 3, 2, 1, 0]);
    expect(ringOrder(2, 1, 5)).toEqual([1, 0]);
    expect(new Set(ringOrder(100, 37)).size).toBe(100);
  });

  it('gives nothing for an empty list, a center outside it, or a count or center that is not a whole number', () => {
    expect(ringOrder(0, 0)).toEqual([]);
    expect(ringOrder(5, 5)).toEqual([]);
    expect(ringOrder(5, -1)).toEqual([]);
    expect(ringOrder(Number.NaN, 0)).toEqual([]);
    expect(ringOrder(5, 1.5)).toEqual([]);
  });
});

function gated() {
  const reads: { index: number; resolve: () => void; reject: (reason: unknown) => void; signal: AbortSignal }[] = [];
  const load = vi.fn(
    (index: number, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        reads.push({ index, resolve, reject, signal });
      }),
  );
  return { reads, load };
}
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await tick();
};

describe('createRingPrefetch (#3658)', () => {
  it('reads one index at a time in ring order, and stops after the rings it was given', async () => {
    const { reads, load } = gated();
    const prefetch = createRingPrefetch({ count: () => 10, rings: 1, held: () => false, load });
    prefetch.move(5);
    await settle();
    expect(reads.map((read) => read.index)).toEqual([5]);
    reads[0]!.resolve();
    await settle();
    reads[1]!.resolve();
    await settle();
    reads[2]!.resolve();
    await settle();
    expect(reads.map((read) => read.index)).toEqual([5, 6, 4]);
    expect(load).toHaveBeenCalledTimes(3);
    prefetch.dispose();
  });

  it('skips what is held, including the center', async () => {
    const { reads, load } = gated();
    const held = new Set([5, 6]);
    const prefetch = createRingPrefetch({ count: () => 10, rings: 2, held: (index) => held.has(index), load });
    prefetch.move(5);
    for (let i = 0; i < 4; i += 1) {
      await settle();
      reads[i]?.resolve();
    }
    await settle();
    expect(reads.map((read) => read.index)).toEqual([4, 7, 3]);
    prefetch.dispose();
  });

  it('restarts from a new center and aborts the read in flight', async () => {
    const { reads, load } = gated();
    const prefetch = createRingPrefetch({ count: () => 10, rings: 1, held: () => false, load });
    prefetch.move(2);
    await settle();
    expect(reads[0]!.index).toBe(2);
    prefetch.move(8);
    expect(reads[0]!.signal.aborted).toBe(true);
    reads[0]!.resolve(); // the old read answers late; the walk it belonged to is over
    await settle();
    expect(reads[1]!.index).toBe(8);
    reads[1]!.resolve();
    await settle();
    expect(reads.map((read) => read.index)).toEqual([2, 8, 9]);
    prefetch.dispose();
  });

  it('skips a read that fails and carries on, and tries it again at the next move', async () => {
    const { reads, load } = gated();
    const prefetch = createRingPrefetch({ count: () => 5, rings: 1, held: () => false, load });
    prefetch.move(2);
    await settle();
    reads[0]!.reject(new Error('offline'));
    await settle();
    reads[1]!.resolve();
    await settle();
    reads[2]!.resolve();
    await settle();
    expect(reads.map((read) => read.index)).toEqual([2, 3, 1]);
    prefetch.move(2);
    await settle();
    expect(reads[3]!.index).toBe(2);
    prefetch.dispose();
  });

  it('starts nothing after dispose, and aborts what is in flight', async () => {
    const { reads, load } = gated();
    const prefetch = createRingPrefetch({ count: () => 10, rings: 3, held: () => false, load });
    prefetch.move(5);
    await settle();
    prefetch.dispose();
    expect(reads[0]!.signal.aborted).toBe(true);
    reads[0]!.resolve();
    await settle();
    prefetch.move(1);
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reads as many at once as concurrency says, never more', async () => {
    const { reads, load } = gated();
    const prefetch = createRingPrefetch({ count: () => 10, rings: 3, held: () => false, load, concurrency: 2 });
    prefetch.move(5);
    await settle();
    expect(reads.map((read) => read.index)).toEqual([5, 6]);
    prefetch.dispose();
  });

  it('walks the list as it is at each move (a list that grew or shrank)', async () => {
    const { reads, load } = gated();
    let size = 3;
    const prefetch = createRingPrefetch({ count: () => size, rings: 5, held: () => false, load });
    prefetch.move(0);
    await settle();
    size = 6;
    prefetch.move(4);
    await settle();
    expect(reads[reads.length - 1]!.index).toBe(4);
    prefetch.dispose();
  });
});
