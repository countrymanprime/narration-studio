// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAKE_TONE_STORAGE_KEY } from '../../booth/takeTone';
import { TakeToneRowBody } from './TakeToneBody';

const start = vi.fn();
beforeEach(() => {
  localStorage.clear();
  start.mockClear();
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return {
        currentTime: 0,
        destination: {},
        createOscillator: () => ({ frequency: {}, connect: () => {}, start, stop: () => {} }),
        createGain: () => ({ gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {} }),
        close: async () => {},
      };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the start tone setting', () => {
  it('is off by default', () => {
    render(<TakeToneRowBody />);
    expect(screen.getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('true');
  });

  it('turning it on keeps the choice and plays the tone once so it can be heard', async () => {
    render(<TakeToneRowBody />);
    await userEvent.click(screen.getByRole('radio', { name: 'On' }));
    expect(localStorage.getItem(TAKE_TONE_STORAGE_KEY)).toBe('on');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('turning it off keeps the choice and plays nothing', async () => {
    localStorage.setItem(TAKE_TONE_STORAGE_KEY, 'on');
    render(<TakeToneRowBody />);
    await userEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(localStorage.getItem(TAKE_TONE_STORAGE_KEY)).toBe('off');
    expect(start).not.toHaveBeenCalled();
  });
});
