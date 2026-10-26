import type { PeakColumn } from './peaksWindow';
import { DISPLAY_RANGE_DB, type PeakScale } from './ribbonBars';

/*
 * The swell that runs over the waveform's own bars, like a stadium wave: the crest rides the playhead while the chapter plays, so the bars
 * just ahead of it start to rise, the ones under it are tallest and the ones behind settle back. While the peaks are read it loops over a
 * flat row of placeholder bars instead, crossing them left to right. Each bar grows on its own height (a factor), never toward a
 * fixed edge, so the shape of the audio stays the shape under it and a pause stays a pause (#2251, the owner's report of 2026-10-26: "increase
 * the size of the waveform that is already there"). It replaces the bump that grew each bar toward the lane's edge around the playhead, which
 * drew a hill of its own over the audio. Everything here is pure; `useWaveSwell` runs the clock and drawRibbon.ts draws.
 */

export const SWELL = {
  /** The bar under the crest is this many times its height at rest (clamped to the lane). */
  peak: 1.5,
  /** The swell is this share of the bars across, from where it starts to rise to where it has settled. */
  widthShare: 0.1,
  /** Of that width, this share is ahead of the crest: the bars rise over a longer ramp than they settle behind it. */
  aheadShare: 0.6,
  /** Never narrower than this many bars, so a short window still shows a swell and not a single bar. */
  minWidthBars: 6,
  /** One pass of the placeholder loop across the bars, crest entering at the left edge to leaving at the right. */
  periodMs: 1500,
} as const;

/** How many bars the swell covers in a row of `count`. */
export function swellWidth(count: number): number {
  return Math.max(SWELL.minWidthBars, count * SWELL.widthShare);
}

/**
 * The factor a bar `d` bars from the crest (positive ahead of it) is scaled by: `SWELL.peak` at the crest, easing to 1 by a raised cosine
 * over `SWELL.aheadShare` of `width` ahead of it and the rest behind it, and 1 beyond.
 */
export function swellProfile(d: number, width: number): number {
  const reach = d >= 0 ? width * SWELL.aheadShare : width * (1 - SWELL.aheadShare);
  const x = Math.abs(d);
  if (!(x < reach) || !(reach > 0)) return 1;
  return 1 + (SWELL.peak - 1) * 0.5 * (1 + Math.cos((Math.PI * x) / reach));
}

/**
 * Where the placeholder loop's crest is, in bars, `phase` (0..1) of the way through a pass: it starts with the whole swell off the left edge
 * and ends with it off the right, eased in and out.
 */
export function crestAt(phase: number, count: number): number {
  const p = Math.max(0, Math.min(1, phase));
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * p);
  const width = swellWidth(count);
  const ahead = width * SWELL.aheadShare;
  const behind = width - ahead;
  return -ahead + eased * (count + ahead + behind);
}

/** The phase (0..1) `elapsedMs` into the loop. */
export function swellPhase(elapsedMs: number, periodMs: number = SWELL.periodMs): number {
  if (!(elapsedMs > 0) || !(periodMs > 0)) return 0;
  return (elapsedMs % periodMs) / periodMs;
}

/** The scale of bar `i` (its centre at `i + 0.5`) of `count` with the crest at bar position `crest`; 1 with no crest. */
export function barSwell(i: number, count: number, crest: number | null): number {
  if (crest == null) return 1;
  return swellProfile(i + 0.5 - crest, swellWidth(count));
}

/** A bar's half height scaled by `factor`, never past `room` (the lane's edge) and never shorter than it was. */
export function swelledHalf(half: number, factor: number, room: number): number {
  return Math.max(half, Math.min(half * factor, room));
}

/** The level (share of the headroom) the placeholder bars stand at while the waveform is read: a low flat row for the swell to run over. */
export const PLACEHOLDER_LEVEL = 0.3;

/** `count` columns of one bucket value that `halfHeight` draws at `PLACEHOLDER_LEVEL` on `scale`: the stand-in row while the peaks are read. */
export function placeholderColumns(count: number, scale: PeakScale): PeakColumn[] {
  const ref = Math.max(1, scale.ref - 1);
  const v = 1 + ref * 10 ** (((PLACEHOLDER_LEVEL - 1) * DISPLAY_RANGE_DB) / 20);
  return Array.from({ length: Math.max(0, Math.floor(count)) }, () => [-v, v] as PeakColumn);
}
