import { describe, expect, it } from 'vitest';
import {
  BAR_GAP,
  BAR_WIDTH,
  MAX_EXTRAPOLATE_MS,
  MIN_BAR_HEIGHT,
  PEAK_HEADROOM,
  barLayout,
  barPosition,
  DISPLAY_RANGE_DB,
  halfHeight,
  levelOf,
  playheadAt,
} from './ribbonBars';

describe('barLayout', () => {
  it('fills the width exactly: the first bar starts at 0 and the last ends at the width', () => {
    for (const width of [120, 333, 640, 901.5, 1600]) {
      const { count, pitch, barWidth } = barLayout(width);
      expect(count * pitch - BAR_GAP).toBeCloseTo(width, 6);
      expect((count - 1) * pitch + barWidth).toBeCloseTo(width, 6);
    }
  });

  it('keeps the gap and a bar between its base width and one pixel over it', () => {
    for (const width of [50, 200, 777, 1234]) {
      const { pitch, barWidth } = barLayout(width);
      expect(pitch - barWidth).toBeCloseTo(BAR_GAP, 6);
      expect(barWidth).toBeGreaterThanOrEqual(BAR_WIDTH);
      expect(barWidth).toBeLessThan(BAR_WIDTH + 1.01);
    }
  });

  it('never has no bars: an unmeasured, zero, negative or NaN width is one bar', () => {
    for (const width of [0, -5, Number.NaN, 1]) expect(barLayout(width).count).toBe(1);
    expect(barLayout(1).barWidth).toBeLessThanOrEqual(1);
  });

  it('takes the column count when the caller already has the columns', () => {
    const l = barLayout(700, 50);
    expect(l.count).toBe(50);
    expect(l.pitch * 50 - BAR_GAP).toBeCloseTo(700, 6);
  });
});

describe('halfHeight', () => {
  it('is symmetric about the middle: a column draws as the larger of its two peaks', () => {
    expect(halfHeight([-100, 20], 28)).toBe(halfHeight([-20, 100], 28));
  });
  it('is a hairline for silence and for anything under the host floor of 1/127', () => {
    expect(halfHeight([0, 0], 28)).toBe(MIN_BAR_HEIGHT / 2);
    expect(halfHeight([-1, 1], 28)).toBe(MIN_BAR_HEIGHT / 2);
  });
  it('fills the headroom at the reference level and clamps a stray value', () => {
    expect(halfHeight([-127, 127], 28)).toBeCloseTo(28 * PEAK_HEADROOM, 6);
    expect(halfHeight([-400, 400], 28)).toBeCloseTo(28 * PEAK_HEADROOM, 6);
    expect(halfHeight([-30, 30], 28, { ref: 30 })).toBeCloseTo(28 * PEAK_HEADROOM, 6);
  });
});

// The owner's chapter peaked at 30/127 with a median of 3/127 (#2246): drawn on a linear scale its speech was a row of dots (#2251, items 31
// and 34). The bars are its level in decibels against the chapter's reference, over DISPLAY_RANGE_DB.
describe('levelOf, the display scale', () => {
  const owner = { ref: 30 };
  it('is 1 at the reference and above it, and 0 at the host floor and below', () => {
    expect(levelOf(30, owner)).toBe(1);
    expect(levelOf(90, owner)).toBe(1);
    expect(levelOf(1, owner)).toBe(0);
    expect(levelOf(0, owner)).toBe(0);
    expect(levelOf(-30, owner)).toBe(1);
  });
  it('is the level in decibels against the reference over the display range', () => {
    // a bucket of 3 is at least 2/127; 20·log10(2/29) is -23.2 dB, so 1 - 23.2/30 of the height
    expect(levelOf(3, owner)).toBeCloseTo(1 + (20 * Math.log10(2 / 29)) / DISPLAY_RANGE_DB, 9);
    expect(DISPLAY_RANGE_DB).toBe(30);
  });
  it('draws the median syllable of a quiet chapter several times taller than a linear scale does', () => {
    // Linear, scaled so the loudest bucket fills the room (the rule before): 3/30 of it. On the display scale: about a quarter of it.
    const linear = 3 / 30;
    expect(levelOf(3, owner)).toBeGreaterThan(2 * linear);
    expect(levelOf(10, owner)).toBeGreaterThan(0.6);
  });
  it('draws a chapter the same whatever its gain: 10 dB quieter with its reference 10 dB lower is the same picture', () => {
    // (above the quietest buckets, where the host's 1/127 steps are coarse)
    for (const v of [20, 40, 90, 127]) {
      const quieter = Math.round(1 + (v - 1) / Math.sqrt(10));
      expect(levelOf(quieter, { ref: Math.round(1 + 99 / Math.sqrt(10)) })).toBeCloseTo(levelOf(v, { ref: 100 }), 1);
    }
  });
  it('rises with the level and never leaves 0..1', () => {
    let last = -1;
    for (let v = 0; v <= 127; v += 1) {
      const l = levelOf(v, owner);
      expect(l).toBeGreaterThanOrEqual(last);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
      last = l;
    }
  });
  it('keeps a reference of 1 or less from dividing by nothing', () => {
    expect(levelOf(2, { ref: 1 })).toBe(1);
    expect(levelOf(2, { ref: 0 })).toBe(1);
  });
});

describe('playheadAt', () => {
  it('moves on from the last update at the playing rate', () => {
    expect(playheadAt(10, 0, 20)).toBe(10);
    expect(playheadAt(10, 250, 20)).toBeCloseTo(10.25, 9);
  });
  it('never moves on further than the cap, so a stalled host does not run the playhead away', () => {
    expect(playheadAt(10, 60_000, 20)).toBeCloseTo(10 + MAX_EXTRAPOLATE_MS / 1000, 9);
  });
  it('stays inside the window and ignores a clock that went backwards', () => {
    expect(playheadAt(19.9, 400, 20)).toBe(20);
    expect(playheadAt(10, -500, 20)).toBe(10);
  });
});

describe('barPosition', () => {
  it('is 0 at the left edge and the bar count at the right', () => {
    expect(barPosition(2, 2, 6, 40)).toBe(0);
    expect(barPosition(6, 2, 6, 40)).toBe(40);
    expect(barPosition(4, 2, 6, 40)).toBe(20);
  });
});
