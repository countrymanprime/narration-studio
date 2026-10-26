import { useEffect, useState } from 'react';
import type { CoverageStartOptions, CoverageWorkerPlan } from '../../api/contracts/coverage';
import { describeApiError } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';

const gigabytes = (mb: number): string => `${(mb / 1024).toFixed(1)} GB`;
const count = (value: number, one: string, many: string): string => `${value} ${value === 1 ? one : many}`;

/**
 * What a recording check's worker plan means, in two sentences: how many transcriptions run at once and on how many of this computer's
 * processors, then what set the number. The host's plan is the count a start sends (CoverageWorkerPlan), so these words are what runs.
 */
export function workerPlanSentences(plan: CoverageWorkerPlan): { summary: string; reason: string } {
  const used = Math.min(plan.cpus, plan.workers * plan.threadsEach);
  const where =
    plan.chapters > 1
      ? `${used} of the ${plan.cpus} processors each chapter gets (${plan.chapters} chapters at once)`
      : `${used} of ${plan.computerCpus} processors`;
  const lead = plan.requested === 0 ? 'Automatic: ' : '';
  const summary = `${lead}${count(plan.workers, 'transcription', 'transcriptions')} at once, using ${where} for the ${plan.modelLabel} model.`;
  return { summary, reason: reasonOf(plan) };
}

function reasonOf(plan: CoverageWorkerPlan): string {
  const copy = `each copy of ${plan.modelLabel} takes about ${gigabytes(plan.modelMemoryMB)}`;
  const free = plan.chapters > 1 ? `${gigabytes(plan.freeMemoryMB)} free for each chapter` : `${gigabytes(plan.freeMemoryMB)} free`;
  switch (plan.limit) {
    case 'memory':
      return plan.requested > plan.workers
        ? `You chose ${plan.requested}, but only ${plan.workers} fit in memory: ${copy} and this computer has ${free}.`
        : `Set by the memory: ${copy} and this computer has ${free}.`;
    case 'processors':
      return plan.requested > 0
        ? `You chose ${plan.requested}; there are ${count(plan.cpus, 'processor', 'processors')} to share, so ${plan.workers} run at once.`
        : `Set by the processors: half of them, so each transcription has ${count(plan.threadsEach, 'processor', 'processors')}.`;
    case 'model':
      return `This computer's free memory could not be read, so the ${plan.modelLabel} model's own limit of ${plan.workers} applies.`;
    case 'requested':
      return `The number you chose; ${copy} and this computer has ${free}.`;
  }
}

/** The host's plan for a check with these options, read again whenever they change or `again` does (a saved setting the plan reads, such as
 * the model); `error` is a failed read, shown where the plan would be. */
export function useWorkerPlan(options: CoverageStartOptions | undefined, again?: unknown): { plan?: CoverageWorkerPlan; error: string } {
  const coverage = usePort('coverage');
  const [plan, setPlan] = useState<CoverageWorkerPlan>();
  const [error, setError] = useState('');
  const { model, recheck, recheckModel, workers, chapters } = options ?? {};
  useEffect(() => {
    let active = true;
    const asked: CoverageStartOptions = {};
    if (model !== undefined) asked.model = model;
    if (recheck !== undefined) asked.recheck = recheck;
    if (recheckModel !== undefined) asked.recheckModel = recheckModel;
    if (workers !== undefined) asked.workers = workers;
    if (chapters !== undefined) asked.chapters = chapters;
    coverage
      .coverageWorkerPlan(asked)
      .then((answer) => {
        if (!active) return;
        setPlan(answer);
        setError('');
      })
      .catch((reason: unknown) => {
        if (active) setError(describeApiError(reason));
      });
    return () => {
      active = false;
    };
  }, [coverage, model, recheck, recheckModel, workers, chapters, again]);
  return { plan, error };
}
