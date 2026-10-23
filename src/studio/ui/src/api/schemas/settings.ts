import { z } from 'zod';
import type { DefinitionSource, NumberSettingRange, ScopedSettingField } from '../contracts/system';
import { listFromNull } from './base';

const numberRangeSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  step: z.number().positive().nullable(),
  unit: z.string(),
}) satisfies z.ZodType<NumberSettingRange>;

const settingFieldSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    kind: z.enum(['text', 'choice', 'color', 'bool', 'number', 'tags']),
    // A text or colour field has no choices, which the host sends as null.
    choices: listFromNull(z.string()),
    value: z.string(),
    isSet: z.boolean(),
    effectiveValue: z.string(),
    effectiveSource: z.string(),
    number: numberRangeSchema.optional(),
  })
  // A number field the page cannot bound would accept anything; a range on another kind means the host and page disagree.
  .refine((field) => (field.kind === 'number') === (field.number !== undefined), {
    message: 'a number field carries its range, and no other kind does',
    path: ['number'],
  }) satisfies z.ZodType<ScopedSettingField>;

/** The Settings page's fields of one scope, grouped by tool. Every value is a string; a `bool` is "true" or "false". */
export const settingsForScopeSchema = z.record(z.string(), listFromNull(settingFieldSchema));

/** Script.definition_source's three values (`DefinitionSource`). */
export const definitionSourceSchema = z.enum(['web', 'local', 'api']) satisfies z.ZodType<DefinitionSource>;

/**
 * The definition source a settings answer holds: Script.definition_source's effective value, or `web` when the field is absent (an older
 * host) or holds a value this build does not know, as the host itself reads one.
 */
export function definitionSourceOf(settings: Record<string, ScopedSettingField[]>): DefinitionSource {
  const field = settings.Script?.find((item) => item.key === 'definition_source');
  const parsed = definitionSourceSchema.safeParse(field?.effectiveValue);
  return parsed.success ? parsed.data : 'web';
}
