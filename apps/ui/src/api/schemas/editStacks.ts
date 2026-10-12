import { z } from 'zod';
import type { PassageStack, RetryModeAnswer, EditStackChange, EditStackList } from '../contracts/editStacks';
import { STACK_MAX_ID, STACK_MAX_STEPS, STACK_MAX_TAKES, STACK_MAX_UNDO_STEPS } from '../contracts/editStacks';

/** An id the host offered, never a path or markup: no space, control character, slash, backslash or angle bracket
 * (apps/desktop/internal/editlog/stacks.go plainID). */
export const stackIdSchema = z
  .string()
  .min(1)
  .refine((id) => [...id].length <= STACK_MAX_ID && !/[\s\p{Cc}/\\<>\uFEFF]/u.test(id), { message: 'an id the host offered, never a path' });

const SEVEN_DAYS = 7 * 24 * 3600;
const retryModeSchema = z.enum(['stack', 'leave']);

export const passageStackSchema = z
  .object({
    id: z.string().min(1),
    chapterId: stackIdSchema,
    passageId: stackIdSchema,
    base: stackIdSchema,
    offsets: z.record(stackIdSchema, z.number().nonnegative().max(SEVEN_DAYS)),
    mode: z.enum(['native', 'app', 'steps']),
    undoSteps: z.number().int().min(0).max(STACK_MAX_UNDO_STEPS),
    steps: z.array(z.string().min(1).max(1000)).min(1).max(STACK_MAX_STEPS).optional(),
    backupId: stackIdSchema.optional(),
    at: z.string(),
  })
  .strict()
  .refine(
    (stack) => {
      const takes = Object.keys(stack.offsets);
      return stack.id === `stk-${stack.passageId}` && takes.length > 0 && takes.length <= STACK_MAX_TAKES && !takes.includes(stack.base);
    },
    { message: 'a stack holds at least one take other than its first read' },
  )
  .refine((stack) => (stack.mode === 'steps' ? stack.steps !== undefined && stack.backupId !== undefined : stack.steps === undefined), {
    message: 'only a stack made in steps lists its steps, and it names its backup',
  }) satisfies z.ZodType<PassageStack>;

export const stackListSchema = z
  .object({
    chapterId: z.string(),
    stacks: z.array(passageStackSchema),
  })
  .strict() satisfies z.ZodType<EditStackList>;

export const stackChangeSchema = stackListSchema.extend({ changed: z.array(stackIdSchema) }).strict() satisfies z.ZodType<EditStackChange>;

export const retryModeAnswerSchema = z
  .object({
    level: z.enum(['project', 'chapter', 'passage']),
    chapterId: stackIdSchema.optional(),
    passageId: stackIdSchema.optional(),
    mode: retryModeSchema,
    from: z.enum(['project', 'chapter', 'passage', 'default']),
    set: retryModeSchema.optional(),
  })
  .strict()
  .refine((answer) => (answer.level === 'project') === (answer.chapterId === undefined) && (answer.level === 'passage') === (answer.passageId !== undefined), {
    message: 'a level names its chapter and passage, and no more',
  }) satisfies z.ZodType<RetryModeAnswer>;
