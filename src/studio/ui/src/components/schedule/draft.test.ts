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
      chapters: '4',
      minutes: '15',
      note: 'n',
      done: true,
    });
    expect(draftOf({ name: 'A', dueDate: '2026-10-05' }).measure).toBe('custom');
    expect(draftOf({ name: 'A', dueDate: '2026-10-05', measure: 'min20' })).toMatchObject({ measure: 'minN', minutes: '20' });
  });

  it('takes a date typed with spaces around it as written without them', () => {
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: ' 2026-10-25 ' }, undefined, BOUNDS)).toMatchObject({ milestone: { dueDate: '2026-10-25' } });
  });

  it('refuses a date past the last year, so a typo is not a milestone in the year 9999', () => {
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '9999-12-31' }, undefined, BOUNDS)).toMatchObject({
      refusal: 'Write a date no later than Dec 31, 2100.',
    });
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '2101-01-01' }, undefined, BOUNDS)).toHaveProperty('refusal');
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '2100-12-31' }, undefined, BOUNDS)).toHaveProperty('milestone');
  });

  it('tells a year before 1000 its range instead of saying it is not a date', () => {
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '0001-01-01' }, undefined, BOUNDS)).toMatchObject({
      refusal: '0001-01-01 is too early. Write a date from the year 1000 to 2100.',
    });
  });

  it('refuses a name or note over the host limit in a sentence of its own', () => {
    const long = { ...blankDraft(), name: 'A', date: '2026-10-05' };
    expect(milestoneFromDraft({ ...long, name: 'x'.repeat(201) }, undefined, BOUNDS)).toMatchObject({
      refusal: 'The name is 201 characters; the most is 200.',
    });
    expect(milestoneFromDraft({ ...long, note: '😀'.repeat(2001) }, undefined, BOUNDS)).toMatchObject({
      refusal: 'The note is 2,001 characters; the most is 2,000.',
    });
    expect(milestoneFromDraft({ ...long, name: '😀'.repeat(200), note: 'y'.repeat(2000) }, undefined, BOUNDS)).toHaveProperty('milestone');
  });

  it('refuses an empty name or no real date, and says so', () => {
    expect(milestoneFromDraft({ ...blankDraft(), name: '  ', date: '2026-10-05' }, undefined, BOUNDS)).toMatchObject({ refusal: MISSING_NAME });
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '' }, undefined, BOUNDS)).toMatchObject({ refusal: MISSING_DATE });
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '2026-02-30' }, undefined, BOUNDS)).toMatchObject({
      refusal: '2026-02-30 is not a real date. Write it YYYY-MM-DD.',
    });
  });

  it('stores every detail: name, date, measure with its N, note and done', () => {
    const draft = { name: ' Everything ', date: '2026-10-09', measure: 'chN', chapters: '4', minutes: '15', note: ' Proofer wants it ', done: true };
    expect(milestoneFromDraft(draft, existing, BOUNDS)).toMatchObject({
      milestone: { name: 'Everything', dueDate: '2026-10-09', measure: 'ch4', note: 'Proofer wants it', done: true, template: 'acx' },
    });
  });

  it('saves the N as typed and refuses one the book cannot have, with the reason', () => {
    const at = (patch: object) => milestoneFromDraft({ ...blankDraft(), name: 'A', date: '2026-10-05', ...patch }, undefined, BOUNDS);
    expect(at({ measure: 'chN', chapters: ' 3 ' })).toMatchObject({ milestone: { measure: 'ch3' } });
    expect(at({ measure: 'chN', chapters: '99' })).toMatchObject({ refusal: 'The book has 12 chapters. Write a whole number from 1 to 12.' });
    for (const bad of ['0', '-1', '2.5', '', 'abc'])
      expect(at({ measure: 'chN', chapters: bad })).toMatchObject({ refusal: 'The book has 12 chapters. Write a whole number from 1 to 12.' });
    expect(at({ measure: 'minN', minutes: '9999' })).toMatchObject({ refusal: 'The book runs 600 finished minutes. Write a whole number from 1 to 600.' });
    expect(at({ measure: 'minN', minutes: '20' })).toMatchObject({ milestone: { measure: 'min20' } });
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '2026-10-05', measure: 'chN' }, undefined, { chapters: 0, minutes: 600 })).toMatchObject({
      refusal: 'The book has no chapters yet.',
    });
  });

  it('refuses a near-whole decimal, which the host would not read as a count (R2)', () => {
    const at = (chapters: string) => milestoneFromDraft({ ...blankDraft(), name: 'A', date: '2026-10-05', measure: 'chN', chapters }, undefined, BOUNDS);
    for (const bad of ['3.000000001', '1.0000000001', '11.99999999999'])
      expect(at(bad)).toMatchObject({ refusal: 'The book has 12 chapters. Write a whole number from 1 to 12.', field: 'n' });
    expect(at('3.0')).toMatchObject({ milestone: { measure: 'ch3' } });
  });

  it("refuses an N above 9999, the most the host keeps, in the dialog's words (R3)", () => {
    const big = { chapters: 12000, minutes: 20000 };
    const at = (patch: object) => milestoneFromDraft({ ...blankDraft(), name: 'A', date: '2026-10-05', ...patch }, undefined, big);
    expect(at({ measure: 'chN', chapters: '10000' })).toMatchObject({ refusal: 'The book has 12,000 chapters. Write a whole number from 1 to 9,999.' });
    expect(at({ measure: 'minN', minutes: '10000' })).toMatchObject({
      refusal: 'The book runs 20,000 finished minutes. Write a whole number from 1 to 9,999.',
    });
    expect(at({ measure: 'chN', chapters: '9999' })).toMatchObject({ milestone: { measure: 'ch9999' } });
  });

  it('says which field a refusal is about', () => {
    const at = (patch: object) => milestoneFromDraft({ ...blankDraft(), ...patch }, undefined, BOUNDS);
    expect(at({ name: '', date: '2026-10-05' })).toMatchObject({ field: 'name' });
    expect(at({ name: 'A', date: '' })).toMatchObject({ field: 'date' });
    expect(at({ name: 'A', date: '2026-10-05', measure: 'chN', chapters: '99' })).toMatchObject({ field: 'n' });
  });

  it('says "Write 1." when the book has one chapter', () => {
    const one = { chapters: 1, minutes: 600 };
    expect(milestoneFromDraft({ ...blankDraft(), name: 'A', date: '2026-10-05', measure: 'chN', chapters: '2' }, undefined, one)).toMatchObject({
      refusal: 'The book has 1 chapter. Write 1.',
    });
  });

  it('keeps the N a milestone already has when only its note changes, even after the book got shorter', () => {
    const old = { name: 'First 12', dueDate: '2026-10-05', measure: 'ch12' };
    const short = { chapters: 5, minutes: 600 };
    expect(milestoneFromDraft({ ...draftOf(old), note: 'a note' }, old, short)).toMatchObject({ milestone: { measure: 'ch12', note: 'a note' } });
    expect(milestoneFromDraft({ ...draftOf(old), chapters: '11' }, old, short)).toMatchObject({
      refusal: 'The book has 5 chapters. Write a whole number from 1 to 5.',
    });
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
