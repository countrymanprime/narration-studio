// The golden payloads of a project's voice setup (src/studio/desktop/bindings_voicetracks.go).
import type { z } from 'zod';
import { voiceTracksStateSchema } from '../schemas/voiceTracks';

export const voiceTracksGoldens: Record<string, z.ZodType> = {
  'voice-tracks-empty.json': voiceTracksStateSchema,
  'voice-tracks-set.json': voiceTracksStateSchema,
};
