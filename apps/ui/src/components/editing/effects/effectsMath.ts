import type { WordFx } from '../../../api/contracts/wordFx';
import type { CutSpan, Range } from '../model';
import { fxSpan } from '../range/fx/fxCommand';

/**
 * The most of a chapter effects may cover, in percent. The mock keeps it as a project setting; until a settings slice adds one it is this
 * constant, and the strip says so.
 */
export const FX_CAP_PCT = 10;

/** Where the cap comes from, shown beside it. */
export const CAP_SOURCE = 'Fixed for now: a project setting is planned.';

export interface Span {
  start: number;
  end: number;
}

/** A stretch of the chapter and how many effects stack on it. */
interface CoverSeg extends Span {
  n: number;
}

export interface Coverage {
  /** Seconds covered by at least one effect, counted once. */
  sec: number;
  pct: number;
  segs: CoverSeg[];
  total: number;
}

export type CapState = 'within' | 'over' | 'far';

/** The effects that count: one whose words changed (stale) sits on no audio the app can place, so it covers nothing. */
export const liveEffects = (effects: readonly WordFx[]): WordFx[] => effects.filter((f) => !f.stale);

/** Where an effect sounds now, clipped to the chapter. */
export function spanOf(fx: Pick<WordFx, 'a' | 'b'>, cuts: readonly CutSpan[], total: number): Span {
  const s = fxSpan(fx, cuts);
  return { start: Math.max(0, s.start), end: Math.min(total, s.end) };
}

/** The chapter cut at every edge, with how many spans stack on each piece; pieces with none are left out. */
function coverSegments(spans: readonly Span[], total: number): CoverSeg[] {
  const edges = [...new Set([0, total, ...spans.flatMap((s) => [s.start, s.end])])].filter((x) => x >= 0 && x <= total).sort((a, b) => a - b);
  const out: CoverSeg[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const mid = (edges[i] + edges[i + 1]) / 2;
    const n = spans.filter((s) => s.start <= mid && mid < s.end).length;
    if (n) out.push({ start: edges[i], end: edges[i + 1], n });
  }
  return out;
}

/** What the effects that are on cover of the chapter: the union of their spans, so overlapping effects count once. */
export function coverageOf(spans: readonly Span[], total: number): Coverage {
  const segs = coverSegments(spans, total);
  const sec = segs.reduce((a, s) => a + (s.end - s.start), 0);
  return { sec, pct: total ? (sec / total) * 100 : 0, segs, total };
}

/** The coverage of a chapter's stored effects, where they sound now. */
export const coverageOfEffects = (effects: readonly WordFx[], cuts: readonly CutSpan[], total: number): Coverage =>
  coverageOf(
    liveEffects(effects).map((f) => spanOf(f, cuts, total)),
    total,
  );

/** Over the cap warns; more than twice the cap warns louder. */
export const capState = (pct: number, cap: number): CapState => (pct > cap * 2 ? 'far' : pct > cap ? 'over' : 'within');

export const fmtPct = (n: number): string => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

export interface Impact {
  before: number;
  after: number;
  over: boolean;
  far: boolean;
}

/** What adding an effect over `extra` does to the coverage, against the cap. */
export function impactOf(effects: readonly WordFx[], cuts: readonly CutSpan[], total: number, extra: Span, cap = FX_CAP_PCT): Impact {
  const spans = liveEffects(effects).map((f) => spanOf(f, cuts, total));
  const before = coverageOf(spans, total).pct;
  const after = coverageOf([...spans, { start: Math.max(0, extra.start), end: Math.min(total, extra.end) }], total).pct;
  return { before, after, over: after > cap && after > before, far: after > cap * 2 };
}

/** The sentence the Add FX question shows when the effect takes the coverage over the cap, else ''. */
export function capSentence(
  effects: readonly WordFx[],
  cuts: readonly CutSpan[],
  total: number,
  range: Pick<Range, 'start' | 'end'>,
  cap = FX_CAP_PCT,
): string {
  const i = impactOf(effects, cuts, total, range, cap);
  return i.over ? `This takes coverage from ${fmtPct(i.before)} to ${fmtPct(i.after)}, over the ${fmtPct(cap)} cap.` : '';
}

/** The share of the chapter one effect covers (percent). */
export const shareOf = (fx: Pick<WordFx, 'a' | 'b'>, cuts: readonly CutSpan[], total: number): number => {
  const s = spanOf(fx, cuts, total);
  return total ? ((s.end - s.start) / total) * 100 : 0;
};
