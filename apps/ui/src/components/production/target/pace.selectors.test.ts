// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MIN_OWN_RATE_CHAPTERS, WPH } from '../../schedule/estimates';
import { basisOf, ownRate, targetHours, wphOf, type PaceChapter } from './pace.selectors';

const CHAPTERS: PaceChapter[] = [
  { id: '1', tag: 'Ch 1', words: 2000 },
  { id: '2', tag: 'Ch 2', words: 2500 },
  { id: '3', tag: 'Ch 3', words: 4000 },
  { id: '4', tag: 'Ch 4', words: 2351 },
  { id: '5', tag: 'Ch 5', words: 0 },
];
const LENGTHS = { '1': 685, '2': 670, '4': 868, '5': 30 };
const measured = (lengths: Record<string, number>) => ({ ok: true as const, value: lengths });

describe('own-rate-needs-three-measured-chapters', () => {
  it('names the count when fewer than the minimum have a measured length', () => {
    expect(MIN_OWN_RATE_CHAPTERS).toBe(3);
    const r = ownRate(CHAPTERS, measured({ '1': 685, '2': 670 }), MIN_OWN_RATE_CHAPTERS);
    expect(r).toEqual({ ok: false, reason: 'Needs 3 chapters with a measured length; 2 so far.' });
  });

  it('is words per finished hour over the chapters with words and a length, in book order', () => {
    const r = ownRate(CHAPTERS, measured(LENGTHS), MIN_OWN_RATE_CHAPTERS);
    expect(r).toEqual({ ok: true, value: { wph: 11095, words: 6851, seconds: 2223, chapters: [CHAPTERS[0], CHAPTERS[1], CHAPTERS[3]] } });
  });

  it('passes the reason of an unmeasured source through', () => {
    expect(ownRate(CHAPTERS, { ok: false, reason: 'No chapter has a measured length yet.' }, MIN_OWN_RATE_CHAPTERS)).toEqual({
      ok: false,
      reason: 'No chapter has a measured length yet.',
    });
  });
});

describe('basis-is-own-only-when-chosen-and-measured', () => {
  const own = ownRate(CHAPTERS, measured(LENGTHS), MIN_OWN_RATE_CHAPTERS);
  const none = ownRate(CHAPTERS, { ok: false, reason: 'x' }, MIN_OWN_RATE_CHAPTERS);
  it('falls back to the standard while nothing is measured', () => {
    expect(basisOf('own', none)).toBe('standard');
    expect(wphOf('own', none, WPH)).toBe(WPH);
  });
  it('is own once measured and chosen, standard otherwise', () => {
    expect(basisOf('own', own)).toBe('own');
    expect(wphOf('own', own, WPH)).toBe(11095);
    expect(basisOf('standard', own)).toBe('standard');
    expect(basisOf(undefined, own)).toBe('standard');
    expect(wphOf(undefined, own, WPH)).toBe(WPH);
  });
});

describe('target-hours-both-ways', () => {
  it('is words over the standard, and words over the own rate or null', () => {
    const t = targetHours(CHAPTERS, ownRate(CHAPTERS, measured(LENGTHS), MIN_OWN_RATE_CHAPTERS), WPH);
    expect(t.standard).toBeCloseTo(10851 / WPH, 5);
    expect(t.own).toBeCloseTo(10851 / 11095, 5);
    expect(targetHours(CHAPTERS, ownRate(CHAPTERS, { ok: false, reason: 'x' }, MIN_OWN_RATE_CHAPTERS), WPH).own).toBeNull();
  });
});
