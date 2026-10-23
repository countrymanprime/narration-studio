// The golden payloads of the Booth's passage map (apps/desktop/bindings_passagemap.go).
import type { z } from 'zod';
import { passageMapSchema } from '../schemas/passageMap';

export const passageMapGoldens: Record<string, z.ZodType> = {
  'passagemap-record.json': passageMapSchema,
  'passagemap-list.json': passageMapSchema,
};
