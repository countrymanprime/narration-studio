import { describe, expect, it } from 'vitest';
import {
  BAR_GAP,
  BAR_WIDTH,
  MAX_EXTRAPOLATE_MS,
  MIN_BAR_HEIGHT,
  PEAK_HEADROOM,
  PULSE,
  barLayout,
  barPosition,
  barScale,
  beat,
  halfHeight,
  playheadAt,
  pulseEnvelope,
} from './ribbonBars';

describe('barLayout', () => {
  it('fills the width exactly: the first bar starts at 0 and the last ends at the width', () => {
    for (const width of [120, 333, 640, 901.5, 1600]) {
      const { count, pitch, barWidth } = barLayout(width);
      expect(count * pitch - BAR_GAP).toBeCloseTo(width, 6);
      expect((count - 1) * pitch + barWidth).toBeCloseTo(width, 6);
    }
  });

  it('keeps the site gap and a bar between its base width and one pixel over it', () => {
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
  it('is at least half the minimum bar, so silence is still drawn', () => {
    expect(halfHeight([0, 0], 28)).toBe(MIN_BAR_HEIGHT / 2);
    expect(halfHeight([-1, 1], 28)).toBe(MIN_BAR_HEIGHT / 2);
  });
  it('leaves headroom for growth at full scale and clamps a stray value', () => {
    expect(halfHeight([-127, 127], 28)).toBeCloseTo(28 * PEAK_HEADROOM, 6);
    expect(halfHeight([-400, 400], 28)).toBeCloseTo(28 * PEAK_HEADROOM, 6);
  });
});

describe('pulseEnvelope', () => {
  it('is 1 under the playhead and 0 at and beyond the reach on both sides', () => {
    expect(pulseEnvelope(0)).toBe(1);
    expect(pulseEnvelope(PULSE.ahead)).toBe(0);
    expect(pulseEnvelope(-PULSE.behind)).toBe(0);
    expect(pulseEnvelope(100)).toBe(0);
    expect(pulseEnvelope(-100)).toBe(0);
  });
  it('decays monotonically with distance on each side', () => {
    for (const sign of [1, -1]) {
      let last = 1;
      for (let d = 0.25; d < 12; d += 0.25) {
        const v = pulseEnvelope(sign * d);
        expect(v).toBeLessThanOrEqual(last);
        last = v;
      }
    }
  });
  it('trails further behind the playhead than it leads ahead', () => {
    expect(pulseEnvelope(-3)).toBeGreaterThan(pulseEnvelope(3));
    expect(pulseEnvelope(-3)).toBeGreaterThan(0.2);
    expect(pulseEnvelope(2.9)).toBeLessThan(0.01);
  });
  it('eases: half way to the reach is half the height', () => {
    expect(pulseEnvelope(PULSE.ahead / 2)).toBeCloseTo(0.5, 6);
    expect(pulseEnvelope(-PULSE.behind / 2)).toBeCloseTo(0.5, 6);
  });
  it('is 0 for NaN rather than a NaN height', () => {
    expect(pulseEnvelope(Number.NaN)).toBe(0);
  });
});

describe('beat', () => {
  it('stays between 0 and 1, starts at 0 and repeats every 1/hz seconds', () => {
    expect(beat(0)).toBeCloseTo(0, 9);
    const period = 1000 / PULSE.hz;
    expect(beat(period / 2)).toBeCloseTo(1, 9);
    expect(beat(period)).toBeCloseTo(0, 9);
    for (let t = 0; t < 2000; t += 37) {
      expect(beat(t)).toBeGreaterThanOrEqual(0);
      expect(beat(t)).toBeLessThanOrEqual(1);
    }
  });
});

describe('barScale', () => {
  it('grows the bar under the playhead by up to PULSE.grow at the top of a beat', () => {
    const top = 1000 / PULSE.hz / 2;
    expect(barScale(0, top, false)).toBeCloseTo(1 + PULSE.grow, 6);
    // at the bottom of a beat it still holds the steady share
    expect(barScale(0, 0, false)).toBeCloseTo(1 + PULSE.grow * (1 - PULSE.depth), 6);
  });
  it('is 1 for a bar out of reach, whatever the beat', () => {
    for (const t of [0, 100, 208, 999]) {
      expect(barScale(50, t, false)).toBe(1);
      expect(barScale(-50, t, false)).toBe(1);
    }
  });
  it('is always 1 when motion is reduced: no bump, no beat', () => {
    for (const d of [-5, -1, 0, 1, 2.5]) for (const t of [0, 100, 208]) expect(barScale(d, t, true)).toBe(1);
  });
  it('is never below 1 and never above 1 + grow', () => {
    for (let d = -9; d <= 9; d += 0.5)
      for (let t = 0; t < 1000; t += 41) {
        const s = barScale(d, t, false);
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(1 + PULSE.grow + 1e-9);
      }
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
