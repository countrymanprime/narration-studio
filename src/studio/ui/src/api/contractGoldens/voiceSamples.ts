// The golden payloads of the narrator's voice samples (src/studio/desktop/bindings_voicesamples.go).
import { z } from 'zod';
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
  // Every refusal reason and the sentence the host words it with; the page's table of the same words is compared with it.
  'voice-sample-refusal-sentences.json': z.record(z.string(), z.string().min(1)),
};
