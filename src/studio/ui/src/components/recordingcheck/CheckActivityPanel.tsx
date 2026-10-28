import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faCheckDouble, faMicrochip, faPuzzlePiece } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useState } from 'react';
import { ProgressBar } from '../primitives/ProgressBar';
import { StatusBadge } from '../primitives/StatusBadge';
import { TooltipTarget } from '../primitives/Tooltip';
import { clock, PHASE_LABEL, type ActivityFigure, type ActivityView } from './activityView';

const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";

/** One figure: an icon that names it in a tooltip, its label, and its value on a line of its own. Its box does not change size with the value. */
function Figure({ icon, label, figure }: { icon: IconDefinition; label: string; figure: ActivityFigure }) {
  return (
    <li className="flex min-w-0 flex-col gap-0.5">
      <TooltipTarget text={figure.hint} className="min-w-0 items-center gap-1.5">
        <span tabIndex={0} aria-label={`${label}: ${figure.value}. ${figure.hint}`} className="flex min-w-0 items-center gap-1.5 rounded-sm">
          <span className="text-[var(--text-muted)]">
            <FontAwesomeIcon icon={icon} fixedWidth aria-hidden="true" />
          </span>
          <span className="truncate text-[length:var(--font-size-sm)] font-semibold text-[var(--text-muted)] uppercase">{label}</span>
        </span>
      </TooltipTarget>
      <span className={`truncate ${MONO}`} aria-hidden="true">
        {figure.value}
      </span>
    </li>
  );
}

/** Seconds since `startedAt`, once a second while `ticking`. */
function useElapsed(startedAt: number | undefined, ticking: boolean, now: () => number): number {
  const [current, setCurrent] = useState(() => now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setCurrent(now()), 1000);
    return () => clearInterval(timer);
  }, [ticking, now]);
  return startedAt === undefined ? 0 : Math.max(0, (current - startedAt) / 1000);
}

/**
 * What a recording check is doing, in a box that keeps its size: the overall bar, the phase, the time so far, and three figures (chunks done,
 * transcriptions busy, passages the larger model re-checks). The figures are counts the check reported; a figure that is not known yet reads
 * "–" in the same place. What each one means is its tooltip, never text in the flow. `ticking` is false once the run has ended, so the time stops.
 */
export function CheckActivityPanel({
  view,
  percent,
  startedAt,
  ticking,
  now = Date.now,
}: {
  view: ActivityView;
  percent: number;
  startedAt?: number;
  ticking: boolean;
  now?: () => number;
}) {
  const elapsed = useElapsed(startedAt, ticking, now);
  const models = view.recheckModel ? `${view.firstModel} → ${view.recheckModel}` : view.firstModel;
  return (
    <section
      aria-label="Check activity"
      className="flex h-[8.75rem] flex-col justify-between gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
    >
      <div className="flex items-center gap-3">
        <ProgressBar label="Overall progress" value={percent} running={ticking} valueText={`${Math.round(percent)} percent`} className="min-w-0 flex-1" />
        <span className={`w-10 shrink-0 text-right ${MONO}`}>{Math.round(percent)}%</span>
      </div>
      <div className="flex min-h-[1.375rem] items-center gap-2">
        <StatusBadge tone={view.phase === 'done' ? 'success' : 'progress'} shape="pill" label={PHASE_LABEL[view.phase]} />
        <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">{models ?? ''}</span>
        <span className={`shrink-0 ${MONO}`} aria-label={`Time so far ${clock(elapsed)}`}>
          {clock(elapsed)}
        </span>
      </div>
      <ul aria-label="Check figures" className="m-0 grid list-none grid-cols-3 gap-3 p-0">
        <Figure icon={faPuzzlePiece} label="Chunks" figure={view.chunks} />
        <Figure icon={faMicrochip} label="Workers" figure={view.workers} />
        <Figure icon={faCheckDouble} label="Re-check" figure={view.recheck} />
      </ul>
    </section>
  );
}
