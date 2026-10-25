// The golden payloads of Replace audio (src/studio/desktop/bindings_replace_contract_test.go).
import type { z } from 'zod';
import {
  narratorsChangeSchema,
  narratorsSchema,
  replaceAnswerSchema,
  replaceFileAnswerSchema,
  replaceFilePeaksSchema,
  replacePlanSchema,
  replacementsChangeSchema,
  replacementsSchema,
} from '../schemas/replace';

export const replaceGoldens: Record<string, z.ZodType> = {
  'replace-narrators.json': narratorsSchema,
  'replace-narrators-change.json': narratorsChangeSchema,
  'replace-file-refused.json': replaceFileAnswerSchema,
  'replace-plan-ok.json': replacePlanSchema,
  'replace-plan-unmeasured.json': replacePlanSchema,
  'replace-plan-refused.json': replacePlanSchema,
  'replace-range-ok.json': replaceAnswerSchema,
  'replace-range-refused.json': replaceAnswerSchema,
  'replace-restored.json': replaceAnswerSchema,
  'replacements-list.json': replacementsSchema,
  'replacements-change.json': replacementsChangeSchema,
  'replace-file-peaks.json': replaceFilePeaksSchema,
  'replace-file-peaks-none.json': replaceFilePeaksSchema,
};
