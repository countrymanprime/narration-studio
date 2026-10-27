import { MIN_RANGE, fineClock, rangeLabel, type Span } from './rangeMath';
import type { RangeInteraction } from './useRangeInteraction';

/** The width of a handle, in pixels. It hangs outside the edge it moves, so the two never cover each other. */
const HANDLE = 6;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * The range drawn over the waveform: its body, which moves all of it, and a slider handle on each edge. What the range comes to (its time and
 * words) is the body's tooltip; nothing is written under the waveform (#2251).
 */
export function RangeOverlay({
  interaction,
  t0,
  viewStart,
  viewLen,
  bounds,
}: {
  interaction: RangeInteraction;
  t0: number;
  /** The view's start and length, seconds from `t0`. */
  viewStart: number;
  viewLen: number;
  bounds: Span;
}) {
  const { shown, covered } = interaction;
  if (!shown) return null;
  const at = (t: number): number => ((t - t0 - viewStart) / viewLen) * 100;
  const x0 = clamp(at(shown.start), 0, 100);
  const x1 = clamp(at(shown.end), 0, 100);
  const label = rangeLabel(shown, covered.keys.length);
  const handle = (edge: 'start' | 'end') => {
    const here = shown[edge];
    const off = at(here) < 0 || at(here) > 100;
    const x = clamp(at(here), 0, 100);
    const props = interaction.handle(edge);
    return (
      <div
        key={edge}
        role="slider"
        tabIndex={0}
        aria-label={edge === 'start' ? 'Start of range' : 'End of range'}
        aria-orientation="horizontal"
        aria-valuemin={edge === 'start' ? bounds.start : Math.min(bounds.end, shown.start + MIN_RANGE)}
        aria-valuemax={edge === 'start' ? Math.max(bounds.start, shown.end - MIN_RANGE) : bounds.end}
        aria-valuenow={Math.round(here * 1000) / 1000}
        aria-valuetext={`${edge === 'start' ? 'Start' : 'End'} ${fineClock(here)}, range ${label}`}
        data-handle={edge}
        data-offscreen={off || undefined}
        className={`absolute top-0 h-full w-1.5 cursor-ew-resize touch-none bg-[var(--accent)] opacity-70 hover:opacity-100 focus-visible:opacity-100 ${edge === 'start' ? 'rounded-l' : 'rounded-r'} ${off ? 'opacity-30' : ''}`}
        // The start handle hangs left of its edge and the end handle right of it; at the paragraph's own ends they slide in rather than out of the box.
        style={{ left: edge === 'start' ? `clamp(0px, calc(${x}% - ${HANDLE}px), calc(100% - ${HANDLE}px))` : `clamp(0px, ${x}%, calc(100% - ${HANDLE}px))` }}
        {...props}
      />
    );
  };
  return (
    <>
      {x1 > x0 ? (
        <div
          role="group"
          aria-label={`Range ${label}`}
          title={label}
          data-range-body
          className="absolute top-0 h-full cursor-grab touch-none border-x-2 border-[var(--accent)] bg-[var(--accent-soft)] opacity-60 active:cursor-grabbing"
          style={{ left: `${x0}%`, width: `${x1 - x0}%` }}
          {...interaction.body}
        />
      ) : null}
      {handle('start')}
      {handle('end')}
    </>
  );
}
