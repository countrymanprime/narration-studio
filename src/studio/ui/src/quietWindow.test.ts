import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQuietWindow, QUIET_MS } from './quietWindow';

afterEach(() => vi.useRealTimers());

describe('the quiet window', () => {
  it('is open for QUIET_MS after start, then closed, and closes at once on reset', () => {
    vi.useFakeTimers();
    const window = createQuietWindow();
    expect(window.quiet()).toBe(false);
    window.start();
    expect(window.quiet()).toBe(true);
    vi.advanceTimersByTime(QUIET_MS - 1);
    expect(window.quiet()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(window.quiet()).toBe(false);
    window.start();
    window.reset();
    expect(window.quiet()).toBe(false);
  });

  it('takes its own length', () => {
    vi.useFakeTimers();
    const window = createQuietWindow(50);
    window.start();
    vi.advanceTimersByTime(50);
    expect(window.quiet()).toBe(false);
  });
});
