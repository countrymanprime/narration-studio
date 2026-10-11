import type { PeakColumn } from './peaksWindow';
import type { RibbonLayout } from './ribbonLayout';

/** The colour tokens the canvas draws with, read from CSS when drawn (a canvas cannot resolve `var()` itself). */
const RIBBON_TOKENS = {
  bars: '--waveform',
  extra: '--danger-soft',
  low: '--warn-soft',
  flagBar: '--warn',
  tick: '--line-strong',
  band: '--info',
  playhead: '--accent',
} as const;
export type RibbonColors = Record<keyof typeof RIBBON_TOKENS, string>;

/** Each token's value from `el`'s computed style. A token that reads empty falls back to the element's own text colour, never a literal. */
export function readRibbonColors(el: Element): RibbonColors {
  const styles = getComputedStyle(el);
  const out = {} as RibbonColors;
  for (const k of Object.keys(RIBBON_TOKENS) as (keyof typeof RIBBON_TOKENS)[]) out[k] = styles.getPropertyValue(RIBBON_TOKENS[k]).trim() || styles.color;
  return out;
}

export interface RibbonSize {
  width: number;
  height: number;
  dpr: number;
}

/** A cut word has no length in the document; the gap marker is at least this wide (CSS pixels). */
const MIN_GAP = 6;

/** Draws the line's window: tints, selection band, bars from the peaks columns, ticks, hatched cut gaps, then the playhead. Sizes the canvas to the device pixel ratio. */
export function drawRibbon(canvas: HTMLCanvasElement, size: RibbonSize, layout: RibbonLayout, columns: PeakColumn[], colors: RibbonColors): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height, dpr } = size;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const span = layout.t1 - layout.t0;
  const x = (t: number): number => ((t - layout.t0) / span) * width;

  for (const f of layout.flags) {
    ctx.fillStyle = f.kind === 'extra' ? colors.extra : colors.low;
    ctx.fillRect(x(f.t0), 0, Math.max(2, x(f.t1) - x(f.t0)), height);
    // The tint is not the only cue: a solid bar along the top edge.
    ctx.fillStyle = colors.flagBar;
    ctx.fillRect(x(f.t0), 0, Math.max(2, x(f.t1) - x(f.t0)), 3);
  }
  if (layout.band) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colors.band;
    ctx.fillRect(x(layout.band.t0), 0, Math.max(2, x(layout.band.t1) - x(layout.band.t0)), height);
    ctx.restore();
  }

  const mid = height / 2;
  ctx.strokeStyle = colors.bars;
  ctx.lineWidth = 1;
  columns.forEach(([lo, hi], c) => {
    const px = (c + 0.5) * (width / columns.length);
    ctx.beginPath();
    ctx.moveTo(px, mid - (hi / 127) * mid - 0.5);
    ctx.lineTo(px, mid - (lo / 127) * mid + 0.5);
    ctx.stroke();
  });

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

  if (layout.playhead != null) {
    ctx.strokeStyle = colors.playhead;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(layout.playhead), 0);
    ctx.lineTo(x(layout.playhead), height);
    ctx.stroke();
  }
}
