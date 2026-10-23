import type { PeakColumn } from './peaksWindow';

/*
 * The ribbon's bars: thin rounded bars on a 1 px gap, each one centred on the middle line, so the shape is symmetric and reads as peaks and
 * valleys. The look began as the public site's animated waveform (apps/site/landing/index.html, `.wave`, 5 px bars and a 3 px gap); the owner
 * asked for thinner bars and taller peaks (#2251, items 31 and 34), so a bar is now 2 px and silence is a hairline, not a row of dots. The bars
 * are spread so they fill the width exactly. Everything here is pure: the canvas code (drawRibbon.ts) only draws what it returns.
 */

/** The narrowest a bar is drawn (CSS pixels). */
export const BAR_WIDTH = 2;
/** The gap between bars. */
export const BAR_GAP = 1;
/** The shortest a bar gets: silence is a hairline along the middle. */
export const MIN_BAR_HEIGHT = 1;
/** Never more than half the bar's width. */
export const BAR_RADIUS = 1;
/** A bar at the chapter's reference level fills this much of the height, so a bar near the playhead has a little room to grow. */
export const PEAK_HEADROOM = 0.9;

/**
 * How many decibels below the chapter's reference level the height spans: a bar at the reference fills the headroom, one `DISPLAY_RANGE_DB`
 * quieter is the hairline. Speech moves 20 to 30 dB inside a word and room tone sits 35 dB or more under the loud syllables, so 30 dB
 * keeps every syllable visible and leaves the pauses flat.
 */
export const DISPLAY_RANGE_DB = 30;

/**
 * How the peaks become heights. `ref` is the chapter's reference level in the host's bucket units (0..127): the bucket the loud syllables reach
 * (`peakScale`). A bar's height is its peak in decibels against `ref`, so a chapter recorded quietly draws as tall as one that was normalised,
 * as REAPER's view does once the narrator normalises, and a single click cannot shrink the rest.
 */
export interface PeakScale {
  ref: number;
}

/** The scale of a chapter whose level is not known yet: full scale is the reference. */
export const FULL_SCALE: PeakScale = { ref: 127 };

/**
 * A bucket value's height as a share of the headroom, 0..1. The host rounds every non-zero sample up to at least 1 (`measure.ComputePeaks`),
 * so a bucket of 1 says only "quieter than 1/127" and draws as the hairline; above that, the bucket's level is `v - 1` (the least its peak
 * can be), in decibels against the reference.
 */
export function levelOf(v: number, scale: PeakScale): number {
  const level = Math.abs(v) - 1;
  if (!(level > 0)) return 0;
  const ref = Math.max(1, scale.ref - 1);
  return Math.max(0, Math.min(1, 1 + (20 * Math.log10(level / ref)) / DISPLAY_RANGE_DB));
}

export interface BarLayout {
  /** How many bars fit across the width. */
  count: number;
  /** Distance from one bar's left edge to the next, gap included. */
  pitch: number;
  /** A bar's width; `pitch - BAR_GAP`. */
  barWidth: number;
}

/**
 * The bars that fill `width`: as many as fit at the base width and gap (or exactly `count` when the caller already has that many columns),
 * widened a little so the first and last touch the edges.
 */
export function barLayout(width: number, fixedCount?: number): BarLayout {
  if (!(width > 0)) return { count: 1, pitch: BAR_WIDTH + BAR_GAP, barWidth: BAR_WIDTH };
  const count = fixedCount && fixedCount > 0 ? Math.floor(fixedCount) : Math.max(1, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));
  const pitch = (width + BAR_GAP) / count;
  return { count, pitch, barWidth: Math.max(1, Math.min(pitch - BAR_GAP, width)) };
}

/** A column's half height in pixels: the larger of its two peaks on the display scale (`levelOf`), as a share of `mid` under the headroom, never under the hairline. */
export function halfHeight(column: PeakColumn, mid: number, scale: PeakScale = FULL_SCALE): number {
  const level = levelOf(Math.max(Math.abs(column[0]), Math.abs(column[1])), scale);
  return Math.max(MIN_BAR_HEIGHT / 2, level * mid * PEAK_HEADROOM);
}

/**
 * The wave that rides the playhead. Distances are in bars so the look is the same for a one second window and a one minute window. Nothing
 * oscillates in time: the bump sits on the playhead and moves with it, so a bar grows as the playhead comes up to it, is tallest while it is
 * under it, and shrinks again as the playhead leaves.
 */
export const PULSE = {
  /** The bump reaches this many bars behind the playhead (already played) and ahead of it (about to play). */
  behind: 18,
  ahead: 14,
  /** The bar under the playhead grows this share of the way from its height at rest to the lane's edge (`grownHalf`). */
  grow: 0.5,
} as const;

/** The bump's shape at `d` bars from the playhead (positive ahead of it): 1 under the playhead, easing to 0 at the reach by a half cosine. */
export function pulseEnvelope(d: number): number {
  const reach = d >= 0 ? PULSE.ahead : PULSE.behind;
  const x = Math.abs(d);
  if (!(x < reach)) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * x) / reach));
}

/** The factor a bar `d` bars from the playhead is taller by. 1 for a bar out of reach and always 1 when motion is reduced. */
export function barScale(d: number, reduced: boolean): number {
  if (reduced) return 1;
  return 1 + PULSE.grow * pulseEnvelope(d);
}

/**
 * A bar's half height `d` bars from the playhead: it grows by `barScale` of the way that is left to `room` (the lane's edge), so the bar under the
 * playhead goes half way to the edge and no bar ever passes it, however tall it was at rest.
 */
export function grownHalf(half: number, room: number, d: number, reduced: boolean): number {
  if (!(half < room)) return Math.min(half, room);
  return half + (barScale(d, reduced) - 1) * (room - half);
}

/** The host publishes the position a few times a second; between updates the drawing moves the playhead on at the playing rate, but never further than this. */
export const MAX_EXTRAPOLATE_MS = 400;

/** Where the playhead is `sinceMs` after the host last said it was at `playhead`, held inside the window. */
export function playheadAt(playhead: number, sinceMs: number, t1: number): number {
  return Math.min(t1, playhead + Math.max(0, Math.min(sinceMs, MAX_EXTRAPOLATE_MS)) / 1000);
}

/** The fractional bar index of time `t` in the window `[t0, t1]`: 0 at the left edge, `count` at the right. */
export function barPosition(t: number, t0: number, t1: number, count: number): number {
  return ((t - t0) / (t1 - t0)) * count;
}
