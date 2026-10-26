import { describe, expect, it } from 'vitest';
import { halfHeight, FULL_SCALE, PEAK_HEADROOM } from './ribbonBars';
import { barSwell, crestAt, PLACEHOLDER_LEVEL, placeholderColumns, SWELL, swelledHalf, swellPhase, swellProfile, swellWidth } from './waveSwell';

// Ported from ribbonBars.test.ts's pulseEnvelope, barScale and grownHalf: the bump that grew each bar toward the lane's edge around the
// playhead is replaced by a swell that scales each bar on its own height and rides the playhead (the owner's report of 2026-10-26).

describe('swellProfile', () => {
  const width = 20;
  const ahead = width * SWELL.aheadShare;
  const behind = width - ahead;
  it('is SWELL.peak at the crest and 1 at and beyond its reach on either side', () => {
    expect(swellProfile(0, width)).toBeCloseTo(SWELL.peak, 9);
    expect(swellProfile(ahead, width)).toBe(1);
    expect(swellProfile(-behind, width)).toBe(1);
    expect(swellProfile(500, width)).toBe(1);
    expect(swellProfile(-500, width)).toBe(1);
  });
  it('rises monotonically toward the crest from ahead and settles monotonically behind it', () => {
    for (const sign of [1, -1]) {
      let last: number = SWELL.peak;
      for (let d = 0.25; d <= width; d += 0.25) {
        const v = swellProfile(sign * d, width);
        expect(v).toBeLessThanOrEqual(last + 1e-12);
        last = v;
      }
    }
  });
  it('rises over a longer ramp ahead of the crest than it settles behind it', () => {
    expect(SWELL.aheadShare).toBeGreaterThan(0.5);
    for (let d = 0.5; d < behind; d += 0.5) expect(swellProfile(d, width)).toBeGreaterThan(swellProfile(-d, width));
    expect(swellProfile(behind + 0.5, width)).toBeGreaterThan(1);
    expect(swellProfile(-(behind + 0.5), width)).toBe(1);
  });
  it('eases: half way along each ramp is half way up', () => {
    expect(swellProfile(ahead / 2, width)).toBeCloseTo(1 + (SWELL.peak - 1) / 2, 9);
    expect(swellProfile(-behind / 2, width)).toBeCloseTo(1 + (SWELL.peak - 1) / 2, 9);
  });
  it('is bounded to [1, peak], and 1 for NaN or a zero width', () => {
    for (let d = -30; d <= 30; d += 0.1) {
      const v = swellProfile(d, width);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(SWELL.peak + 1e-12);
    }
    expect(swellProfile(Number.NaN, width)).toBe(1);
    expect(swellProfile(0, 0)).toBe(1);
  });
});

describe('swellWidth', () => {
  it('is a tenth of the bars, never fewer than SWELL.minWidthBars', () => {
    expect(SWELL.widthShare).toBeGreaterThanOrEqual(0.08);
    expect(SWELL.widthShare).toBeLessThanOrEqual(0.12);
    expect(swellWidth(300)).toBeCloseTo(30, 9);
    expect(swellWidth(10)).toBe(SWELL.minWidthBars);
  });
});

