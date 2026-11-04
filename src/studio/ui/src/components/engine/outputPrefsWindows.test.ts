// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OUTPUT_STORAGE_KEY, useOutputPrefs } from './outputPrefs';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const stored = () => JSON.parse(localStorage.getItem(OUTPUT_STORAGE_KEY) ?? 'null') as Record<string, unknown>;

describe('the playback choices shared by two windows (qa-breaker B1)', () => {
  it('a change keeps what another window stored meanwhile, writing only the field changed', () => {
    const { result } = renderHook(() => useOutputPrefs());
    localStorage.setItem(OUTPUT_STORAGE_KEY, JSON.stringify({ volume: 100, muted: false, rate: 2, device: 'Headphones' }));
    act(() => result.current.change({ muted: true }));
    expect(stored()).toEqual({ volume: 100, muted: true, rate: 2, device: 'Headphones' });
  });

  it('shows what another window stored when the browser says storage changed', () => {
    const { result } = renderHook(() => useOutputPrefs());
    expect(result.current.prefs.rate).toBe(1);
    localStorage.setItem(OUTPUT_STORAGE_KEY, JSON.stringify({ volume: 100, muted: false, rate: 2, device: '' }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: OUTPUT_STORAGE_KEY }));
    });
    expect(result.current.prefs.rate).toBe(2);
  });
});
