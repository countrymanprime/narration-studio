// The golden payloads of the Story Bible's extraction suggestions (apps/desktop/bindings_extraction.go) and its scan
// (apps/desktop/bindings_extraction_scan.go) and its import (apps/desktop/bindings_extraction_import.go).
import type { z } from 'zod';
import {
  extractionDecisionSchema,
  extractionImportPlanSchema,
  extractionImportPromptSchema,
  extractionImportResultSchema,
  extractionImportUndoneSchema,
  extractionScanJobSchema,
  extractionSourcesSchema,
  extractionSuggestionsSchema,
} from '../schemas/extraction';

export const extractionGoldens: Record<string, z.ZodType> = {
  'extraction-list.json': extractionSuggestionsSchema,
  'extraction-list-empty.json': extractionSuggestionsSchema,
  'extraction-accept.json': extractionDecisionSchema,
  'extraction-sources.json': extractionSourcesSchema,
  'extraction-scan-job.json': extractionScanJobSchema,
  'extraction-import-preview.json': extractionImportPlanSchema,
  'extraction-import-preview-errors.json': extractionImportPlanSchema,
  'extraction-import-commit.json': extractionImportResultSchema,
  'extraction-import-undo.json': extractionImportUndoneSchema,
  'extraction-import-prompt.json': extractionImportPromptSchema,
};