describe('crestAt (the placeholder loop)', () => {
  it('enters with the whole swell off the left edge and leaves with it off the right, left to right', () => {
    const count = 200;
    const w = swellWidth(count);
    expect(crestAt(0, count)).toBeCloseTo(-w * SWELL.aheadShare, 9);
    expect(crestAt(1, count)).toBeCloseTo(count + w * (1 - SWELL.aheadShare), 9);
    let last = -Infinity;
    for (let p = 0; p <= 1; p += 0.01) {
      const c = crestAt(p, count);
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });
  it('eases in and out: it moves slower near the ends of a pass than in the middle', () => {
    const count = 200;
    expect(crestAt(0.05, count) - crestAt(0, count)).toBeLessThan(crestAt(0.55, count) - crestAt(0.5, count));
  });
  it('clamps a phase outside 0..1', () => {
    expect(crestAt(-1, 100)).toBe(crestAt(0, 100));
    expect(crestAt(2, 100)).toBe(crestAt(1, 100));
  });
});

describe('swellPhase', () => {
  it('loops once per SWELL.periodMs, a calm pass of 1.2 to 1.8 s', () => {
    expect(SWELL.periodMs).toBeGreaterThanOrEqual(1200);
    expect(SWELL.periodMs).toBeLessThanOrEqual(1800);
    expect(swellPhase(0)).toBe(0);
    expect(swellPhase(SWELL.periodMs / 2)).toBeCloseTo(0.5, 9);
    expect(swellPhase(SWELL.periodMs * 3 + 1)).toBeCloseTo(1 / SWELL.periodMs, 9);
    expect(swellPhase(-5)).toBe(0);
    expect(swellPhase(Number.NaN)).toBe(0);
  });
  it('joins up: the end of one pass and the start of the next leave every bar at rest', () => {
    for (const p of [0, 0.999999]) for (let i = 0; i < 100; i += 1) expect(barSwell(i, 100, crestAt(p, 100))).toBeCloseTo(1, 3);
  });
});

describe('barSwell, a pass as one bar sees it', () => {
  it('a bar rises as the crest (the playhead) comes up to it, is tallest under it, and settles as it goes by', () => {
    const count = 120;
    const seen: number[] = [];
    for (let crest = 0; crest <= count; crest += 0.25) seen.push(barSwell(60, count, crest));
    const top = seen.indexOf(Math.max(...seen));
    for (let k = 1; k <= top; k += 1) expect(seen[k]).toBeGreaterThanOrEqual(seen[k - 1] - 1e-12);
    for (let k = top + 1; k < seen.length; k += 1) expect(seen[k]).toBeLessThanOrEqual(seen[k - 1] + 1e-12);
    expect(seen[top]).toBeGreaterThan(SWELL.peak - 0.01);
    expect(seen[0]).toBe(1);
    expect(seen[seen.length - 1]).toBe(1);
  });
  it('at one moment only the bars near the crest are scaled; far ahead and behind are 1', () => {
    const count = 200;
    expect(barSwell(100, count, 100.5)).toBeCloseTo(SWELL.peak, 9);
    expect(barSwell(0, count, 100.5)).toBe(1);
    expect(barSwell(count - 1, count, 100.5)).toBe(1);
    // the bars ahead (to the right) are the ones rising
    expect(barSwell(105, count, 100.5)).toBeGreaterThan(barSwell(96, count, 100.5));
  });
  it('is 1 for every bar with no crest (still, or motion reduced)', () => {
    for (let i = 0; i < 50; i += 1) expect(barSwell(i, 50, null)).toBe(1);
  });
});

describe('swelledHalf', () => {
  it('scales the bar on its own height, so a pause stays a pause and a mid bar grows by the factor', () => {
    expect(swelledHalf(0.5, 1.5, 27.5)).toBeCloseTo(0.75, 9);
    expect(swelledHalf(10, 1.5, 27.5)).toBeCloseTo(15, 9);
  });
  it('never passes the lane edge and never shrinks a bar', () => {
    for (let half = 0; half <= 30; half += 0.5)
      for (const f of [1, 1.2, SWELL.peak]) {
        const h = swelledHalf(half, f, 27.5);
        expect(h).toBeGreaterThanOrEqual(half);
        expect(h).toBeLessThanOrEqual(Math.max(half, 27.5));
      }
  });
});

describe('placeholderColumns', () => {
  it('is a flat row the count long at PLACEHOLDER_LEVEL of the headroom, on any scale', () => {
    for (const scale of [FULL_SCALE, { ref: 40 }]) {
      const cols = placeholderColumns(30, scale);
      expect(cols).toHaveLength(30);
      for (const c of cols) expect(halfHeight(c, 28, scale)).toBeCloseTo(PLACEHOLDER_LEVEL * 28 * PEAK_HEADROOM, 6);
    }
    expect(placeholderColumns(0, FULL_SCALE)).toEqual([]);
    expect(placeholderColumns(-3, FULL_SCALE)).toEqual([]);
  });
});
