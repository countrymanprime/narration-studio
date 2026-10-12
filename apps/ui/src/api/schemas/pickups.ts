import { z } from 'zod';
import {
  PICKUP_GAP_KINDS,
  PICKUP_MARKER_STATES,
  PICKUP_SOURCES,
  type PickupItem,
  type PickupLeftOutChapter,
  type PickupList,
  type PickupMarker,
  type PickupsImportReport,
  type PickupsImportResult,
  type PickupsMoment,
  type PickupsStartResult,
  type PickupsState,
} from '../contracts/pickups';
import { optionalFromNull } from './base';

const pickupsMomentSchema = z.object({
  position: z.number(),
  tag: z.string(),
  note: z.string(),
}) satisfies z.ZodType<PickupsMoment>;

const pickupsImportReportSchema = z.object({
  added: z.number(),
  existing: z.number(),
  invalid: z.number(),
}) satisfies z.ZodType<PickupsImportReport>;

const pickupMarkerSchema = z.object({
  start: z.number(),
  state: z.enum(PICKUP_MARKER_STATES),
  tag: z.string(),
  note: z.string(),
}) satisfies z.ZodType<PickupMarker>;

export const pickupsStateSchema = z.object({
  runId: optionalFromNull(z.string()),
  phase: z.enum(['idle', 'importing', 'exporting', 'jumping', 'resolving', 'reopening', 'listing', 'counting', 'success', 'error']),
  message: z.string(),
  remaining: z.number(),
  total: z.number(),
  next: optionalFromNull(pickupsMomentSchema),
  resolved: optionalFromNull(pickupsMomentSchema),
  importReport: optionalFromNull(pickupsImportReportSchema),
  csv: z.string(),
  markers: z.array(pickupMarkerSchema),
}) satisfies z.ZodType<PickupsState>;

export const pickupsStartResultSchema = z.object({ status: z.literal('started') }) satisfies z.ZodType<PickupsStartResult>;

export const pickupsImportResultSchema = z.object({
  status: z.literal('started'),
  rowErrors: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
}) satisfies z.ZodType<PickupsImportResult>;

const pickupItemSchema = z
  .object({
    id: z.string().min(1),
    chapterId: z.string().min(1),
    paragraphId: z.string().nullable(),
    paragraph: z.number().int().nullable(),
    time: z.number().nullable(),
    at: z.number().nullable(),
    type: z.string(),
    gap: z.enum(PICKUP_GAP_KINDS).optional(),
    script: z.string(),
    context: z.string(),
    source: z.enum(PICKUP_SOURCES),
    confidence: z.number().min(0).max(1).nullable(),
    confReason: z.string(),
    findingId: z.string().optional(),
    included: z.boolean(),
    done: z.boolean(),
    waiting: z.boolean(),
  })
  .strict()
  .refine((item) => item.confidence !== null || item.confReason !== '', {
    message: 'a pickup without a confidence says why',
    path: ['confReason'],
  }) satisfies z.ZodType<PickupItem>;

const pickupLeftOutChapterSchema = z
  .object({ chapterId: z.string().min(1), state: z.string().min(1), reasons: z.array(z.string()) })
  .strict() satisfies z.ZodType<PickupLeftOutChapter>;

/** `PickupsList`, `PickupsAdd`, `PickupsRemove`, `PickupsSetIncluded` and `PickupsSetDone` (`apps/desktop/bindings_pickuplist.go`). */
export const pickupListSchema = z
  .object({ pickups: z.array(pickupItemSchema), leftOut: z.array(pickupLeftOutChapterSchema) })
  .strict() satisfies z.ZodType<PickupList>;
