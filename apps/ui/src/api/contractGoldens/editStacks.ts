// The golden payloads of the stack record and the retry choice (apps/desktop/bindings_editlog_stacks.go).
import type { z } from 'zod';
import { retryModeAnswerSchema, stackChangeSchema, stackListSchema } from '../schemas/editStacks';

export const editStacksGoldens: Record<string, z.ZodType> = {
  'edit-stacks-list.json': stackListSchema,
  'edit-stacks-record.json': stackChangeSchema,
  'edit-stacks-remove.json': stackChangeSchema,
  'edit-stacks-retry-mode.json': retryModeAnswerSchema,
};
