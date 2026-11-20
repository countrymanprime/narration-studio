// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEntrySelection } from './useEntrySelection';

const ORDER = ['a', 'b', 'c', 'd', 'e'];

describe('useEntrySelection', () => {
  it('starts empty, ticks and unticks one entry, and reports the ticks in the list order', () => {
    const { result } = renderHook(() => useEntrySelection(ORDER));
    expect(result.current.ids).toEqual([]);
    act(() => result.current.toggle('c'));
    act(() => result.current.toggle('a'));
    expect(result.current.ids).toEqual(['a', 'c']);
    expect(result.current.has('c')).toBe(true);
    act(() => result.current.toggle('c'));
    expect(result.current.ids).toEqual(['a']);
  });

  it('ticks a range from the last entry pressed, in either direction, and unticks a range the same way', () => {
    const { result } = renderHook(() => useEntrySelection(ORDER));
    act(() => result.current.toggle('b'));
    act(() => result.current.toggle('d', true));
    expect(result.current.ids).toEqual(['b', 'c', 'd']);
    act(() => result.current.toggle('a', true));
    expect(result.current.ids, 'a range up to an unticked entry ticks it').toEqual(['a', 'b', 'c', 'd']);
    act(() => result.current.toggle('c'));
    act(() => result.current.toggle('a', true));
    expect(result.current.ids, 'a range ending on a ticked entry unticks all of it').toEqual(['d']);
  });

  it('a range with no entry pressed before it is one tick', () => {
    const { result } = renderHook(() => useEntrySelection(ORDER));
    act(() => result.current.toggle('d', true));
    expect(result.current.ids).toEqual(['d']);
  });

  it('ticks every entry in the list, or none, and clears', () => {
    const { result } = renderHook(() => useEntrySelection(ORDER));
    act(() => result.current.setAll(true));
    expect(result.current.ids).toEqual(ORDER);
    act(() => result.current.setAll(false));
    expect(result.current.ids).toEqual([]);
    act(() => result.current.toggle('b'));
    act(() => result.current.clear());
    expect(result.current.ids).toEqual([]);
  });

  it('counts only the entries the list has now: a filter that hides a ticked entry drops it, and an entry deleted is gone', () => {
    const { result, rerender } = renderHook(({ order }) => useEntrySelection(order), { initialProps: { order: ORDER } });
    act(() => result.current.setAll(true));
    rerender({ order: ['a', 'c', 'e'] });
    expect(result.current.ids).toEqual(['a', 'c', 'e']);
    // The next press builds from what is on screen, so a hidden tick does not come back when the filter is cleared.
    act(() => result.current.toggle('a'));
    rerender({ order: ORDER });
    expect(result.current.ids).toEqual(['c', 'e']);
  });

  it('survives an empty list and an id the list does not have', () => {
    const { result } = renderHook(() => useEntrySelection([]));
    act(() => result.current.toggle('x', true));
    expect(result.current.ids).toEqual([]);
    act(() => result.current.setAll(true));
    expect(result.current.ids).toEqual([]);
  });

  it('forgets a tick the list hides, so clearing the filter does not bring it back', () => {
    const { result, rerender } = renderHook(({ order }) => useEntrySelection(order), { initialProps: { order: ORDER } });
    act(() => result.current.toggle('a'));
    rerender({ order: ['b', 'c'] });
    rerender({ order: ORDER });
    expect(result.current.ids).toEqual([]);
  });
});
