import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, SUGGEST_MARGIN_FULL, TARGET_RMS_DB, UNTRIMMED_PENALTY } from './estimates';
import { NOT_MEASURED, PREP_STEPS, confidenceLabel, suggestTake, takeEvidence, type TakeInput, type TakeMeasure } from './takes';

const m = (over: Partial<TakeMeasure> = {}): TakeMeasure => ({ pause: 0.5, rms: -21, nf: -62, clarity: 0.8, breaths: 0, ...over });
const take = (id: string, matched: number, measure: Partial<TakeMeasure> = {}, hidden = false): TakeInput => ({
  id,
  matched,
  hidden,
  measured: { ok: true, value: m(measure) },
});
const unmeasured = (id: string, matched: number, reason = 'Nothing has been measured yet.'): TakeInput => ({
  id,
  matched,
  measured: { ok: false, reason },
});

describe('the take suggestion', () => {
  it('different-levels-are-not-comparable', () => {
    const s = suggestTake([take('a', 90, { rms: -24.5 }), take('b', 90, { rms: -20 })], []);
    expect(s.confidence).toBeNull();
    expect(s.spread).toBeCloseTo(4.5);
    expect(s.reason).toContain('4.5 dB');
    expect(s.reason).toMatch(/normalise them first/i);
    expect(s.steps.find((x) => x.id === 'normalise')).toMatchObject({ needed: true, done: false });
    expect(s.steps.map((x) => x.id)[0]).toBe('trim-silence');
    expect(s.take).not.toBeNull();
  });

  it('confidence follows the margin over the runner-up, the trims left and rounds to two places', () => {
    const noTrims = [take('a', 100), take('b', 95)];
    const s = suggestTake(noTrims, []);
    const margin = s.evidence[0].score! - s.evidence[1].score!;
    expect(s.take).toBe('a');
    expect(s.confidence).toBe(Math.round(Math.min(1, margin / SUGGEST_MARGIN_FULL) * 100) / 100);
    const withTrim = suggestTake([take('a', 100, { pause: 2 }), take('b', 60, { pause: 2 })], []);
    expect(withTrim.confidence).toBe(Math.round(1 * (1 - UNTRIMMED_PENALTY) * 100) / 100);
  });

  it('confidence-rises-as-trims-are-applied-and-never-jumps', () => {
    const arb = fc.record({
      matchedA: fc.integer({ min: 0, max: 100 }),
      matchedB: fc.integer({ min: 0, max: 100 }),
      pause: fc.double({ min: 0, max: 4, noNaN: true }),
      breaths: fc.integer({ min: 0, max: 4 }),
    });
    fc.assert(
      fc.property(arb, ({ matchedA, matchedB, pause, breaths }) => {
        const takes = [take('a', matchedA, { pause, breaths }), take('b', matchedB, { pause, breaths })];
        const c0 = suggestTake(takes, []).confidence;
        const c1 = suggestTake(takes, ['trim-silence']).confidence;
        const c2 = suggestTake(takes, ['trim-silence', 'trim-breaths']).confidence;
        expect(c0).not.toBeNull();
        expect(c1!).toBeGreaterThanOrEqual(c0!);
        expect(c2!).toBeGreaterThanOrEqual(c1!);
      }),
      { seed: 20261011, numRuns: 200 },
    );
  });

  it('one-take-or-nothing-measured', () => {
    const one = suggestTake([take('a', 90)], []);
    expect(one).toMatchObject({ take: null, confidence: null });
    expect(one.reason).toMatch(/only one take/i);
    const none = suggestTake([unmeasured('a', 80, 'The host has no measure.'), unmeasured('b', 95, 'The host has no measure.')], []);
    expect(none.take).toBe('b');
    expect(none.confidence).toBeNull();
    expect(none.reason).toContain('The host has no measure.');
    expect(none.reason).toMatch(/words read/);
  });

  it('a-figure-that-cannot-be-measured-is-left-out', () => {
    const noClarity = (id: string, matched: number, nf = -62): TakeInput => ({
      id,
      matched,
      measured: { ok: true, value: { ...m({ nf }), clarity: null } },
    });
    const ev = takeEvidence([noClarity('a', 100, -70), noClarity('b', 100, -40)], []);
    expect(ev[0].score).toBeCloseTo(1); // matched 0.5 + noise 0.2, renormalised over 0.7
    expect(ev[1].score).toBeCloseTo(0.5 / 0.7);
    expect(ev[0].clarityLabel).toBe(NOT_MEASURED);
    expect(NOT_MEASURED).toBe('Not measured');
    const s = suggestTake([noClarity('a', 100, -70), noClarity('b', 100, -40)], []);
    expect(s.confidence).toBe(1);
  });

  it('hidden-takes-are-ignored', () => {
    const s = suggestTake([take('a', 90), take('b', 85), take('c', 100, { rms: -10 }, true)], []);
    expect(s.evidence.map((e) => e.id)).toEqual(['a', 'b']);
    expect(s.spread).toBe(0);
    expect(s.take).toBe('a');
    expect(suggestTake([take('a', 90), take('c', 100, {}, true)], []).take).toBeNull();
  });

  it('prep-status', () => {
    const takes = [take('a', 90, { pause: 2, breaths: 1 }), take('b', 90, { pause: 0.5, breaths: 0 })];
    const need = (applied: string[]) => Object.fromEntries(suggestTake(takes, applied).steps.map((x) => [x.id, [x.done, x.needed]]));
    expect(need([])).toEqual({ 'trim-silence': [false, true], 'trim-breaths': [false, true], normalise: [false, false] });
    expect(need(['trim-silence'])['trim-silence']).toEqual([true, false]);
    const apart = [take('a', 90, { rms: -25 }), take('b', 90)];
    const st = suggestTake(apart, ['normalise']).steps.find((x) => x.id === 'normalise')!;
    expect(st).toMatchObject({ done: true, needed: false });
    expect(suggestTake(apart, []).steps.find((x) => x.id === 'normalise')!.needed).toBe(true);
  });

  it('names the steps in the order a narrator does them, and the level normalising aims at', () => {
    expect(PREP_STEPS.map((x) => x.id)).toEqual(['trim-silence', 'trim-breaths', 'normalise']);
    expect(TARGET_RMS_DB).toBe(-20.5);
  });

  it('confidence-label', () => {
    expect(confidenceLabel(null)).toBe('Not comparable yet');
    expect(confidenceLabel(CONFIDENCE_HIGH)).toBe('High');
    expect(confidenceLabel(CONFIDENCE_HIGH - 0.01)).toBe('Medium');
    expect(confidenceLabel(CONFIDENCE_MEDIUM)).toBe('Medium');
    expect(confidenceLabel(CONFIDENCE_MEDIUM - 0.01)).toBe('Low');
  });

  it('pure-and-deterministic', () => {
    const takes = [take('a', 91, { pause: 2 }), take('b', 83), unmeasured('c', 70)];
    expect(suggestTake(takes, ['x'])).toEqual(suggestTake(takes, ['x']));
    const src = readFileSync(join(__dirname, 'takes.ts'), 'utf8') + readFileSync(join(__dirname, 'estimates.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"](react|\.\.\/(\.\.\/)*(api|ports))/);
  });
});
