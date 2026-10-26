import { describe, expect, it } from 'vitest';
import type { CoverageWorkerPlan } from '../../api/contracts/coverage';
import { workerPlanSentences } from './workerPlan';

const plan = (overrides: Partial<CoverageWorkerPlan>): CoverageWorkerPlan => ({
  requested: 0,
  workers: 4,
  threadsEach: 2,
  cpus: 8,
  computerCpus: 8,
  freeMemoryMB: 12_288,
  model: 'small',
  modelLabel: 'Small',
  modelMemoryMB: 700,
  limit: 'processors',
  chapters: 1,
  ...overrides,
});

describe('workerPlanSentences', () => {
  it('says what Automatic runs and that the processors set it', () => {
    expect(workerPlanSentences(plan({}))).toEqual({
      summary: 'Automatic: 4 transcriptions at once, using 8 of 8 processors for the Small model.',
      reason: 'Set by the processors: half of them, so each transcription has 2 processors.',
    });
  });

  it('says when the memory set it, with the model copy and the free memory', () => {
    const { summary, reason } = workerPlanSentences(
      plan({ workers: 1, threadsEach: 8, model: 'large-v3', modelLabel: 'Large v3', modelMemoryMB: 2600, freeMemoryMB: 4096, limit: 'memory' }),
    );
    expect(summary).toBe('Automatic: 1 transcription at once, using 8 of 8 processors for the Large v3 model.');
    expect(reason).toBe('Set by the memory: each copy of Large v3 takes about 2.5 GB and this computer has 4.0 GB free.');
  });

  it('says when a chosen number was cut down, and by what', () => {
    expect(workerPlanSentences(plan({ requested: 8, workers: 3, limit: 'memory' })).reason).toBe(
      'You chose 8, but only 3 fit in memory: each copy of Small takes about 0.7 GB and this computer has 12.0 GB free.',
    );
    expect(workerPlanSentences(plan({ requested: 12, workers: 8, threadsEach: 1, limit: 'processors' })).reason).toBe(
      'You chose 12; there are 8 processors to share, so 8 run at once.',
    );
    const kept = workerPlanSentences(plan({ requested: 3, workers: 3, limit: 'requested' }));
    expect(kept.summary).toBe('3 transcriptions at once, using 6 of 8 processors for the Small model.');
    expect(kept.reason).toMatch(/^The number you chose;/);
  });

  it('says the memory could not be read, and names each chapter’s share when chapters run together', () => {
    expect(workerPlanSentences(plan({ freeMemoryMB: 0, limit: 'model' })).reason).toBe(
      "This computer's free memory could not be read, so the Small model's own limit of 4 applies.",
    );
    expect(workerPlanSentences(plan({ chapters: 2, cpus: 4, workers: 2 })).summary).toBe(
      'Automatic: 2 transcriptions at once, using 4 of the 4 processors each chapter gets (2 chapters at once) for the Small model.',
    );
  });
});
