// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStoredPreference, THEME_STORAGE_KEY } from './theme';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('readStoredPreference', () => {
  it('reads a stored preference, and falls back to system for anything else', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredPreference()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readStoredPreference()).toBe('system');
  });

  it('falls back to system when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(readStoredPreference()).toBe('system');
  });
});
