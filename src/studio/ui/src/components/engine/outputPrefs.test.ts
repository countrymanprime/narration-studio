// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyOutput, DEFAULT_OUTPUT, OUTPUT_STORAGE_KEY, rateLabel, readOutputPrefs } from './outputPrefs';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('readOutputPrefs', () => {
  it('reads the defaults with nothing stored', () => {
    expect(readOutputPrefs()).toEqual(DEFAULT_OUTPUT);
  });

  it('keeps a valid entry', () => {
    localStorage.setItem(OUTPUT_STORAGE_KEY, JSON.stringify({ volume: 40, muted: true, rate: 1.25, device: 'Studio monitors' }));
    expect(readOutputPrefs()).toEqual({ volume: 40, muted: true, rate: 1.25, device: 'Studio monitors' });
  });

  it.each([
    ['not JSON', '{nope'],
    ['null', 'null'],
    ['a number', '7'],
    ['an array', '[1]'],
  ])('falls back to the defaults for %s', (_name, raw) => {
    localStorage.setItem(OUTPUT_STORAGE_KEY, raw);
    expect(readOutputPrefs()).toEqual(DEFAULT_OUTPUT);
  });

  it('repairs each bad field on its own', () => {
    localStorage.setItem(OUTPUT_STORAGE_KEY, JSON.stringify({ volume: 900, muted: 'yes', rate: 3, device: 5 }));
    expect(readOutputPrefs()).toEqual({ ...DEFAULT_OUTPUT, volume: 100 });
    localStorage.setItem(OUTPUT_STORAGE_KEY, JSON.stringify({ volume: -5.4 }));
    expect(readOutputPrefs().volume).toBe(0);
    localStorage.setItem(OUTPUT_STORAGE_KEY, JSON.stringify({ volume: null }));
    expect(readOutputPrefs().volume).toBe(100);
  });

  it('reads the defaults when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readOutputPrefs()).toEqual(DEFAULT_OUTPUT);
  });
});

describe('applyOutput', () => {
  it('sets the volume as a fraction, mute, and the speed with the pitch kept', () => {
    const el = document.createElement('audio');
    applyOutput(el, { volume: 35, muted: true, rate: 1.5 });
    expect(el.volume).toBeCloseTo(0.35);
    expect(el.muted).toBe(true);
    expect(el.playbackRate).toBe(1.5);
    expect(el.defaultPlaybackRate).toBe(1.5);
    expect(el.preservesPitch).toBe(true);
  });
});

describe('rateLabel', () => {
  it('writes the speed without a trailing zero', () => {
    expect([1, 1.25, 0.75, 2].map(rateLabel)).toEqual(['1×', '1.25×', '0.75×', '2×']);
  });
});
