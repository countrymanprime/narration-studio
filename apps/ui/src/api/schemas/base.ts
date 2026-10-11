import { z } from 'zod';

// Helpers shared by the per-domain schema files (ADR 0069). Schemas describe what the host really sends, and the host
// (Go) sends `null` for an unset value where the TypeScript contracts say `?:`. That mismatch is closed here, in one
// place, and not by hand in each consumer.

/** A field the contract declares `?: T` but the host may send as `null`: both become `undefined`. */
export const optionalFromNull = <T extends z.ZodType>(schema: T) => schema.nullish().transform((value) => value ?? undefined);

/** A list the host may send as `null` (a nil Go slice, or an older sidecar record): both become an empty list. */
export const listFromNull = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((value): Array<z.output<T>> => value ?? []);

/** The result of a binding that returns nothing: the host marshals `nil` to `null`. */
export const voidResult = z.null().transform((): void => undefined);

// Refusal and Measured are UI-only shapes for now (no binding returns them yet), so they have no golden: a binding that
// starts returning one adds its own golden in its own change. Both are strict, unlike a host payload, because nothing newer
// than this UI writes them yet.

/** Why an action was not done, in a form a screen can show: a stable `code` to branch on and a `reason` to print. */
export const refusalSchema = z.strictObject({ code: z.string().min(1), reason: z.string().min(1) });

export type Refusal = z.output<typeof refusalSchema>;

/** A figure that comes from a measurement: the value, or the reason there is none (a screen prints "not measured yet"). */
export type Measured<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * The schema of a `Measured<T>`. A `null` value is checked by `value` like any other, so a Go `nil` passes only where the
 * value schema allows it; `optionalFromNull` is not applied here.
 */
export const measuredSchema = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion('ok', [z.strictObject({ ok: z.literal(true), value }), z.strictObject({ ok: z.literal(false), reason: z.string().min(1) })]);
