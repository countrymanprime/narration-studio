import { z } from 'zod';
import {
  PICKUP_MARKER_STATES,
  type PickupMarker,
  type PickupsImportReport,
  type PickupsImportResult,
  type PickupsMoment,
  type PickupsPunchResult,
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

/** `PickupsPunch` (`apps/desktop/pickupspunch.go`). */
export const pickupsPunchResultSchema = z
  .object({
    outcome: z.enum(['punched', 'refused']),
    cursor: z.number().optional(),
    message: z.string().optional(),
  })
  .refine((result) => (result.outcome === 'punched') === (result.cursor !== undefined), {
    message: 'a punch cursor comes with outcome "punched", and only with it',
    path: ['cursor'],
  }) satisfies z.ZodType<PickupsPunchResult>;
