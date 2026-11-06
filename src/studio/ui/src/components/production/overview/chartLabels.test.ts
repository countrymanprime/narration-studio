// Where the chart puts a text label: beside its point, on a side no line or other label crosses.
import { describe, expect, it } from 'vitest';
import { labelRect, placeLabel, textWidth, type Bounds, type Seg } from './chartLabels';

const BOUNDS: Bounds = { left: 28, right: 498, top: 6, bottom: 252 };
const at = { x: 200, y: 120 };

describe('placeLabel', () => {
  it('takes the first preferred side when nothing is near', () => {
    const p = placeLabel('today', at, BOUNDS, [], [], ['right-below', 'left-above']);
    expect([p.anchor, p.x > at.x, p.y > at.y]).toEqual(['start', true, true]);
  });

  it('moves to the next side when a line runs through the first', () => {
    const throughRight: Seg = { x1: 215, y1: 100, x2: 215, y2: 160 };
    const p = placeLabel('today', at, BOUNDS, [throughRight], [], ['right-below', 'left-below']);
    expect(p.anchor).toBe('end');
    expect(p.x).toBeLessThan(at.x);
  });

  it('keeps a pad around a line, so a label does not sit against it', () => {
    const nearRight: Seg = { x1: at.x + 9 + textWidth('today') + 1, y1: 100, x2: at.x + 9 + textWidth('today') + 1, y2: 160 };
    const p = placeLabel('today', at, BOUNDS, [nearRight], [], ['right-below', 'left-below']);
    expect(p.anchor).toBe('end');
  });

  it('avoids a label already placed', () => {
    const first = placeLabel('due Dec 15', at, BOUNDS, [], [], ['left-above']);
    const second = placeLabel('done Oct 26 (est.)', at, BOUNDS, [], [labelRect(first, 'due Dec 15')], ['left-above', 'right-above']);
    expect(second.anchor).toBe('start');
  });

  it('never leaves the plot: a side that runs past the edge is skipped', () => {
    const near = { x: 480, y: 120 };
    const p = placeLabel('done Oct 26 (est.)', near, BOUNDS, [], [], ['right-above', 'left-above']);
    const r = labelRect(p, 'done Oct 26 (est.)');
    expect(r.x2).toBeLessThanOrEqual(BOUNDS.right);
    expect(p.anchor).toBe('end');
  });

  it('slides along its row to a clear spot when both sides are crossed', () => {
    const lines: Seg[] = [
      { x1: 170, y1: 0, x2: 170, y2: 300 },
      { x1: 215, y1: 0, x2: 215, y2: 300 },
    ];
    const p = placeLabel('today', at, BOUNDS, lines, [], ['right-below', 'left-below']);
    const r = labelRect(p, 'today');
    expect(lines.some((l) => l.x1 >= r.x1 && l.x1 <= r.x2)).toBe(false);
  });

  it('never puts a line between a slid label and its point', () => {
    const lines: Seg[] = [
      { x1: 208, y1: 0, x2: 208, y2: 300 }, // right beside the point
      { x1: 150, y1: 0, x2: 150, y2: 300 }, // and one on the left
    ];
    const p = placeLabel('today', at, BOUNDS, lines, [], ['right-below', 'left-below']);
    const r = labelRect(p, 'today');
    const between = lines.some((l) => (l.x1 > at.x && l.x1 < r.x1) || (l.x1 < at.x && l.x1 > r.x2));
    expect(between).toBe(false);
  });

  it('falls back to a clear spot farther away with a leader, and never leaves the label on a line', () => {
    const lines: Seg[] = [
      { x1: 150, y1: 0, x2: 150, y2: 300 },
      { x1: 215, y1: 0, x2: 215, y2: 300 },
      { x1: 150, y1: 140, x2: 215, y2: 100 }, // closes the gap between them
      { x1: 150, y1: 100, x2: 215, y2: 140 },
    ];
    const p = placeLabel('today', at, BOUNDS, lines, [], ['right-below', 'left-below']);
    const r = labelRect(p, 'today');
    expect(p.leader).toBe(true);
    expect(lines.some((l) => l.x1 === l.x2 && l.x1 >= r.x1 && l.x1 <= r.x2)).toBe(false);
  });

  it('crosses as few lines as it can when nowhere is clear', () => {
    const lines: Seg[] = Array.from({ length: 60 }, (_, i) => ({ x1: 28 + i * 8, y1: 0, x2: 28 + i * 8, y2: 300 }));
    lines.push({ x1: 215, y1: 0, x2: 215, y2: 300 }, { x1: 221, y1: 0, x2: 221, y2: 300 }, { x1: 227, y1: 0, x2: 227, y2: 300 });
    const p = placeLabel('today', at, BOUNDS, lines, [], ['right-below', 'left-below']);
    expect(p.anchor).toBe('end');
  });

  it('stays inside the plot even when no side fits', () => {
    const tiny: Bounds = { left: 190, right: 215, top: 100, bottom: 140 };
    const p = placeLabel('done Oct 26 (est.)', at, tiny, [], [], ['right-above']);
    const r = labelRect(p, 'done Oct 26 (est.)');
    expect(r.x1).toBeGreaterThanOrEqual(tiny.left);
  });
});
