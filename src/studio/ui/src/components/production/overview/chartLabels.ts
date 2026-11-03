/** Where the progress chart puts its text labels: beside the point each belongs to, on a side that no line and no other label crosses. */

export type Seg = { x1: number; y1: number; x2: number; y2: number };
export type Rect = { x1: number; y1: number; x2: number; y2: number };
export type Bounds = { left: number; right: number; top: number; bottom: number };
export type Side = 'right-above' | 'right-below' | 'left-above' | 'left-below';
export type Placement = { x: number; y: number; anchor: 'start' | 'end' };

/** The label font is 11 px sans: about this wide per character, a little over so the estimate errs towards more room. */
const CHAR_PX = 6.4;
/** The room the text takes above its baseline and below it. */
const ASCENT = 9;
const DESCENT = 3;
/** The gap between the point and the label, and the clear band kept around a line. */
const GAP = 8;
const PAD = 3;
/** The step, in px, a label slides along its row when no side beside the point is clear. */
const SLIDE = 4;
/** The farthest, in px, a slid label's nearer end may be from its point: past it the label would read as belonging to something else. */
const MAX_SLIDE = 40;

export const textWidth = (text: string): number => Math.ceil(text.length * CHAR_PX);

export const labelRect = (p: Placement, text: string): Rect => {
  const w = textWidth(text);
  const x1 = p.anchor === 'start' ? p.x : p.x - w;
  return { x1, x2: x1 + w, y1: p.y - ASCENT, y2: p.y + DESCENT };
};

const place = (side: Side, at: { x: number; y: number }): Placement => {
  const right = side.startsWith('right');
  return { x: at.x + (right ? GAP : -GAP), y: at.y + (side.endsWith('above') ? -GAP : GAP + ASCENT - 2), anchor: right ? 'start' : 'end' };
};

/** Whether a segment passes through the rectangle grown by `pad` on every side (the slab test). */
const crosses = (s: Seg, r: Rect, pad: number): boolean => {
  let t0 = 0;
  let t1 = 1;
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const edges: Array<[number, number]> = [
    [-dx, s.x1 - (r.x1 - pad)],
    [dx, r.x2 + pad - s.x1],
    [-dy, s.y1 - (r.y1 - pad)],
    [dy, r.y2 + pad - s.y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
};

/** Whether segments `a` and `b` cross. */
const meet = (a: Seg, b: Seg): boolean => {
  const side = (s: Seg, x: number, y: number): number => Math.sign((s.x2 - s.x1) * (y - s.y1) - (s.y2 - s.y1) * (x - s.x1));
  return side(a, b.x1, b.y1) * side(a, b.x2, b.y2) < 0 && side(b, a.x1, a.y1) * side(b, a.x2, a.y2) < 0;
};

const overlaps = (a: Rect, b: Rect): boolean => a.x1 < b.x2 + PAD && a.x2 > b.x1 - PAD && a.y1 < b.y2 + PAD && a.y2 > b.y1 - PAD;

const inside = (r: Rect, b: Bounds): boolean => r.x1 >= b.left && r.x2 <= b.right && r.y1 >= b.top && r.y2 <= b.bottom;

/** Moves a placement the least needed to bring its rectangle inside the bounds. */
export const keepInside = (p: Placement, text: string, b: Bounds): Placement => {
  const r = labelRect(p, text);
  // The left edge wins when the box is wider than the plot, so its start is never cut.
  const dx = r.x2 > b.right ? Math.max(b.right - r.x2, b.left - r.x1) : r.x1 < b.left ? b.left - r.x1 : 0;
  const dy = r.y1 < b.top ? b.top - r.y1 : r.y2 > b.bottom ? b.bottom - r.y2 : 0;
  return { ...p, x: p.x + dx, y: p.y + dy };
};

/**
 * Puts `text` beside `at`, on the first of `prefer` whose box fits inside `bounds` and crosses no segment of `lines` and no rectangle of `taken`.
 * When every side is crossed it slides along the rows just above or below the point (a short way) to the nearest clear spot, and failing that takes the side that crosses fewest (the earlier preferred side on a tie); when none fits inside the bounds it
 * moves the first preferred side in.
 */
export function placeLabel(text: string, at: { x: number; y: number }, bounds: Bounds, lines: Seg[], taken: Rect[], prefer: Side[]): Placement {
  let best: { p: Placement; hits: number } | null = null;
  for (const side of prefer) {
    const p = place(side, at);
    const r = labelRect(p, text);
    if (!inside(r, bounds)) continue;
    const hits = lines.filter((s) => crosses(s, r, PAD)).length + taken.filter((t) => overlaps(r, t)).length;
    if (hits === 0) return p;
    if (!best || hits < best.hits) best = { p, hits };
  }
  // No preferred side is clear (a line close to the point on both): slide the label along the row above or below the point to the nearest clear spot.
  const w = textWidth(text);
  const slid: Placement[] = [];
  for (let k = 0; k <= 2; k++) {
    for (const dy of [-GAP - 8 * k, GAP + ASCENT - 2 + 8 * k]) {
      for (let x1 = bounds.left; x1 + w <= bounds.right; x1 += SLIDE) slid.push({ x: x1, y: at.y + dy, anchor: 'start' });
    }
  }
  const away = (p: Placement): number => Math.abs(p.x + w / 2 - at.x) + Math.abs(p.y - at.y);
  const clear = slid
    .filter((p) => inside(labelRect(p, text), bounds) && at.x >= p.x - MAX_SLIDE && at.x <= p.x + w + MAX_SLIDE)
    .sort((a, b) => away(a) - away(b))
    .find((p) => {
      const r = labelRect(p, text);
      // A line between the label and its point would make it read as the line's: the label must be reachable from the point without crossing one.
      const link: Seg = { x1: at.x, y1: at.y, x2: Math.min(Math.max(at.x, r.x1), r.x2), y2: Math.min(Math.max(at.y, r.y1), r.y2) };
      return !lines.some((s) => crosses(s, r, PAD) || meet(s, link)) && !taken.some((t) => overlaps(r, t));
    });
  if (clear) return clear;
  return best ? best.p : keepInside(place(prefer[0], at), text, bounds);
}
