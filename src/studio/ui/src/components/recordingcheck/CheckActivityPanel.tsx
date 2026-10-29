import { useEffect, useState } from 'react';
import { ActivityPanel } from '../primitives/ActivityPanel';
import { clock, PHASE_LABEL, type ActivityView } from './activityView';

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
 * What a recording check is doing: the overall bar, the phase, the models, the time so far, and three figures (chunks done, transcriptions
 * busy, passages the larger model re-checks). The figures are counts the check reported (`summarizeActivity`). `ticking` is false once the run
 * has ended, so the time stops.
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
    <ActivityPanel
      label="Check activity"
      percent={percent}
      running={ticking}
      phase={PHASE_LABEL[view.phase]}
      phaseTone={view.phase === 'done' ? 'success' : 'progress'}
      detail={models}
      time={clock(elapsed)}
      figures={[
        { key: 'chunks', icon: 'chunksTranscribed', label: 'Chunks', ...view.chunks },
        { key: 'workers', icon: 'transcriptionsAtOnce', label: 'Workers', ...view.workers },
        { key: 'recheck', icon: 'largerModelRecheck', label: 'Re-check', ...view.recheck },
      ]}
    />
  );
}
