// The golden payloads of the take evidence binding (apps/desktop/internal/passagetakes/contract_test.go, written from
// synthetic WAVs).
import type { z } from 'zod';
import { takeEvidenceResultSchema } from '../schemas/takeEvidence';

export const takeEvidenceGoldens: Record<string, z.ZodType> = {
  'workspace-take-evidence-full.json': takeEvidenceResultSchema,
  'workspace-take-evidence-partial.json': takeEvidenceResultSchema,
  'workspace-take-evidence-none.json': takeEvidenceResultSchema,
};
