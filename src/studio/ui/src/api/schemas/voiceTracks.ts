import { z } from 'zod';
import type { BoothPunch, BoothVoice, BoothVoiceAdded, BoothVoiceTrack, VoiceTrackAssignment, VoiceTracksState } from '../contracts/voiceTracks';

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

const boothVoiceTrackSchema = z.object({ guid: z.string().min(1), name: z.string() }).strict() satisfies z.ZodType<BoothVoiceTrack>;

const BOOTH_VOICE_REASONS = [
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
] as const;

/** `BoothVoiceSet` and `BoothVoiceGet` (src/studio/desktop/bindings_booth_voice.go). */
export const boothVoiceSchema = z
  .object({
    outcome: z.enum(['selected', 'switched', 'refused']),
    reason: z.enum(BOOTH_VOICE_REASONS).optional(),
    message: z.string().optional(),
    trackGuid: z.string().optional(),
    at: z.number().nonnegative().optional(),
    added: z.array(boothVoiceTrackSchema).optional(),
  })
  .strict() satisfies z.ZodType<BoothVoice>;

/** `BoothVoiceAdd` (src/studio/desktop/boothvoiceadd.go). */
export const boothVoiceAddedSchema = z
  .object({
    outcome: z.enum(['added', 'refused']),
    reason: z.enum([...BOOTH_VOICE_REASONS, 'no_name', 'name_taken', 'invalid', 'recording']).optional(),
    message: z.string().optional(),
    trackGuid: z.string().min(1).optional(),
    name: z.string().optional(),
  })
  .strict() satisfies z.ZodType<BoothVoiceAdded>;

/** `BoothPunchTarget` (src/studio/desktop/bindings_booth_punch.go). */
export const boothPunchSchema = z
  .object({
    outcome: z.enum(['found', 'never_recorded', 'refused']),
    reason: z.string().optional(),
    message: z.string().optional(),
    trackGuid: z.string().min(1).optional(),
    trackName: z.string().optional(),
    start: z.number().nonnegative().optional(),
    end: z.number().nonnegative().optional(),
  })
  .strict() satisfies z.ZodType<BoothPunch>;
