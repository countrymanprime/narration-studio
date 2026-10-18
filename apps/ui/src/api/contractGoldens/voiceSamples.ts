// The golden payloads of the narrator's voice samples (apps/desktop/bindings_voicesamples.go).
import type { z } from 'zod';
import { voiceSampleAnswerSchema, voiceSamplesChangedSchema, voiceSamplesRemovedSchema, voiceSamplesSchema } from '../schemas/voiceSamples';

export const voiceSamplesGoldens: Record<string, z.ZodType> = {
  'voice-samples-list-empty.json': voiceSamplesSchema,
  'voice-samples-list.json': voiceSamplesSchema,
  'voice-sample-mark.json': voiceSampleAnswerSchema,
  'voice-sample-mark-refused.json': voiceSampleAnswerSchema,
  'voice-sample-update.json': voiceSampleAnswerSchema,
  'voice-sample-update-refused.json': voiceSampleAnswerSchema,
  'voice-samples-set-primary.json': voiceSamplesSchema,
  'voice-samples-removed.json': voiceSamplesRemovedSchema,
  'voice-samples-removed-all.json': voiceSamplesRemovedSchema,
  'voice-samples-changed.json': voiceSamplesChangedSchema,
};
