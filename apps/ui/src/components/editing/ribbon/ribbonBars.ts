import type { PeakColumn } from './peaksWindow';

/*
 * The ribbon's bars, after the public site's animated waveform (apps/site/landing/index.html, `.wave`): rounded bars on a fixed gap, each one
 * centred on the middle line, so the shape is symmetric. The site's bars are at most 5 px wide with a 3 px gap, a 3 px radius and a 4 px minimum height;
 * these are the same, spread so the bars fill the width exactly. Everything here is pure: the canvas code (drawRibbon.ts) only draws what it returns.
 */

/** The narrowest a bar is drawn (CSS pixels); the site caps its bars at 5. */
export const BAR_WIDTH = 4;
/** The gap between bars, the site's `gap: 3px`. */
export const BAR_GAP = 3;
/** The shortest a bar gets, the site's `min-height: 4px`, so silence is still a dotted line rather than nothing. */
export const MIN_BAR_HEIGHT = 4;
/** The site's `border-radius: 3px`, never more than half the bar's width. */
export const BAR_RADIUS = 3;
/** The loudest bar fills this much of the height, so a growing bar near the playhead has room to grow. */
export const PEAK_HEADROOM = 1 / 1.5;

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

/** A column's half height in pixels: the larger of its two peaks as a share of `mid`, kept between the minimum bar and the headroom. */
export function halfHeight(column: PeakColumn, mid: number): number {
  const level = Math.max(Math.abs(column[0]), Math.abs(column[1])) / 127;
  return Math.max(MIN_BAR_HEIGHT / 2, Math.min(1, level) * mid * PEAK_HEADROOM);
}

/** How the bars near the playhead move. Distances are in bars so the look is the same for a one second window and a one minute window. */
export const PULSE = {
  /** The bump reaches this many bars behind the playhead (already played) and ahead of it (about to play). */
  behind: 8,
  ahead: 6,
  /** The bar under the playhead grows by up to this share of its height at the top of a beat. */
  grow: 0.5,
  /** How much of that growth is the beat; the rest is steady. 0 holds the bump still, 1 lets it fall to nothing between beats. */
  depth: 0.9,
  /** The ripple's wavelength in bars: the crest leaves the playhead and reaches a bar this far off one beat later. */
  wavelength: 6,
  /** Beats per second. */
  hz: 2.4,
} as const;

/** The bump's shape at `d` bars from the playhead (positive ahead of it): 1 under the playhead, easing to 0 at the reach by a half cosine. */
export function pulseEnvelope(d: number): number {
  const reach = d >= 0 ? PULSE.ahead : PULSE.behind;
  const x = Math.abs(d);
  if (!(x < reach)) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * x) / reach));
}

/** The beat at `nowMs`: 0 to 1 and back, eased, `PULSE.hz` times a second. */
export function beat(nowMs: number): number {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * PULSE.hz * (nowMs / 1000));
}

/** The beat as a wave: a bar `d` bars from the playhead is behind the playhead's own beat by `|d| / PULSE.wavelength` of a beat, so the crest runs outward. */
export function ripple(d: number, nowMs: number): number {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * (PULSE.hz * (nowMs / 1000) - Math.abs(d) / PULSE.wavelength));
}

/** The factor a bar `d` bars from the playhead is taller by at `nowMs`. 1 for a bar out of reach and always 1 when motion is reduced. */
export function barScale(d: number, nowMs: number, reduced: boolean): number {
  if (reduced) return 1;
  return 1 + PULSE.grow * pulseEnvelope(d) * (1 - PULSE.depth + PULSE.depth * ripple(d, nowMs));
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
