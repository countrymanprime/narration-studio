import { describe, expect, it } from 'vitest';
import { drawRibbon, STILL_FRAME, type RibbonColors, type RibbonFrame } from './drawRibbon';
import type { PeakColumn } from './peaksWindow';
import { BAR_GAP, BAR_RADIUS, PULSE, barLayout, halfHeight } from './ribbonBars';
import type { RibbonLayout } from './ribbonLayout';

const colors: RibbonColors = {
  bars: 'played',
  unplayed: 'unplayed',
  tick: 'tick',
  band: 'band',
  playhead: 'head',
  tint: { extra: 'tint-extra', mis: 'tint-mis', low: 'tint-low' },
  bar: { extra: 'bar-extra', mis: 'bar-mis', low: 'bar-low' },
};

interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  fill: string;
}

/** A canvas that records the rounded bars filled, the fill colour in force for each path, and every other operation. */
function recorder(width = 700, height = 56) {
  const bars: Bar[] = [];
  const ops: string[] = [];
  let path: Omit<Bar, 'fill'>[] = [];
  let fillStyle = '';
  const ctx = {
    set fillStyle(v: string) {
      fillStyle = v;
    },
    get fillStyle() {
      return fillStyle;
    },
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    setTransform: () => ops.push('setTransform'),
    clearRect: () => ops.push('clearRect'),
    beginPath: () => {
      path = [];
    },
    roundRect: (x: number, y: number, w: number, h: number, r: number) => path.push({ x, y, w, h, r }),
    fill: () => {
      for (const b of path) bars.push({ ...b, fill: fillStyle });
      ops.push('fill');
    },
    fillRect: (...a: number[]) => ops.push(`fillRect ${fillStyle} ${a[3]}`),
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    clip: () => ops.push('clip'),
    rect: () => ops.push('rect'),
    moveTo: () => ops.push('moveTo'),
    lineTo: () => ops.push('lineTo'),
    stroke: () => ops.push(`stroke ${ctx.strokeStyle}`),
  };
  const sets: Record<string, number> = { width: 0, height: 0 };
  const canvas = {
    get width() {
      return sets.width;
    },
    set width(v: number) {
      sets.width = v;
      sets.widthWrites = (sets.widthWrites ?? 0) + 1;
    },
    get height() {
      return sets.height;
    },
    set height(v: number) {
      sets.height = v;
    },
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  return { canvas, bars, ops, sets, size: { width, height, dpr: 1 } };
}

const layout = (over: Partial<RibbonLayout> = {}): RibbonLayout => ({
  pid: 'p',
  t0: 0,
  t1: 10,
  ticks: [],
  flags: [],
  cuts: [],
  band: null,
  playhead: null,
  flagged: 0,
  description: '',
  ...over,
});
const flat = (n: number, level = 60): PeakColumn[] => Array.from({ length: n }, () => [-level, level] as PeakColumn);
const moving = (nowMs: number, sinceUpdateMs = 0): RibbonFrame => ({ nowMs, sinceUpdateMs, animate: true });
const TOP_OF_BEAT = 1000 / PULSE.hz / 2;

describe('drawRibbon bars', () => {
  it('draws one rounded bar for each column on the site gap, symmetric about the middle line, filling the width', () => {
    const r = recorder();
    const n = barLayout(700).count;
    drawRibbon(r.canvas, r.size, layout(), flat(n), colors);
    expect(r.bars).toHaveLength(n);
    const { pitch, barWidth } = barLayout(700);
    r.bars.forEach((b, i) => {
      expect(b.x).toBeCloseTo(i * pitch, 6);
      expect(b.w).toBeCloseTo(barWidth, 6);
      expect(b.r).toBeCloseTo(Math.min(BAR_RADIUS, barWidth / 2), 6);
      expect(b.y + b.h / 2).toBeCloseTo(28, 6);
    });
    expect(r.bars[1].x - (r.bars[0].x + r.bars[0].w)).toBeCloseTo(BAR_GAP, 6);
    const last = r.bars[n - 1];
    expect(last.x + last.w).toBeCloseTo(700, 6);
  });

  it('draws silence as a bar of the minimum height, not nothing', () => {
    const r = recorder();
    drawRibbon(r.canvas, r.size, layout(), [[0, 0]], colors);
    expect(r.bars).toHaveLength(1);
    expect(r.bars[0].h).toBe(4);
  });

  it('with no playhead every bar is the one colour and none is grown', () => {
    const r = recorder();
    const cols = flat(40);
    drawRibbon(r.canvas, r.size, layout(), cols, colors, moving(TOP_OF_BEAT));
    expect(new Set(r.bars.map((b) => b.fill))).toEqual(new Set(['played']));
    expect(new Set(r.bars.map((b) => b.h))).toEqual(new Set([halfHeight([-60, 60], 28) * 2]));
  });

  it('splits played from unplayed at the playhead, in two colours that differ', () => {
    const r = recorder();
    const cols = flat(40);
    drawRibbon(r.canvas, r.size, layout({ playhead: 5 }), cols, colors);
    const played = r.bars.filter((b) => b.fill === 'played');
    const rest = r.bars.filter((b) => b.fill === 'unplayed');
    expect(played).toHaveLength(20);
    expect(rest).toHaveLength(20);
    expect(Math.max(...played.map((b) => b.x))).toBeLessThan(Math.min(...rest.map((b) => b.x)));
    expect(colors.bars).not.toBe(colors.unplayed);
  });

  it('a playhead at either end leaves all bars unplayed or all played', () => {
    const start = recorder();
    drawRibbon(start.canvas, start.size, layout({ playhead: 0 }), flat(30), colors);
    expect(new Set(start.bars.map((b) => b.fill))).toEqual(new Set(['unplayed']));
    const end = recorder();
    drawRibbon(end.canvas, end.size, layout({ playhead: 10 }), flat(30), colors);
    expect(new Set(end.bars.map((b) => b.fill))).toEqual(new Set(['played']));
  });
});

describe('drawRibbon motion', () => {
  const heights = (frame: RibbonFrame) => {
    const r = recorder();
    drawRibbon(r.canvas, r.size, layout({ playhead: 5 }), flat(41, 40), colors, frame);
    return r.bars.map((b) => b.h);
  };

  it('grows the bars under the playhead and not the ones far from it', () => {
    const still = heights(STILL_FRAME);
    const live = heights(moving(TOP_OF_BEAT));
    expect(live[20]).toBeGreaterThan(still[20] * 1.4);
    expect(live[0]).toBe(still[0]);
    expect(live[40]).toBe(still[40]);
  });

  it('decays away from the playhead: nearer bars are taller than further ones, on each side', () => {
    const live = heights(moving(TOP_OF_BEAT));
    for (let i = 20; i > 14; i -= 1) expect(live[i]).toBeGreaterThanOrEqual(live[i - 1]);
    for (let i = 21; i < 23; i += 1) expect(live[i]).toBeGreaterThanOrEqual(live[i + 1]);
  });

  it('pulses: the same bar is a different height at different points of the beat', () => {
    expect(heights(moving(0))[20]).toBeLessThan(heights(moving(TOP_OF_BEAT))[20]);
  });

  it('a still frame (reduced motion, or stopped) draws every bar at rest, with the played split kept', () => {
    const r = recorder();
    drawRibbon(r.canvas, r.size, layout({ playhead: 5 }), flat(41, 40), colors, STILL_FRAME);
    expect(new Set(r.bars.map((b) => b.h))).toEqual(new Set([halfHeight([-40, 40], 28) * 2]));
    expect(r.bars.some((b) => b.fill === 'played')).toBe(true);
    expect(r.bars.some((b) => b.fill === 'unplayed')).toBe(true);
  });

  it('never grows a bar past the canvas', () => {
    const r = recorder();
    drawRibbon(r.canvas, r.size, layout({ playhead: 5 }), flat(41, 127), colors, moving(TOP_OF_BEAT));
    for (const b of r.bars) {
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h).toBeLessThanOrEqual(56);
    }
  });

  it('moves the playhead on between host updates, and no further than the window', () => {
    const at = (since: number, playhead = 5) => {
      const r = recorder();
      drawRibbon(r.canvas, r.size, layout({ playhead }), flat(100), colors, moving(0, since));
      return r.bars.filter((b) => b.fill === 'played').length;
    };
    expect(at(300)).toBeGreaterThan(at(0));
    expect(at(0, 9.99)).toBeLessThanOrEqual(100);
    expect(at(400, 9.99)).toBe(100);
  });
});

