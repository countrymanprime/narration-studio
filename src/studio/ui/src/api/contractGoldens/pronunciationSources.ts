// The golden payloads of the pronunciation sources and candidate bindings (apps/desktop/bindings_pronunciationsources.go, written
// from the fake online dictionary).
import type { z } from 'zod';
import { pronunciationCandidateSchema, pronunciationSourcesSchema } from '../schemas/pronunciationSources';

export const pronunciationSourcesGoldens: Record<string, z.ZodType> = {
  'pronunciation-sources.json': pronunciationSourcesSchema,
  'pronunciation-candidate-ok.json': pronunciationCandidateSchema,
  'pronunciation-candidate-miss.json': pronunciationCandidateSchema,
};
