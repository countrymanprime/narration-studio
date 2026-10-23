// The mastering port's choice payload's golden files: which schema owns each file in tests/fixtures/contracts/ (see
// index.ts). Written by src/studio/desktop/bindings_mastering_test.go (UPDATE_CONTRACTS=1).
import type { z } from 'zod';
import { masteringProvidersSchema } from '../schemas/mastering';

export const masteringGoldens: Record<string, z.ZodType> = {
  'mastering-providers-no-project.json': masteringProvidersSchema,
  'mastering-providers-builtin-chosen.json': masteringProvidersSchema,
  'mastering-providers-daw-chosen.json': masteringProvidersSchema,
  'mastering-providers-audacity-chosen.json': masteringProvidersSchema,
  'mastering-providers-unknown-choice.json': masteringProvidersSchema,
};
