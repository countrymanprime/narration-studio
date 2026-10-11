// The golden payloads for character region listing and reference approval (ADR 0431: the acoustic-drift bindings are
// benched, so none is here): which schema owns each file in tests/fixtures/contracts/ (see index.ts).
import type { z } from 'zod';
import { approvedCharacterReferencesSchema, characterRegionsSchema, characterReferenceSchema } from '../schemas/character';

export const characterGoldens: Record<string, z.ZodType> = {
  'character-regions.json': characterRegionsSchema,
  'character-approve.json': characterReferenceSchema,
  'character-references.json': approvedCharacterReferencesSchema,
};
