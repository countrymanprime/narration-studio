// The golden payload of the prep completeness rollup (apps/desktop/bindings_prepcompleteness.go).
import type { z } from 'zod';
import { prepCompletenessSummarySchema } from '../schemas/prepCompleteness';

export const prepCompletenessGoldens: Record<string, z.ZodType> = {
  'prep-completeness-summary.json': prepCompletenessSummarySchema,
};
