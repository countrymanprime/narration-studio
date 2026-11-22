import { describe, expect, it } from 'vitest';
import { clamp } from './clamp';

describe('clamp', () => {
  it('returns a value inside the bounds unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
  it('raises a value below the range to low', () => expect(clamp(-3, 0, 10)).toBe(0));
  it('lowers a value above the range to high', () => expect(clamp(12.5, 0, 10)).toBe(10));
  it('returns the bound when both bounds are equal', () => {
    expect(clamp(-1, 4, 4)).toBe(4);
    expect(clamp(9, 4, 4)).toBe(4);
  });
  it('returns low when low is above high, so an empty range gives its start', () => {
    expect(clamp(5, 0, -1)).toBe(0);
    expect(clamp(-5, 0, -1)).toBe(0);
    expect(clamp(5, 3, 1)).toBe(3);
  });
  it('gives NaN for NaN, whatever the bounds', () => {
    expect(clamp(Number.NaN, 0, 10)).toBeNaN();
    expect(clamp(Number.NaN, 3, 1)).toBeNaN();
  });
  it('holds infinities to the bounds', () => {
    expect(clamp(Number.POSITIVE_INFINITY, 0, 10)).toBe(10);
    expect(clamp(Number.NEGATIVE_INFINITY, 0, 10)).toBe(0);
    expect(clamp(7, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(7);
  });
});
