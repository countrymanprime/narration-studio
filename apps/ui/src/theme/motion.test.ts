// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { motionReduced, REDUCED_MOTION_QUERY, syncMotionAttribute } from './motion';

// A matchMedia that answers for the reduced-motion query and lets a test flip the preference, as Windows' "Show animations" switch does.
function fakeWindow(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const queries: string[] = [];
  const media = {
    matches: initial,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  };
  const win = {
    matchMedia: (query: string) => {
      queries.push(query);
      return media;
    },
  } as unknown as Window;
  const set = (matches: boolean) => {
    media.matches = matches;
    for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
  };
  return { win, set, listeners, queries };
}

afterEach(() => document.documentElement.removeAttribute('data-motion'));

describe('syncMotionAttribute', () => {
  it('sets data-motion="reduce" when the preference is reduce, and nothing otherwise', () => {
    const reduce = fakeWindow(true);
    const root = document.createElement('html');
    syncMotionAttribute(root, reduce.win);
    expect(root.getAttribute('data-motion')).toBe('reduce');
    expect(reduce.queries).toEqual([REDUCED_MOTION_QUERY]);

    const normal = fakeWindow(false);
    const other = document.createElement('html');
    syncMotionAttribute(other, normal.win);
    expect(other.hasAttribute('data-motion')).toBe(false);
  });

  it('follows the preference when it changes, in both directions', () => {
    const { win, set } = fakeWindow(false);
    const root = document.createElement('html');
    syncMotionAttribute(root, win);
    set(true);
    expect(root.getAttribute('data-motion')).toBe('reduce');
    set(false);
    expect(root.hasAttribute('data-motion')).toBe(false);
  });

  it('stops listening when the returned function is called', () => {
    const { win, set, listeners } = fakeWindow(false);
    const root = document.createElement('html');
    const stop = syncMotionAttribute(root, win);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
    set(true);
    expect(root.hasAttribute('data-motion')).toBe(false);
  });

  it('never removes a data-motion="reduce" it did not set', () => {
    const { win, set } = fakeWindow(false);
    const root = document.createElement('html');
    root.setAttribute('data-motion', 'reduce');
    syncMotionAttribute(root, win);
    expect(root.getAttribute('data-motion')).toBe('reduce');
    set(true);
    set(false);
    expect(root.hasAttribute('data-motion')).toBe(false); // it took ownership when Windows asked, and gives it back when Windows stops
    root.setAttribute('data-motion', 'reduce');
    set(false);
    expect(root.getAttribute('data-motion')).toBe('reduce');
  });

  it('leaves the attribute alone where there is no matchMedia', () => {
    const root = document.createElement('html');
    root.setAttribute('data-motion', 'reduce');
    const stop = syncMotionAttribute(root, {} as Window);
    expect(root.getAttribute('data-motion')).toBe('reduce');
    expect(stop()).toBeUndefined();
  });
});

describe('motionReduced', () => {
  const stubMatchMedia = (matches: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === REDUCED_MOTION_QUERY && matches }));
  afterEach(() => vi.unstubAllGlobals());

  it('is true when Windows asks for reduced motion, or when <html> says reduce', () => {
    stubMatchMedia(false);
    expect(motionReduced()).toBe(false);
    document.documentElement.setAttribute('data-motion', 'reduce');
    expect(motionReduced()).toBe(true);
    document.documentElement.removeAttribute('data-motion');
    stubMatchMedia(true);
    expect(motionReduced()).toBe(true);
  });
});
