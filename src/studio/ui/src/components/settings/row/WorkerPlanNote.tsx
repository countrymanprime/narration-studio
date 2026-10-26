import { useWorkerPlan, workerPlanSentences } from '../../recordingcheck/workerPlan';

/** The `workerPlan` live line of a setting row: what the value shown would run on this computer, as the host plans it, or why it cannot say. */
export function WorkerPlanNote({ value, again }: { value: string; again?: unknown }) {
  const workers = Number(value);
  const { plan, error } = useWorkerPlan(Number.isInteger(workers) && workers >= 0 ? { workers } : undefined, again);
  if (error) {
    return (
      <span data-live="workerPlan" className="max-w-[52ch] text-[0.8125rem] text-[var(--danger-text)]">
        Could not work out how many run at once: {error}
      </span>
    );
  }
  if (!plan) {
    return (
      <span data-live="workerPlan" className="text-[0.8125rem] text-[var(--text-muted)]">
        Working out how many run at once…
      </span>
    );
  }
  const { summary, reason } = workerPlanSentences(plan);
  return (
    <span data-live="workerPlan" aria-live="polite" className="flex max-w-[52ch] flex-col text-[0.8125rem] text-[var(--text-muted)]">
      <span className="font-medium text-[var(--text)]">{summary}</span>
      <span>{reason}</span>
    </span>
  );
}
