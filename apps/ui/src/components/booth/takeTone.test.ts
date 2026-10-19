// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playTakeTone, readStoredTakeTone, TAKE_TONE_MS, TAKE_TONE_STORAGE_KEY, writeStoredTakeTone } from './takeTone';

const oscillator = { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
const gain = { gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() };
const close = vi.fn(async () => {});
const context = { currentTime: 0, destination: {}, createOscillator: () => oscillator, createGain: () => gain, close };

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return context;
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('the take tone preference', () => {
  it('is off until the narrator turns it on', () => {
    expect(readStoredTakeTone()).toBe(false);
    writeStoredTakeTone(true);
    expect(localStorage.getItem(TAKE_TONE_STORAGE_KEY)).toBe('on');
    expect(readStoredTakeTone()).toBe(true);
    writeStoredTakeTone(false);
    expect(readStoredTakeTone()).toBe(false);
  });

  it('reads as off when storage is unavailable', () => {
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredTakeTone()).toBe(false);
    blocked.mockRestore();
  });
});

describe('the tone before a take starts', () => {
  it('plays nothing and waits for nothing while it is off', async () => {
    await playTakeTone();
    expect(AudioContext).not.toHaveBeenCalled();
  });

  it('plays a short beep and resolves once it has finished, so the microphone opens after it', async () => {
    writeStoredTakeTone(true);
    let done = false;
    void playTakeTone().then(() => (done = true));
    expect(oscillator.start).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(TAKE_TONE_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
    expect(close).toHaveBeenCalled();
  });

  it('lets the take start when the browser has no audio or refuses it', async () => {
    writeStoredTakeTone(true);
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => {
        throw new Error('no audio');
      }),
    );
    await expect(playTakeTone()).resolves.toBeUndefined();
  });
});