describe('drawRibbon overlays', () => {
  it('still draws flagged tints with their top bar, the selection band, ticks, the cut hatching and the playhead around the new bars', () => {
    const r = recorder();
    drawRibbon(
      r.canvas,
      r.size,
      layout({
        flags: [{ t0: 1, t1: 2, kind: 'mis' }],
        band: { t0: 3, t1: 4 },
        ticks: [1, 2, 3],
        cuts: [{ t0: 6, t1: 6 }],
        playhead: 5,
      }),
      flat(40),
      colors,
    );
    expect(r.ops).toContain('fillRect tint-mis 56');
    expect(r.ops).toContain('fillRect bar-mis 3');
    expect(r.ops).toContain('fillRect band 56');
    expect(r.ops.filter((o) => o === 'stroke tick').length).toBeGreaterThanOrEqual(3);
    expect(r.ops).toContain('clip');
    expect(r.ops).toContain('stroke head');
    // the tints are under the bars and the playhead over them
    expect(r.ops.indexOf('fillRect tint-mis 56')).toBeLessThan(r.ops.indexOf('fill'));
    expect(r.ops.lastIndexOf('fill')).toBeLessThan(r.ops.indexOf('stroke head'));
  });

  it('draws the tail past the audio, the runway after the last word, as bars at the minimum height', () => {
    // 80 columns over 4.35 s; the last 0.35 s lies past the end of the entry, where peaksWindow gives [0, 0].
    const cols: PeakColumn[] = [...flat(72), ...Array.from({ length: 8 }, () => [0, 0] as PeakColumn)];
    const r = recorder(560);
    drawRibbon(r.canvas, r.size, layout({ t1: 4.35 }), cols, colors);
    expect(r.bars).toHaveLength(80);
    expect(r.bars.slice(72).every((b) => b.h === 4)).toBe(true);
    expect(r.bars[79].x + r.bars[79].w).toBeCloseTo(560, 6);
  });
});

describe('drawRibbon canvas', () => {
  it('sizes the canvas once for its width and does not reallocate it on later frames', () => {
    const r = recorder();
    const size = { ...r.size, dpr: 2 };
    drawRibbon(r.canvas, size, layout(), flat(10), colors);
    drawRibbon(r.canvas, size, layout({ playhead: 5 }), flat(10), colors, moving(10));
    drawRibbon(r.canvas, size, layout({ playhead: 5 }), flat(10), colors, moving(26));
    expect(r.sets.width).toBe(1400);
    expect(r.sets.height).toBe(112);
    expect(r.sets.widthWrites).toBe(1);
  });
});
