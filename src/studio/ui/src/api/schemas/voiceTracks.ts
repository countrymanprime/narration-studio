import { z } from 'zod';
import type { BoothVoice, VoiceTrackAssignment, VoiceTracksState } from '../contracts/voiceTracks';

// The host's limits (src/studio/desktop/internal/voicetracks): a track name and an id are at most 120 characters.
const name = z.string().min(1).max(120);

const voiceTrackAssignmentSchema = z
  .object({
    track: name,
    characters: z.array(name).min(1).max(200),
  })
  .strict() satisfies z.ZodType<VoiceTrackAssignment>;

export const voiceTracksStateSchema = z
  .object({
    layout: z.enum(['flat', 'folders']),
    narratorCharacter: z.string().max(120),
    tracks: z.array(voiceTrackAssignmentSchema).max(500),
  })
  .strict() satisfies z.ZodType<VoiceTracksState>;

/** `BoothVoiceSet` (src/studio/desktop/bindings_booth_voice.go). */
export const boothVoiceSchema = z
  .object({
    outcome: z.enum(['selected', 'switched', 'refused']),
    reason: z
      .enum([
        'flat',
        'not_a_voice',
        'no_voices',
        'unlinked',
        'several_links',
        'track_missing',
        'standalone',
        'not_running',
        'failed',
        'unsupported',
        'timeout',
        'not_our_recording',
        'already_recording',
        'playing',
      ])
      .optional(),
    message: z.string().optional(),
    trackGuid: z.string().optional(),
    at: z.number().nonnegative().optional(),
  })
  .strict() satisfies z.ZodType<BoothVoice>;
