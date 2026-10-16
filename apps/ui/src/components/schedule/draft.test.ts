// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ProductionMilestone } from '../../api/contracts/production';
import { blankDraft, draftOf, MISSING_DATE, MISSING_NAME, milestoneFromDraft } from './draft';

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

  it('takes a date typed with spaces around it as written without them', () => {
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: ' 2026-10-25 ' }, undefined, BOUNDS)).toMatchObject({ milestone: { dueDate: '2026-10-25' } });
  });

  it('refuses a name or note over the host limit in a sentence of its own', () => {
    const long = { ...blankDraft(), name: 'A', date: '2026-10-05' };
    expect(milestoneFromDraft({ ...long, name: 'x'.repeat(201) }, undefined, BOUNDS)).toEqual({ refusal: 'The name is 201 characters; the most is 200.' });
    expect(milestoneFromDraft({ ...long, note: '😀'.repeat(2001) }, undefined, BOUNDS)).toEqual({ refusal: 'The note is 2001 characters; the most is 2000.' });
    expect(milestoneFromDraft({ ...long, name: '😀'.repeat(200), note: 'y'.repeat(2000) }, undefined, BOUNDS)).toHaveProperty('milestone');
  });

  it('refuses an empty name or no real date, and says so', () => {
    expect(milestoneFromDraft({ ...blankDraft(), name: '  ', date: '2026-10-05' }, undefined, BOUNDS)).toEqual({ refusal: MISSING_NAME });
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '' }, undefined, BOUNDS)).toEqual({ refusal: MISSING_DATE });
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '2026-02-30' }, undefined, BOUNDS)).toEqual({
      refusal: '2026-02-30 is not a real date. Write it YYYY-MM-DD.',
    });
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
