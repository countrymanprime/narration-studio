import { z } from 'zod';
import type { Track, TrackItem, TracksChanged, TracksDiscovery, TracksLive, TracksProject } from '../contracts/tracks';
import { listFromNull } from './base';

const trackItemSchema = z.object({
  guid: z.string(),
  position: z.number(),
  length: z.number(),
  name: z.string(),
  sourceKind: z.string(),
  sourceFile: z.string(),
  sourceAvailable: z.boolean(),
  supported: z.boolean(),
  takeGuid: z.string(),
  sourceStart: z.number().nonnegative(),
  playRate: z.number().positive(),
}) satisfies z.ZodType<TrackItem>;

const trackSchema = z.object({
  guid: z.string(),
  index: z.number(),
  name: z.string(),
  color: z.string(),
  muted: z.boolean(),
  soloed: z.boolean(),
  items: listFromNull(trackItemSchema),
  depth: z.number().int().nonnegative(),
  isFolder: z.boolean(),
}) satisfies z.ZodType<Track>;

export const tracksProjectSchema = z.object({ path: z.string(), tracks: listFromNull(trackSchema) }) satisfies z.ZodType<TracksProject>;

/** The bridge script's 16 hex digits (narration_tracks_read.lua), or '' for none known. */
const tracksRevisionSchema = z.string().regex(/^([0-9a-f]{16})?$/);

export const tracksLiveSchema = z.object({
  source: z.enum(['live', 'saved']),
  reason: z.enum(['', 'standalone', 'not_running', 'unsupported', 'other_project', 'outdated', 'too_many', 'failed']),
  message: z.string(),
  readAt: z.string(),
  project: tracksProjectSchema,
  revision: tracksRevisionSchema,
}) satisfies z.ZodType<TracksLive>;

/** daw_tracks_changed. */
export const tracksChangedSchema = z.strictObject({ revision: tracksRevisionSchema }) satisfies z.ZodType<TracksChanged>;

/** No REAPER project file found is a null list on the wire; `selected` is empty while the choice is still to be made. */
export const tracksDiscoverySchema = z.object({ candidates: listFromNull(z.string()), selected: z.string() }) satisfies z.ZodType<TracksDiscovery>;
