import type { CSSProperties } from 'react';
import { StatTile, type StatTileTone } from './StatTile';

export type StatStripItem = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  unit?: string;
  /** 0 to 1. When given, a thin ok-toned ProgressBar is drawn under the value (StatTile's own default). */
  progress?: number;
  tone?: StatTileTone;
};

/**
 * The benchmark's one-card KPI row (mock B01): The mock draws
 * one card, its tiles divided by a 1 px `--border` rule, not one bordered card per figure. `StatStrip` is that one card:
 * a labelled list of `StatTile`s, ≈195 px each with 16 px padding, whichever consumer supplies the figures.
 *
 * It wraps into full rows by the width its card has: every tile in one row from 64 rem, half of them a row from
 * 36 rem (three, never two, for three tiles), two from 22 rem, one below that. In the two-column step an odd last tile spans
 * the row, so no tile sits alone beside a blank half under a rule that stops mid-card (alignment audit XPR2-16, XPR1-11, R4SM-6).
 * Each tile draws the rule on its left and top, and the card clips the ones on its own edges, so a rule runs between every
 * two tiles in any arrangement and a short last row leaves plain surface. The tiles of a row share their rows (a subgrid):
 * a label that wraps to two lines moves its neighbours' values down with its own, so the values of a row stay on one line
 * (R4TA-6).
 */
/** The columns of the half step: three tiles stay one row of three rather than two and a lone one. */
const halfStep = (count: number): number => (count <= 3 ? count : Math.ceil(count / 2));

export function StatStrip({ items, label = 'Figures', className = '' }: { items: readonly StatStripItem[]; label?: string; className?: string }) {
  const counts = { '--strip-all': items.length, '--strip-half': halfStep(items.length) } as CSSProperties;
  return (
    <div
      className={`@container overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] ${className}`}
    >
      <ul
        aria-label={label}
        style={counts}
        className="-m-px grid grid-cols-[repeat(var(--strip-cols),minmax(0,1fr))] [--strip-cols:1] [--strip-odd:1] @min-[22rem]:[--strip-cols:2] @min-[22rem]:[--strip-odd:2] @min-[36rem]:[--strip-cols:var(--strip-half)] @min-[36rem]:[--strip-odd:1] @min-[64rem]:[--strip-cols:var(--strip-all)]"
      >
        {items.map(({ key, ...tile }) => (
          <li
            key={key}
            className="row-span-4 grid min-w-0 grid-rows-subgrid border-t border-l border-[var(--border)] px-4 pt-3.5 pb-3 last:odd:col-span-(--strip-odd)"
          >
            <StatTile {...tile} className="contents" />
          </li>
        ))}
      </ul>
    </div>
  );
}
