// The golden payloads of the pronunciation sources and candidate bindings (src/studio/desktop/bindings_pronunciationsources.go, written
// from the fake online dictionary).
import type { z } from 'zod';
import { guidePreviewSchema } from '../schemas/storyBible';
import {
  pronunciationCandidateSchema,
  pronunciationCandidatesSchema,
  pronunciationSourcesSchema,
  userDictionaryWordSchema,
} from '../schemas/pronunciationSources';

export const pronunciationSourcesGoldens: Record<string, z.ZodType> = {
  'pronunciation-sources.json': pronunciationSourcesSchema,
  'pronunciation-candidate-ok.json': pronunciationCandidateSchema,
  'pronunciation-candidate-miss.json': pronunciationCandidateSchema,
  'pronunciation-candidates.json': pronunciationCandidatesSchema,
  'pronunciation-candidates-misses.json': pronunciationCandidatesSchema,
  'pronunciation-preview-ready.json': guidePreviewSchema,
  'user-dictionary-entry.json': userDictionaryWordSchema,
  'user-dictionary-entry-removed.json': userDictionaryWordSchema,
};
