// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_HIGHLIGHT_CLASSES, JUST_CHANGED_MS, useJustChanged } from './changeHighlight';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useJustChanged', () => {
  it('flags nothing until something changes', () => {
    const { result } = renderHook(() => useJustChanged());
    expect(result.current.changed).toBeNull();
  });

  it('flags the item an action changed, then clears it', () => {
    const { result } = renderHook(() => useJustChanged());
    act(() => result.current.mark('chapter-2'));
    expect(result.current.changed).toBe('chapter-2');
    act(() => void vi.advanceTimersByTime(JUST_CHANGED_MS));
    expect(result.current.changed).toBeNull();
  });

  it('moves the flag to the latest change and restarts its time', () => {
    const { result } = renderHook(() => useJustChanged());
    act(() => result.current.mark('a'));
    act(() => void vi.advanceTimersByTime(JUST_CHANGED_MS - 100));
    act(() => result.current.mark('b'));
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current.changed).toBe('b');
  });

  it('leaves no timer running after unmount', () => {
    const { result, unmount } = renderHook(() => useJustChanged());
    act(() => result.current.mark('a'));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('CHANGE_HIGHLIGHT_CLASSES', () => {
  it('fades only under motion-ok and holds a still tint under reduced motion', () => {
    expect(CHANGE_HIGHLIGHT_CLASSES).toContain('motion-ok:animate-[change-highlight_var(--motion-highlight)');
    expect(CHANGE_HIGHLIGHT_CLASSES).toContain('motion-still:bg-[var(--accent-soft)]');
  });
});
