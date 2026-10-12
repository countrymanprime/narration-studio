// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEXT_PREFS, fontStack, loadTextPrefs, readerVars, saveTextPrefs, TEXT_PREFS_STORAGE_KEY, widthName, type TextPrefs } from './readerText';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const prefs: TextPrefs = { font: 'Verdana', size: 24, spacing: 2, width: 80 };

describe('readerVars', () => {
  it('maps the choices to the reader custom properties', () => {
    expect(readerVars(prefs)).toEqual({ '--rs': 24, '--rl': 2, '--rw': 80, '--rf': 'Verdana, Geneva, sans-serif' });
  });

  it('is pure: the same input gives an equal value and the input is untouched', () => {
    const copy = { ...prefs };
    expect(readerVars(prefs)).toEqual(readerVars(prefs));
    expect(prefs).toEqual(copy);
  });

  it('falls back to the first font for a name it does not list', () => {
    expect(fontStack('Comic Nowhere')).toBe(fontStack(DEFAULT_TEXT_PREFS.font));
  });
});

describe('widthName', () => {
  it('names the listed widths and calls any other Custom', () => {
    expect(widthName(48)).toBe('Narrow');
    expect(widthName(100)).toBe('Full');
    expect(widthName(55)).toBe('Custom');
  });
});

describe('storage', () => {
  it('round-trips the choices', () => {
    saveTextPrefs(prefs);
    expect(loadTextPrefs()).toEqual(prefs);
  });

  it('starts from the defaults with nothing stored', () => {
    expect(loadTextPrefs()).toEqual(DEFAULT_TEXT_PREFS);
  });

  it('takes the default for each field that is not a listed choice, and for stored junk', () => {
    window.localStorage.setItem(TEXT_PREFS_STORAGE_KEY, JSON.stringify({ font: 'Nope', size: 21, spacing: 9, width: 'wide' }));
    expect(loadTextPrefs()).toEqual(DEFAULT_TEXT_PREFS);
    window.localStorage.setItem(TEXT_PREFS_STORAGE_KEY, '{not json');
    expect(loadTextPrefs()).toEqual(DEFAULT_TEXT_PREFS);
    window.localStorage.setItem(TEXT_PREFS_STORAGE_KEY, 'null');
    expect(loadTextPrefs()).toEqual(DEFAULT_TEXT_PREFS);
  });

  it('keeps the valid fields when only some are wrong', () => {
    window.localStorage.setItem(TEXT_PREFS_STORAGE_KEY, JSON.stringify({ font: 'Arial', size: 99 }));
    expect(loadTextPrefs()).toEqual({ ...DEFAULT_TEXT_PREFS, font: 'Arial' });
  });

  it('renders with the defaults when storage throws, and saving does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(loadTextPrefs()).toEqual(DEFAULT_TEXT_PREFS);
    expect(() => saveTextPrefs(prefs)).not.toThrow();
  });
});
