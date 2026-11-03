// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBrowserSettingsVersion } from '../../../browserSettings';
import { BOOTH_SIZE_STORAGE_KEY, DEFAULT_BOOTH_SIZE, readBoothSize, writeBoothSize } from './boothSize';
import { useTextChoices } from './useTextChoices';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('the Booth text size shared with Settings', () => {
  it('is 40 until chosen, and a stored value that is not a size is the default', () => {
    expect(readBoothSize()).toBe(DEFAULT_BOOTH_SIZE);
    for (const bad of ['31', '0', '-8', 'abc', '1e3', '9999', '', 'NaN']) {
      localStorage.setItem(BOOTH_SIZE_STORAGE_KEY, bad);
      expect(readBoothSize(), bad).toBe(DEFAULT_BOOTH_SIZE);
    }
  });

  it('is announced when the Booth changes it, so a mounted Settings page marks the row Changed', () => {
    const seen: number[] = [];
    let setSize: (size: number) => void = () => {};
    function Probe() {
      seen.push(useBrowserSettingsVersion());
      setSize = useTextChoices().setSize;
      return null;
    }
    render(<Probe />);
    const before = seen[seen.length - 1]!;
    act(() => setSize(56));
    expect(localStorage.getItem(BOOTH_SIZE_STORAGE_KEY)).toBe('56');
    expect(seen[seen.length - 1]).toBeGreaterThan(before);
  });

  it('keeps going when storage throws', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(() => writeBoothSize(48)).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
