// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQuietWindow, QUIET_MS, useQuietWindow } from './quietWindow';

afterEach(() => vi.useRealTimers());

describe('the quiet window', () => {
  it('is open for QUIET_MS after start, then closed, and closes at once on reset', () => {
    vi.useFakeTimers();
    const quiet = createQuietWindow();
    expect(quiet.quiet()).toBe(false);
    quiet.start();
    expect(quiet.quiet()).toBe(true);
    vi.advanceTimersByTime(QUIET_MS - 1);
    expect(quiet.quiet()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(quiet.quiet()).toBe(false);
    quiet.start();
    quiet.reset();
    expect(quiet.quiet()).toBe(false);
  });

  it('takes its own length', () => {
    vi.useFakeTimers();
    const quiet = createQuietWindow(50);
    quiet.start();
    vi.advanceTimersByTime(50);
    expect(quiet.quiet()).toBe(false);
  });

  it('the hook keeps one window across renders and gives a new mount a closed one', () => {
    const first = renderHook(() => useQuietWindow());
    const held = first.result.current;
    held.start();
    first.rerender();
    expect(first.result.current).toBe(held);
    expect(first.result.current.quiet()).toBe(true);
    first.unmount();
    expect(renderHook(() => useQuietWindow()).result.current.quiet()).toBe(false);
  });
});
