import { describe, expect, it } from 'vitest';
import { restAt } from './useBrowseView';

describe('where the word being read rests in the box', () => {
  it('is 40% down when the box has room, whatever the word size', () => {
    expect(restAt(800, 48)).toBe(320);
    expect(restAt(800, 108)).toBe(320);
  });

  it('rises so the word shows whole when the box is short (a notice above the footer, a small window, Text size 72)', () => {
    // 190 px box, 72 px text on a 108 px line: 40% down would put the word's bottom at 76 + 108 = 184, past the 8 px edge.
    expect(restAt(190, 108)).toBe(74);
    expect(restAt(100, 47)).toBe(40);
    expect(restAt(100, 47) + 47 + 8).toBeLessThanOrEqual(100);
  });

  it('never goes above the top of the box, even when the word is taller than the box', () => {
    expect(restAt(60, 108)).toBe(0);
    expect(restAt(0, 40)).toBe(0);
  });
});
