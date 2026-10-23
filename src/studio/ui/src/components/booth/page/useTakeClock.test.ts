// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTakeClock } from './useTakeClock';

// The take's timer is the wall clock's, not a count of ticks: a window that slept, or sat in the background where timers are throttled,
// shows the true time the moment it is looked at again (Booth pass 3, item M10).
describe('useTakeClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('reads 0 before a take and while it has just begun', () => {
    const { result, rerender } = renderHook(({ on }) => useTakeClock(on), { initialProps: { on: false } });
    expect(result.current.seconds).toBe(0);
    rerender({ on: true });
    expect(result.current.seconds).toBe(0);
    expect(result.current.read()).toBe(0);
  });

  it('counts the seconds that pass', () => {
    const { result } = renderHook(() => useTakeClock(true));
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current.seconds).toBe(3);
  });

  it('shows the true time after the machine slept: no ticks ran, the clock moved an hour', () => {
    const { result } = renderHook(() => useTakeClock(true));
    // Timers do not run while a machine sleeps; the wall clock does.
    vi.setSystemTime(Date.now() + 3600 * 1000);
    expect(result.current.read()).toBe(3600);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.seconds).toBe(3601);
  });

  it('shows the true time as soon as the window is looked at again, before the next tick', () => {
    const { result } = renderHook(() => useTakeClock(true));
    vi.setSystemTime(Date.now() + 95 * 1000);
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(result.current.seconds).toBe(95);
    vi.setSystemTime(Date.now() + 5 * 1000);
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.seconds).toBe(100);
  });

  it('never shows a negative time when the clock is set back', () => {
    const { result } = renderHook(() => useTakeClock(true));
    vi.setSystemTime(Date.now() - 10 * 60 * 1000);
    expect(result.current.read()).toBe(0);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current.seconds).toBe(0);
  });

  it('a three-hour take reads 3:00:00 worth of seconds', () => {
    const { result } = renderHook(() => useTakeClock(true));
    vi.setSystemTime(Date.now() + 3 * 3600 * 1000);
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(result.current.seconds).toBe(10800);
  });

  it('keeps the length of a take that ended, and starts the next from 0', () => {
    const { result, rerender } = renderHook(({ on }) => useTakeClock(on), { initialProps: { on: true } });
    act(() => void vi.advanceTimersByTime(7000));
    rerender({ on: false });
    expect(result.current.read()).toBe(7);
    vi.setSystemTime(Date.now() + 60 * 1000);
    expect(result.current.read()).toBe(7);
    rerender({ on: true });
    expect(result.current.seconds).toBe(0);
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current.seconds).toBe(2);
  });

  it('does not stop for a held take: the DAW goes on recording', () => {
    // There is no pause input at all: what the question holds is the reading, never the clock.
    const { result } = renderHook(() => useTakeClock(true));
    act(() => void vi.advanceTimersByTime(20_000));
    expect(result.current.seconds).toBe(20);
  });
});
