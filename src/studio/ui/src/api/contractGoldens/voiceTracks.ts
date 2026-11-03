// The golden payloads of a project's voice setup (src/studio/desktop/bindings_voicetracks.go) and the Booth's voice choice.
import { z } from 'zod';
import { readAloudRecordingSchema } from '../schemas/teleprompter';
import { boothVoiceSchema, voiceTracksStateSchema } from '../schemas/voiceTracks';

export const voiceTracksGoldens: Record<string, z.ZodType> = {
  'voice-tracks-empty.json': voiceTracksStateSchema,
  'voice-tracks-set.json': voiceTracksStateSchema,
  // src/studio/desktop/bindings_booth_voice.go: each BoothVoiceSet answer, and a record start in a folder with no voices.
  'booth-voice.json': z.record(z.string(), z.union([boothVoiceSchema, readAloudRecordingSchema])),
};
