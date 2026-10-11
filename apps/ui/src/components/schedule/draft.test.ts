// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ProductionMilestone } from '../../api/contracts/production';
import { blankDraft, draftOf, MISSING_NAME_OR_DATE, milestoneFromDraft } from './draft';

const BOUNDS = { chapters: 12, minutes: 600 };
const existing: ProductionMilestone = { name: 'All chapters recorded', dueDate: '2026-10-05', measure: 'rec', estimate: '2026-10-04', template: 'acx' };

describe('a milestone draft', () => {
  it('shows an existing milestone with its N filled in', () => {
    expect(draftOf({ name: 'A', dueDate: '2026-10-05', measure: 'ch4', note: 'n', done: true })).toEqual({
      name: 'A',
      date: '2026-10-05',
      measure: 'chN',
      chapters: 4,
      minutes: 15,
      note: 'n',
      done: true,
    });
    expect(draftOf({ name: 'A', dueDate: '2026-10-05' }).measure).toBe('custom');
    expect(draftOf({ name: 'A', dueDate: '2026-10-05', measure: 'min20' })).toMatchObject({ measure: 'minN', minutes: 20 });
  });

  it('refuses an empty name or no real date, and says so', () => {
    expect(milestoneFromDraft({ ...blankDraft(), name: '  ', date: '2026-10-05' }, undefined, BOUNDS)).toEqual({ refusal: MISSING_NAME_OR_DATE });
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '' }, undefined, BOUNDS)).toEqual({ refusal: MISSING_NAME_OR_DATE });
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '2026-02-30' }, undefined, BOUNDS)).toEqual({ refusal: MISSING_NAME_OR_DATE });
  });

  it('stores every detail: name, date, measure with its N, note and done', () => {
    const draft = { name: ' Everything ', date: '2026-10-09', measure: 'chN', chapters: 4, minutes: 15, note: ' Proofer wants it ', done: true };
    expect(milestoneFromDraft(draft, existing, BOUNDS)).toEqual({
      milestone: { name: 'Everything', dueDate: '2026-10-09', measure: 'ch4', note: 'Proofer wants it', done: true, template: 'acx' },
    });
  });

  it('clamps the N to the book', () => {
    const at = (patch: object) => milestoneFromDraft({ ...blankDraft(), name: 'A', date: '2026-10-05', ...patch }, undefined, BOUNDS);
    expect(at({ measure: 'chN', chapters: 99 })).toMatchObject({ milestone: { measure: 'ch12' } });
    expect(at({ measure: 'chN', chapters: 0 })).toMatchObject({ milestone: { measure: 'ch6' } });
    expect(at({ measure: 'minN', minutes: 9999 })).toMatchObject({ milestone: { measure: 'min600' } });
    expect(at({ measure: 'minN', minutes: 20 })).toMatchObject({ milestone: { measure: 'min20' } });
  });

  it('leaves a custom milestone with no measure and no estimate', () => {
    const result = milestoneFromDraft({ ...draftOf(existing), measure: 'custom' }, existing, BOUNDS);
    expect(result).toEqual({ milestone: { name: 'All chapters recorded', dueDate: '2026-10-05', template: 'acx' } });
  });

  it('keeps a stored estimate only while the measure is the same', () => {
    expect(milestoneFromDraft(draftOf(existing), existing, BOUNDS)).toMatchObject({ milestone: { estimate: '2026-10-04' } });
    expect(milestoneFromDraft({ ...draftOf(existing), measure: 'all' }, existing, BOUNDS)).not.toHaveProperty('milestone.estimate');
  });
});
