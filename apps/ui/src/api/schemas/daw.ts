import { z } from 'zod';
import { DAW_BACKUPS_MAX, DAW_REFUSAL_CODES, DAW_RESULT_MAX_UNDO_STEPS } from '../contracts/daw';
import type {
  DawBackup,
  DawBackupsFile,
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

/** A backup table row's text (the source track's name, the chapter id, the label): non-empty, at most 256 bytes as the host counts them, no
 * control characters (audacity.backupText). */
const backupText = z
  .string()
  .min(1)
  .refine((text) => new TextEncoder().encode(text).length <= 256, 'longer than 256 bytes')
  // eslint-disable-next-line no-control-regex
  .refine((text) => !/[\u0000-\u001f\u007f-\u009f]/.test(text), 'holds a control character');

/** One row of backups.json, as the host validates it on read (audacity.validBackup): a GUID-shaped id, a finite window that starts
 * at or after 0 and before its end, an optional label and restored time, and no other key. */
const dawBackupSchema = z
  .strictObject({
    id: z.string().regex(/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/),
    guid: backupText,
    chapterId: backupText,
    start: z.number().nonnegative(),
    end: z.number(),
    createdAt: z.iso.datetime({ offset: true }),
    label: backupText.optional(),
    restored: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((row) => row.start < row.end, { message: 'the window ends before it starts', path: ['end'] }) satisfies z.ZodType<DawBackup>;

/** narration-utils/backups.json (ADR 0863): at most DAW_BACKUPS_MAX rows with distinct ids. */
export const dawBackupsFileSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    backups: z.array(dawBackupSchema).max(DAW_BACKUPS_MAX),
  })
  .refine((file) => new Set(file.backups.map((row) => row.id)).size === file.backups.length, {
    message: 'two rows share an id',
    path: ['backups'],
  }) satisfies z.ZodType<DawBackupsFile>;
