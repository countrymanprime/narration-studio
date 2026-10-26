import type { DocItem } from '../model';
import { subWordNote } from '../range/common/spanRequest';
import { MIN_RANGE, fineClock, rangeLabel, type Covered, type Span } from './rangeMath';
import type { RangeInteraction } from './useRangeInteraction';

/** The width of a handle, in pixels. It hangs outside the edge it moves, so the two never cover each other. */
const HANDLE = 6;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const pct = (n: number): string => `${Math.round(n * 100)}%`;

/** The range drawn over the waveform: its body, which moves all of it, and a slider handle on each edge. */
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

const textOf = (words: readonly DocItem[], key: string): string => words.find((w) => w.key === key)?.text ?? key;

/** What the range comes to in words, for the line under the waveform: its length, which words it takes, and an edge that passes through a word. */
function partialText(covered: Covered, words: readonly DocItem[]): string {
  const part = (cover: NonNullable<Covered['start']>): string =>
    `“${textOf(words, cover.key)}” (${covered.keys.includes(cover.key) ? 'selected' : 'not selected'})`;
  const { start, end } = covered;
  if (start && end && start.key === end.key) return `Covers ${pct(start.fraction)} of ${part(start)}.`;
  return [
    start ? `Start: covers the last ${pct(start.fraction)} of ${part(start)}.` : '',
    end ? `End: covers the first ${pct(end.fraction)} of ${part(end)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The lines under the waveform: the range's time and words, the words an edge cuts through, and the sub-word preview. With no range they are
 * empty: how to make one is behind the "?" above the waveform, never a line here (#2251).
 */
export function RangeNotes({ shown, covered, words }: { shown: Span | null; covered: Covered; words: readonly DocItem[] }) {
  if (!shown) return null;
  const partial = partialText(covered, words);
  const sub = subWordNote(shown, covered.applied);
  return (
    // One wrapping paragraph, so the notes take only the lines they need in the waveform's fixed height.
    <p className="m-0 px-3 text-xs text-[var(--text-muted)]" data-range-notes>
      <span>
        Range <span className="font-mono text-[var(--text)]">{rangeLabel(shown, covered.keys.length)}</span>
        {covered.keys.length ? '.' : '. This range covers no words.'}
      </span>
      {partial ? <span data-testid="range-partial"> {partial}</span> : null}
      {sub ? <span data-subword> {sub}</span> : null}
    </p>
  );
}
