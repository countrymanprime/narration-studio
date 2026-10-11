import type { StageChapterRecommendation, StageSignal } from '../../../types';

/** A recommendation for tests and stories: one required signal per entry of `states`, in the host's shape. */
export function signal(id: string, state: StageSignal['state'], reason = 'Checked.', cause?: StageSignal['cause']): StageSignal {
  return {
    id,
    stage: 'recording',
    state,
    reason,
    ...(cause ? { cause } : {}),
    evidence: [],
    basis: { ledgerRecordIds: [], fingerprint: `fp-${id}-${state}`, projectFileModTime: '2026-09-21T10:00:00Z' },
    computedAt: '2026-09-21T10:00:00Z',
  };
}

export function recommendation(overrides: Partial<StageChapterRecommendation> = {}): StageChapterRecommendation {
  return {
    chapterId: 'c4',
    title: 'A chapter title',
    from: 'recording',
    target: 'editing',
    verdict: 'recommended',
    signals: [signal('recording.text_present', 'met', 'Every paragraph is in the recording.')],
    causes: [],
    basisKey: 'basis-a',
    ...overrides,
  };
}
