import type { ReactNode } from 'react';
import { StatTile } from '../../primitives/StatTile';
import { TooltipTarget } from '../../primitives/Tooltip';
import { kpiTiles, type KpiInputs, type OverviewTarget } from './overviewFigures';

type Props = KpiInputs & {
  onGo: (target: OverviewTarget) => void;
  /** SN-P52's Target info button, drawn on the Recording tile's corner. Nothing when absent. */
  targetInfo?: ReactNode;
};

/** The six KPI tiles of the mock's Production page, drawn as one card; each tile is a button that goes to its page. */
export function KpiRow({ onGo, targetInfo, ...inputs }: Props) {
  const tiles = kpiTiles(inputs);
  return (
    <div className="@container overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <ul
        aria-label="Production figures"
        style={{ '--strip-all': tiles.length, '--strip-half': Math.ceil(tiles.length / 2) } as React.CSSProperties}
        className="-m-px grid grid-cols-[repeat(var(--strip-cols),minmax(0,1fr))] [--strip-cols:1] @min-[22rem]:[--strip-cols:2] @min-[36rem]:[--strip-cols:var(--strip-half)] @min-[64rem]:[--strip-cols:var(--strip-all)]"
      >
        {tiles.map(({ key, target, tip, ...tile }) => (
          <li key={key} className="relative min-w-0 border-t border-l border-[var(--border)]">
            <TooltipTarget text={tip}>
              {/* native-control-ok: a whole KPI tile is the button, a card-shaped target Button's padded uppercase chrome cannot draw. */}
              <button
                type="button"
                className="block size-full cursor-pointer px-4 pt-3.5 pb-3 text-left hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]"
                onClick={() => onGo(target)}
              >
                <StatTile {...tile} />
              </button>
            </TooltipTarget>
            {key === 'recording' && targetInfo}
          </li>
        ))}
      </ul>
    </div>
  );
}
