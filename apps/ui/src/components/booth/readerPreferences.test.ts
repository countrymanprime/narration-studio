// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FLAG_VISIBILITY } from './readerFlags';
import { FLAG_STORAGE_KEY, loadFlagVisibility } from './readerPreferences';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('read-aloud flag visibility preferences', () => {
  it('starts from the owner default and reads a stored choice', () => {
    expect(loadFlagVisibility()).toEqual(DEFAULT_FLAG_VISIBILITY);
    window.localStorage.setItem(FLAG_STORAGE_KEY, JSON.stringify({ ...DEFAULT_FLAG_VISIBILITY, misread: true }));
    expect(loadFlagVisibility()).toEqual({ ...DEFAULT_FLAG_VISIBILITY, misread: true });
  });

  it('takes the default for any kind that is missing or not a boolean, and for garbage', () => {
    window.localStorage.setItem(FLAG_STORAGE_KEY, JSON.stringify({ extra: true, skipped: 'no' }));
    expect(loadFlagVisibility()).toEqual({ ...DEFAULT_FLAG_VISIBILITY, extra: true });
    window.localStorage.setItem(FLAG_STORAGE_KEY, '[1, 2');
    expect(loadFlagVisibility()).toEqual(DEFAULT_FLAG_VISIBILITY);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadFlagVisibility()).toEqual(DEFAULT_FLAG_VISIBILITY);
  });
});
