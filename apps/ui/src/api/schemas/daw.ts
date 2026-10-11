import { z } from 'zod';
import { DAW_REFUSAL_CODES, DAW_RESULT_MAX_UNDO_STEPS } from '../contracts/daw';
import type {
  DawCapabilities,
  DawCapabilityLevel,
  DawCapabilityMode,
  DawCapabilityReason,
  DawCapabilitySupport,
  DawKind,
  DawPlayState,
  DawProjectState,
  DawResult,
  DawTransport,
} from '../contracts/daw';
import { optionalFromNull } from './base';

const DAW_KINDS = ['REAPER', 'Audacity', 'Built-in', 'none'] as const satisfies readonly DawKind[];
const DAW_CAPABILITY_LEVELS = ['unsupported', 'not_yet_available', 'experimental', 'supported'] as const satisfies readonly DawCapabilityLevel[];
const DAW_CAPABILITY_REASONS = [
  'standalone',
  'not_running',
  'experimental_off',
  'failed',
  'turned_off',
  'not_yet',
  'unsupported',
] as const satisfies readonly DawCapabilityReason[];
const DAW_CAPABILITY_MODES = ['native', 'app', 'steps'] as const satisfies readonly DawCapabilityMode[];

export const dawCapabilitySupportSchema = z.object({
  level: z.enum(DAW_CAPABILITY_LEVELS),
  available: z.boolean(),
  reason: optionalFromNull(z.enum(DAW_CAPABILITY_REASONS)),
  message: optionalFromNull(z.string()),
  destructive: optionalFromNull(z.boolean()),
  mode: optionalFromNull(z.enum(DAW_CAPABILITY_MODES)),
}) satisfies z.ZodType<DawCapabilitySupport>;

export const dawCapabilitiesSchema = z.object({
  daw: z.enum(DAW_KINDS),
  reachable: z.boolean(),
  capabilities: z.record(z.string(), dawCapabilitySupportSchema),
}) satisfies z.ZodType<DawCapabilities>;

/** daw_transport_changed: position is absent while stopped. */
export const dawTransportSchema = z.object({
  playing: z.boolean(),
  recording: z.boolean(),
  position: optionalFromNull(z.number()),
}) satisfies z.ZodType<DawTransport>;

const DAW_PLAY_STATES = ['stopped', 'playing', 'recording'] as const satisfies readonly DawPlayState[];

/** DawProjectState and daw_project_state_changed: every key always present, savedAt a local date-time to the minute or null. */
export const dawProjectStateSchema = z.strictObject({
  savedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable(),
  unsavedChanges: z.boolean(),
  playState: z.enum(DAW_PLAY_STATES),
  playPosition: z.number().nonnegative(),
}) satisfies z.ZodType<DawProjectState>;

/** dawport.Result: refused, code and steps are absent unless set; code is one of DAW_REFUSAL_CODES (ADR 0861). */
export const dawResultSchema = z.object({
  ok: z.boolean(),
  changed: z.boolean(),
  message: z.string(),
  undoSteps: z.number().int().min(0).max(DAW_RESULT_MAX_UNDO_STEPS),
  refused: optionalFromNull(z.string()),
  code: optionalFromNull(z.enum(DAW_REFUSAL_CODES)),
  steps: optionalFromNull(z.array(z.string())),
}) satisfies z.ZodType<DawResult>;
