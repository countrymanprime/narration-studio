import type { PeakColumn } from './peaksWindow';
import { BAR_RADIUS, barLayout, barPosition, barScale, halfHeight, playheadAt } from './ribbonBars';
import type { RibbonLayout } from './ribbonLayout';

import { kindColour, type KindId } from '../../../kinds/kindMap';
import type { TintKind } from './ribbonLayout';

/** The registry kind each tinted span is, so a span is the colour the same words have in the script (kinds/kindMap.ts). */
const TINT_KIND: Record<TintKind, KindId> = { extra: 'extra', mis: 'misread', low: 'low' };

/** The colour tokens the canvas draws with, read from CSS when drawn (a canvas cannot resolve `var()` itself). */
const RIBBON_TOKENS = {
  bars: '--waveform',
  /** The bars not yet played while a playhead is drawn. The played ones keep `bars`. */
  unplayed: '--non-text',
  tick: '--line-strong',
  band: '--info',
  playhead: '--accent',
} as const;
export type RibbonColors = Record<keyof typeof RIBBON_TOKENS, string> & {
  /** The tint behind each kind of flagged span, and the solid bar along its top edge. */
  tint: Record<TintKind, string>;
  bar: Record<TintKind, string>;
};

/** Each token's value from `el`'s computed style. A token that reads empty falls back to the element's own text colour, never a literal. */
export function readRibbonColors(el: Element): RibbonColors {
  const styles = getComputedStyle(el);
  const read = (token: string | null): string => (token ? styles.getPropertyValue(token).trim() : '') || styles.color;
  const out = {} as RibbonColors;
  for (const k of Object.keys(RIBBON_TOKENS) as (keyof typeof RIBBON_TOKENS)[]) out[k] = read(RIBBON_TOKENS[k]);
  out.tint = {} as RibbonColors['tint'];
  out.bar = {} as RibbonColors['bar'];
  for (const k of Object.keys(TINT_KIND) as TintKind[]) {
    const { line, soft } = kindColour(TINT_KIND[k]);
    out.tint[k] = read(soft);
    out.bar[k] = read(line);
  }
  return out;
}

export interface RibbonSize {
  width: number;
  height: number;
  dpr: number;
}

/** A cut word has no length in the document; the gap marker is at least this wide (CSS pixels). */
const MIN_GAP = 6;

/** What moves in one frame. Without `animate` the bars are drawn at rest and the playhead where the host last said it was. */
export interface RibbonFrame {
  /** The frame clock in milliseconds, the beat's phase. */
  nowMs: number;
  /** Milliseconds since the host last published the playhead, to move it on between updates. */
  sinceUpdateMs: number;
  animate: boolean;
}
export const STILL_FRAME: RibbonFrame = { nowMs: 0, sinceUpdateMs: 0, animate: false };

/** Draws the line's window: tints, selection band, rounded bars from the peaks columns (grown near the playhead), ticks, hatched cut gaps, then the playhead. Sizes the canvas to the device pixel ratio. */
export function drawRibbon(
  canvas: HTMLCanvasElement,
  size: RibbonSize,
  layout: RibbonLayout,
  columns: PeakColumn[],
  colors: RibbonColors,
  frame: RibbonFrame = STILL_FRAME,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height, dpr } = size;
  // Assigning a canvas's size clears and reallocates it, so it is set only when it changes, not on every animation frame.
  const pxWidth = Math.round(width * dpr);
  const pxHeight = Math.round(height * dpr);
  if (canvas.width !== pxWidth) canvas.width = pxWidth;
  if (canvas.height !== pxHeight) canvas.height = pxHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const span = layout.t1 - layout.t0;
  const x = (t: number): number => ((t - layout.t0) / span) * width;

  for (const f of layout.flags) {
    ctx.fillStyle = colors.tint[f.kind];
    ctx.fillRect(x(f.t0), 0, Math.max(2, x(f.t1) - x(f.t0)), height);
    // The tint is not the only cue: a solid bar along the top edge.
    ctx.fillStyle = colors.bar[f.kind];
    ctx.fillRect(x(f.t0), 0, Math.max(2, x(f.t1) - x(f.t0)), 3);
  }
  if (layout.band) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colors.band;
    ctx.fillRect(x(layout.band.t0), 0, Math.max(2, x(layout.band.t1) - x(layout.band.t0)), height);
    ctx.restore();
  }

  const head = layout.playhead == null ? null : frame.animate ? playheadAt(layout.playhead, frame.sinceUpdateMs, layout.t1) : layout.playhead;
  drawBars(ctx, width, height, columns, colors, head == null ? null : barPosition(head, layout.t0, layout.t1, columns.length), frame);

  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = colors.tick;
  for (const t of layout.ticks) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x(t)) + 0.5, 0);
    ctx.lineTo(Math.round(x(t)) + 0.5, height);
    ctx.stroke();
  }
  ctx.restore();

  // A cut: a hatched gap, so it does not read as silence.
  for (const g of layout.cuts) {
    const left = x(g.t0);
    const w = Math.max(MIN_GAP, x(g.t1) - left);
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.min(left, width - w), 0, w, height);
    ctx.clip();
    ctx.strokeStyle = colors.tick;
    for (let h = -height; h < w + height; h += 4) {
      const x0 = Math.min(left, width - w) + h;
      ctx.beginPath();
      ctx.moveTo(x0, height);
      ctx.lineTo(x0 + height, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (head != null) {
    ctx.strokeStyle = colors.playhead;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(head), 0);
    ctx.lineTo(x(head), height);
    ctx.stroke();
  }
}

/**
 * The bars, centred on the middle line. With a playhead (`headBar`, in bars) the played bars are `colors.bars` and the rest `colors.unplayed`, and, while
 * animating, the bars near it grow by `barScale`. Each colour is one path, filled once. Without one every bar is `colors.bars`.
 */
function drawBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  columns: PeakColumn[],
  colors: RibbonColors,
  headBar: number | null,
  frame: RibbonFrame,
): void {
  const mid = height / 2;
  const { pitch, barWidth } = barLayout(width, columns.length);
  const radius = Math.min(BAR_RADIUS, barWidth / 2);
  const halfAt = (i: number): number => {
    const half = halfHeight(columns[i], mid);
    return headBar == null ? half : Math.min(mid - 0.5, half * barScale(i + 0.5 - headBar, frame.nowMs, !frame.animate));
  };
  // One path and one fill for each colour, not one stroke for each bar.
  const fillBars = (colour: string, from: number, to: number): void => {
    ctx.beginPath();
    for (let i = from; i < to; i += 1) {
      const half = halfAt(i);
      ctx.roundRect(i * pitch, mid - half, barWidth, half * 2, radius);
    }
    ctx.fillStyle = colour;
    ctx.fill();
  };
  // Bars whose centre the playhead has passed are played.
  const split = headBar == null ? columns.length : Math.max(0, Math.min(columns.length, Math.ceil(headBar - 0.5)));
  fillBars(colors.bars, 0, split);
  if (split < columns.length) fillBars(colors.unplayed, split, columns.length);
}
