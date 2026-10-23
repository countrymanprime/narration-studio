import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { parseWire } from '../wire/parseWire';
import { measuredSchema, type Measured, type Refusal, refusalSchema } from './base';

const ctx = { boundary: 'base.test', payload: 'shared schema' };

describe('refusalSchema', () => {
  it('refusal-schema-roundtrips: accepts { code, reason }, rejects an empty reason and an extra field, and infers Refusal', () => {
    const refusal = { code: 'daw-not-last', reason: 'Undo it in REAPER with Edit > Undo.' };
    expect(parseWire(refusalSchema, refusal, ctx)).toEqual(refusal);
    expect(() => parseWire(refusalSchema, { code: 'daw-not-last', reason: '' }, ctx)).toThrow();
    expect(() => parseWire(refusalSchema, { ...refusal, extra: true }, ctx)).toThrow();
    expect(() => parseWire(refusalSchema, { reason: 'No code' }, ctx)).toThrow();
    expectTypeOf<z.output<typeof refusalSchema>>().toEqualTypeOf<Refusal>();
    expectTypeOf<Refusal>().toEqualTypeOf<{ code: string; reason: string }>();
  });
});

describe('measuredSchema', () => {
  const measuredNumber = measuredSchema(z.number());

  it("measured-value-or-reason: accepts a value or a reason, and rejects 'ok' with neither", () => {
    expect(parseWire(measuredNumber, { ok: true, value: 3 }, ctx)).toEqual({ ok: true, value: 3 });
    expect(parseWire(measuredNumber, { ok: false, reason: 'No room tone recorded yet' }, ctx)).toEqual({
      ok: false,
      reason: 'No room tone recorded yet',
    });
    expect(() => parseWire(measuredNumber, { ok: true }, ctx)).toThrow();
    expect(() => parseWire(measuredNumber, { ok: false }, ctx)).toThrow();
    expect(() => parseWire(measuredNumber, { ok: false, reason: '' }, ctx)).toThrow();
    expect(() => parseWire(measuredNumber, { ok: true, value: 'three' }, ctx)).toThrow();
    expectTypeOf<z.output<typeof measuredNumber>>().toEqualTypeOf<Measured<number>>();
    expectTypeOf<Measured<number>>().toEqualTypeOf<{ ok: true; value: number } | { ok: false; reason: string }>();
  });

  it('measured-from-null-host: a Go null value is rejected unless the value schema allows it', () => {
    expect(() => parseWire(measuredNumber, { ok: true, value: null }, ctx)).toThrow();
    expect(parseWire(measuredSchema(z.number().nullable()), { ok: true, value: null }, ctx)).toEqual({ ok: true, value: null });
  });
});
