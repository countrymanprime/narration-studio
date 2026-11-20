// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ringOrder, useRingPrefetch } from './useRingPrefetch';

afterEach(cleanup);

const book = Array.from({ length: 9 }, (_, i) => `c-${i + 1}`);

/** A reader that takes `ms` a read and records the order, how many were out at once and what it keeps. */
function reader(ms = 5) {
  const seen = { order: [] as string[], most: 0, kept: new Set<string>() };
  let out = 0;
  const read = async (id: string) => {
    seen.order.push(id);
    out += 1;
    seen.most = Math.max(seen.most, out);
    await new Promise((resolve) => setTimeout(resolve, ms));
    out -= 1;
    seen.kept.add(id);
  };
  return { seen, read, kept: (id: string) => seen.kept.has(id) };
}

/** A reader whose reads end only when the test says so (`release`), with an error when one is given. */
function held() {
  const seen = { order: [] as string[], most: 0, kept: new Set<string>() };
  const ends = new Map<string, (error?: Error) => void>();
  let out = 0;
  const read = (id: string) =>
    new Promise<void>((resolve, reject) => {
      seen.order.push(id);
      out += 1;
      seen.most = Math.max(seen.most, out);
      ends.set(id, (error) => {
        out -= 1;
        if (error) reject(error);
        else {
          seen.kept.add(id);
          resolve();
        }
      });
    });
  return { seen, read, kept: (id: string) => seen.kept.has(id), release: (id: string, error?: Error) => ends.get(id)?.(error) };
}

describe('ringOrder', () => {
  it('goes outwards from the current one, the one after before the one before, to both ends', () => {
    expect(ringOrder(book, 'c-3')).toEqual(['c-3', 'c-4', 'c-2', 'c-5', 'c-1', 'c-6', 'c-7', 'c-8', 'c-9']);
    expect(ringOrder(book, 'c-1')).toEqual(book);
    expect(ringOrder(book, 'c-9')).toEqual([...book].reverse());
    expect(ringOrder(book, 'gone')).toEqual([]);
  });
});

describe('useRingPrefetch', () => {
  it('reads every id once, ring by ring, never two at once', async () => {
    const { seen, read, kept } = reader();
    renderHook(() => useRingPrefetch(book, 'c-5', { read, kept, gapMs: 1 }));
    await waitFor(() => expect(seen.order).toHaveLength(9));
    expect(seen.order).toEqual(['c-5', 'c-6', 'c-4', 'c-7', 'c-3', 'c-8', 'c-2', 'c-9', 'c-1']);
    expect(seen.most).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.order).toHaveLength(9);
  });

  it('starts again from the new place on a navigation, without reading again what is kept or two at once', async () => {
    const { seen, read, kept, release } = held();
    const view = renderHook(({ at }) => useRingPrefetch(book, at, { read, kept, gapMs: 1 }), { initialProps: { at: 'c-1' } });
    await waitFor(() => expect(seen.order).toEqual(['c-1']));
    release('c-1');
    await waitFor(() => expect(seen.order).toEqual(['c-1', 'c-2']));
    // A far jump while c-2's read is out: nothing is read for the new place until that read ends, and nothing more for the old one.
    view.rerender({ at: 'c-8' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.order).toEqual(['c-1', 'c-2']);
    release('c-2');
    for (const id of ['c-8', 'c-9', 'c-7', 'c-6', 'c-5', 'c-4', 'c-3']) {
      await waitFor(() => expect(seen.order.at(-1)).toBe(id));
      release(id);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.order).toEqual(['c-1', 'c-2', 'c-8', 'c-9', 'c-7', 'c-6', 'c-5', 'c-4', 'c-3']);
    expect(seen.most).toBe(1);
  });

  it('reads nothing on a navigation when every id is kept', async () => {
    const { seen, read, kept } = reader();
    const view = renderHook(({ at }) => useRingPrefetch(book, at, { read, kept, gapMs: 1 }), { initialProps: { at: 'c-5' } });
    await waitFor(() => expect(seen.order).toHaveLength(9));
    view.rerender({ at: 'c-2' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.order).toHaveLength(9);
  });

  it('stops when the caller has no room left, and reads the current one even then', async () => {
    const { seen, read, kept } = reader();
    const view = renderHook(({ at }) => useRingPrefetch(book, at, { read, kept, room: () => seen.kept.size < 3, gapMs: 1 }), { initialProps: { at: 'c-5' } });
    await waitFor(() => expect(seen.order).toEqual(['c-5', 'c-6', 'c-4']));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.order).toHaveLength(3);
    view.rerender({ at: 'c-1' });
    await waitFor(() => expect(seen.order).toEqual(['c-5', 'c-6', 'c-4', 'c-1']));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.order).toHaveLength(4);
  });

  it('goes on past a read that fails, and stops when the page closes', async () => {
    const { seen, read, release } = held();
    const view = renderHook(() => useRingPrefetch(book, 'c-5', { read, gapMs: 1 }));
    await waitFor(() => expect(seen.order).toEqual(['c-5']));
    release('c-5', new Error('Host busy.'));
    await waitFor(() => expect(seen.order).toEqual(['c-5', 'c-6']));
    view.unmount();
    release('c-6');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.order).toEqual(['c-5', 'c-6']);
  });

  it('reads nothing for a list of one, a current the list does not have, or none', async () => {
    const { seen, read } = reader();
    renderHook(() => useRingPrefetch(['only'], 'only', { read, gapMs: 1 }));
    renderHook(() => useRingPrefetch(book, 'gone', { read, gapMs: 1 }));
    renderHook(() => useRingPrefetch(book, undefined, { read, gapMs: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.order).toEqual([]);
  });
});
