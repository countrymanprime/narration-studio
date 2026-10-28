// The golden payloads for recording coverage: which schema owns each file in tests/fixtures/contracts/ (see index.ts).
import { z } from 'zod';
import { findingSchema } from '../schemas/findings';
import {
  coverageEnginesSchema,
  coverageGapReviewsSchema,
  coverageWorkerPlanSchema,
  coverageResultSchema,
  coverageStartResultSchema,
  coverageStateSchema,
} from '../schemas/coverage';

export const coverageGoldens: Record<string, z.ZodType> = {
  'coverage-result-current.json': coverageResultSchema,
  'coverage-result-stale.json': coverageResultSchema,
  'coverage-result-never.json': coverageResultSchema,
  'coverage-result-unmapped.json': coverageResultSchema,
  // The model cascade's own result (MC5): result.recheck names the re-check model and its windows.
  'coverage-result-cascade.json': coverageResultSchema,
  'coverage-result-repeat.json': coverageResultSchema,
  'coverage-engines.json': coverageEnginesSchema,
  'coverage-worker-plan.json': coverageWorkerPlanSchema,
  // An accepted gap is an ordinary finding; the reviews map follows it.
  'coverage-gap-review-accepted.json': findingSchema,
  'coverage-gap-review-reviews.json': coverageGapReviewsSchema,
  'coverage-start-started.json': coverageStartResultSchema,
  'coverage-start-refused.json': coverageStartResultSchema,
  'coverage-state-idle.json': coverageStateSchema,
  'coverage-state-complete.json': coverageStateSchema,
  // A running check with the activity the sidecar reports (workers busy, chunks done, the larger model's passages).
  'coverage-state-running-activity.json': coverageStateSchema,
  // Not a payload: the reason words the host can send, which the schema's lists must equal (the test below).
  'coverage-reasons.json': z.object({ refusal: z.array(z.string()), evaluator: z.array(z.string()) }),
};
