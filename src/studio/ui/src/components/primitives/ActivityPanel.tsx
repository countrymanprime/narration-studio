import type { IconName } from '../../icons.catalog';
import { ProgressBar } from './ProgressBar';
import { MONO, StatTile } from './StatTile';
import { StatusBadge, type StatusTone } from './StatusBadge';
import { TooltipTarget } from './Tooltip';

/** One figure of the panel: an icon and label that name it (the hint is its tooltip and its accessible description), and its value. */
export type ActivityFigure = { key: string; icon: IconName; label: string; value: string; hint: string };

/**
 * What a long job is doing, in a box that keeps its size whatever it says: the overall bar, a phase badge with a short detail and the time so
 * far, and a row of figures (done of total, workers busy, ...). A figure that is not known yet reads "–" in the same place. What each figure
 * means is its tooltip, never text in the flow (design-system "No in-flow instructions"). The recording check draws it (`CheckActivityPanel`);
 * any job that reports counts can pass its own figures.
 */
export function ActivityPanel({
  label,
  percent,
  running,
  phase,
  phaseTone = 'progress',
  detail,
  time,
  figures,
}: {
  label: string;
  percent: number;
  running: boolean;
  phase: string;
  phaseTone?: StatusTone;
  detail?: string;
  time?: string;
  figures: readonly ActivityFigure[];
}) {
  return (
    <section
      aria-label={label}
      className="@container flex h-[8.75rem] flex-col justify-between gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
    >
      <div className="flex items-center gap-3">
        <ProgressBar label="Overall progress" value={percent} running={running} valueText={`${Math.round(percent)} percent`} className="min-w-0 flex-1" />
        <span className={`w-10 shrink-0 text-right ${MONO}`}>{Math.round(percent)}%</span>
      </div>
      <div className="flex min-h-[1.375rem] items-center gap-2">
        <StatusBadge tone={phaseTone} shape="pill" label={phase} />
        <span className="min-w-0 flex-1">
          {detail ? (
            <TooltipTarget text={detail} className="max-w-full">
              <span tabIndex={0} aria-label={detail} className="block max-w-full truncate rounded-sm text-[var(--text-muted)]">
                {detail}
              </span>
            </TooltipTarget>
          ) : null}
        </span>
        {time ? (
          <span className={`shrink-0 ${MONO}`} aria-label={`Time so far ${time}`}>
            {time}
          </span>
        ) : null}
      </div>
      <ul
        aria-label="Figures"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, figures.length)}, minmax(0, 1fr))` }}
        className="m-0 grid list-none gap-3 p-0"
      >
        {figures.map((figure) => (
          <li key={figure.key} className="flex min-w-0">
            <TooltipTarget text={figure.hint} className="min-w-0">
              <span tabIndex={0} aria-label={`${figure.label}: ${figure.value}. ${figure.hint}`} className="block min-w-0 rounded-sm">
                <StatTile icon={figure.icon} label={figure.label} value={figure.value} className="min-w-0 [&>div:nth-child(2)]:truncate" />
              </span>
            </TooltipTarget>
          </li>
        ))}
      </ul>
    </section>
  );
}
