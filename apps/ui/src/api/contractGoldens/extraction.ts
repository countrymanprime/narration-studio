// The golden payloads of the Story Bible's extraction suggestions (apps/desktop/bindings_extraction.go) and its scan
// (apps/desktop/bindings_extraction_scan.go).
import type { z } from 'zod';
import { extractionDecisionSchema, extractionScanJobSchema, extractionSourcesSchema, extractionSuggestionsSchema } from '../schemas/extraction';

export const extractionGoldens: Record<string, z.ZodType> = {
  'extraction-list.json': extractionSuggestionsSchema,
  'extraction-list-empty.json': extractionSuggestionsSchema,
  'extraction-accept.json': extractionDecisionSchema,
  'extraction-sources.json': extractionSourcesSchema,
  'extraction-scan-job.json': extractionScanJobSchema,
};
