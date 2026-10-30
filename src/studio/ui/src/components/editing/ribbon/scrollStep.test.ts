// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { clampScrollStep, readScrollStep, SCROLL_STEP_DEFAULT, SCROLL_STEP_MAX, SCROLL_STEP_MIN, SCROLL_STEP_STORAGE_KEY, writeScrollStep } from './scrollStep';

afterEach(() => localStorage.clear());

describe("the waveform arrows' step", () => {
  it('is 20 seconds until the narrator chooses another', () => {
    expect(SCROLL_STEP_DEFAULT).toBe(20);
    expect(readScrollStep()).toBe(20);
  });

  it('keeps a chosen step between 15 and 30 seconds', () => {
    writeScrollStep(25);
    expect(readScrollStep()).toBe(25);
    writeScrollStep(5);
    expect(readScrollStep()).toBe(SCROLL_STEP_MIN);
    writeScrollStep(90);
    expect(readScrollStep()).toBe(SCROLL_STEP_MAX);
  });

  it('reads anything unusable as the default', () => {
    for (const bad of ['', 'soon', 'NaN', 'Infinity']) {
      localStorage.setItem(SCROLL_STEP_STORAGE_KEY, bad);
      expect(readScrollStep()).toBe(20);
    }
    expect(clampScrollStep(Number.NaN)).toBe(20);
  });

  it('falls back to the default when storage is blocked', () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(readScrollStep()).toBe(20);
    } finally {
      Storage.prototype.getItem = real;
    }
  });
});
