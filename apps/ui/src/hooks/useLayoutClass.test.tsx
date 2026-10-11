// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { LAYOUT_QUERIES, layoutClassFor } from '../layoutBreakpoints';
import { useLayoutClass } from './useLayoutClass';

type Listener = () => void;

// A matchMedia fake over a settable window width that evaluates the `(max-width: Npx)` queries.
function installMatchMedia(initial: number) {
  let width = initial;
  const listeners = new Map<string, Set<Listener>>();
  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return width <= Number(/(\d+)px/.exec(query)?.[1]);
    },
    media: query,
    addEventListener: (_: string, fn: Listener) => {
      const set = listeners.get(query) ?? new Set<Listener>();
      set.add(fn);
      listeners.set(query, set);
    },
    removeEventListener: (_: string, fn: Listener) => listeners.get(query)?.delete(fn),
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true });
  return {
    resize(next: number) {
      width = next;
      act(() => listeners.forEach((set) => set.forEach((fn) => fn())));
    },
    count: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('useLayoutClass', () => {
  test('hook-follows-the-window', () => {
    const mm = installMatchMedia(1400);
    const { result, unmount } = renderHook(() => useLayoutClass());
    expect(result.current).toEqual(layoutClassFor(1400));
    mm.resize(1100);
    expect(result.current).toEqual(layoutClassFor(1100));
    mm.resize(800);
    expect(result.current).toEqual(layoutClassFor(800));
    expect(mm.count()).toBe(Object.keys(LAYOUT_QUERIES).length);
    unmount();
    expect(mm.count()).toBe(0);
  });

  test('hook-falls-back-to-the-full-layout-without-matchMedia', () => {
    Reflect.deleteProperty(window, 'matchMedia');
    const { result } = renderHook(() => useLayoutClass());
    expect(result.current).toEqual({ railCollapsed: false, medium: false, narrow: false, tiny: false });
  });

  test('hook-reads-css-width-not-zoom', () => {
    const source = readFileSync(join(__dirname, 'useLayoutClass.ts'), 'utf8');
    expect(source).not.toContain('style.zoom');
    expect(source).not.toContain('clientWidth');
  });
});
