// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ChapterStatus, ManuscriptContentKind } from '../../api/contracts/manuscript';
import { PACE, RATIO, WPH } from './estimates';
import { parseIso } from './dates';
import { calc, deadlineTone, milestoneStatus, remainFor, scheduleChapters, type ScheduleChapter } from './progress';

const ch = (status: ChapterStatus, words = WPH, kind: ManuscriptContentKind | '' = 'narration'): ScheduleChapter => ({ status, words, kind });
const TODAY = parseIso('2026-10-01');
const day = (n: number) => parseIso(`2026-10-${String(1 + n).padStart(2, '0')}`);

describe('the work left', () => {
  it('is each stage at its ratio over the unfinished words, and nothing for finished chapters', () => {
    const k = calc([ch('not_started')], TODAY, day(30));
    expect(k.remain).toBeCloseTo(RATIO.rec + RATIO.edit + RATIO.proof);
    expect(calc([ch('editing')], TODAY, day(30)).remain).toBeCloseTo(RATIO.edit + RATIO.proof);
    expect(calc([ch('finalized')], TODAY, day(30)).remain).toBe(0);
  });

  it('counts an open pickup at its own hours', () => {
    expect(calc([ch('finalized')], TODAY, day(30), 10).remain).toBeCloseTo(0.6);
  });

  it('leaves reference chapters out', () => {
    const chapters = scheduleChapters([
      { status: 'not_started', wordCount: WPH, contentKind: 'reference' },
      { status: 'finalized', wordCount: WPH, contentKind: 'narration' },
    ]);
    expect(chapters).toHaveLength(1);
    expect(calc(chapters, TODAY, day(5)).finished).toBe(true);
  });
});

describe('the verdict for a deadline', () => {
  const unfinished = [ch('not_started', WPH * 0.1)];
  it('is neutral beyond a week, a warning at a week or less, danger once past, success when finished', () => {
    const tone = (due: number, chapters = unfinished) => deadlineTone(calc(chapters, TODAY, day(due)));
    expect(tone(30)).toBe('neutral');
    expect(tone(8)).toBe('neutral');
    expect(tone(7)).toBe('warn');
    expect(tone(1)).toBe('warn');
    // Due today with work left is behind, so the projection makes it danger.
    expect(tone(0)).toBe('danger');
    expect(tone(-1)).toBe('danger');
    expect(tone(-1, [ch('finalized')])).toBe('success');
    expect(tone(30, [ch('finalized')])).toBe('success');
  });

  it('can only be made worse by the projection, and only while work is left', () => {
    // 1 finished hour of work is 6.04 work-hours: about 5 days at the daily pace.
    const book = [ch('not_started')];
    const days = Math.ceil((RATIO.rec + RATIO.edit + RATIO.proof) / PACE);
    expect(calc(book, TODAY, day(days + 20)).verdict).toBe('ok');
    expect(deadlineTone(calc(book, TODAY, day(days + 20)))).toBe('neutral');
    // Tight: slack under 3 days turns a neutral tone into a warning.
    expect(calc(book, TODAY, day(days + 1)).verdict).toBe('tight');
    expect(deadlineTone(calc(book, TODAY, day(days + 1)))).toBe('warn');
    // Behind makes it danger, with days left to warn or a week or more.
    expect(calc(book, TODAY, day(3)).verdict).toBe('behind');
    expect(deadlineTone(calc(book, TODAY, day(3)))).toBe('danger');
    expect(deadlineTone(calc([ch('not_started', WPH * 40)], TODAY, day(20)))).toBe('danger');
    // A finished book is never made worse.
    expect(deadlineTone(calc([ch('finalized')], TODAY, day(1)))).toBe('success');
  });

  it('has no verdict without a due date', () => {
    const k = calc([ch('editing')], TODAY, null);
    expect(k.verdict).toBeNull();
    expect(deadlineTone(k)).toBe('neutral');
    expect(k.daysLeft).toBeNull();
  });
});

describe('the work left for a measure', () => {
  const book = [ch('not_started'), ch('editing'), ch('proofing'), ch('finalized')];
  it('reaches whole stages', () => {
    expect(remainFor(book, 'rec')).toBeCloseTo(RATIO.rec);
    expect(remainFor(book, 'edit')).toBeCloseTo(RATIO.edit * 2);
    expect(remainFor(book, 'proof')).toBeCloseTo(RATIO.proof * 3);
    expect(remainFor(book, 'editproof')).toBeCloseTo(RATIO.edit * 2 + RATIO.proof * 3);
    expect(remainFor(book, 'all')).toBeCloseTo(calc(book, TODAY, day(30)).remain);
  });

  it('reaches the first N chapters edited and proofed, the opening included', () => {
    const withOpening = [ch('not_started', WPH, 'opening'), ...book];
    expect(remainFor(withOpening, 'ch1')).toBeCloseTo(RATIO.edit + RATIO.proof + RATIO.edit + RATIO.proof);
    expect(remainFor(book, 'ch2')).toBeCloseTo((RATIO.edit + RATIO.proof) * 2);
  });

  it('reaches the first N finished minutes by the share of each chapter inside them', () => {
    // 15 minutes of a book whose first chapter is one finished hour is a quarter of it.
    expect(remainFor([ch('not_started')], 'checkpoint')).toBeCloseTo(0.25 * (RATIO.rec + RATIO.edit + RATIO.proof));
    expect(remainFor([ch('not_started')], 'min30')).toBeCloseTo(0.5 * (RATIO.rec + RATIO.edit + RATIO.proof));
    expect(remainFor([ch('finalized'), ch('not_started')], 'min90')).toBeCloseTo(0.5 * (RATIO.rec + RATIO.edit + RATIO.proof));
  });
});

describe('a milestone status', () => {
  const book = [ch('not_started')];
  const need = Math.ceil(RATIO.rec / PACE);
  const ms = (measure: string | undefined, dueDays: number, done = false) => ({
    name: 'M',
    dueDate: `2026-10-${String(1 + dueDays).padStart(2, '0')}`,
    measure,
    done,
  });

  it('is done when it is done, whatever it measures', () => {
    expect(milestoneStatus(ms('custom', 5, true), book, TODAY)).toMatchObject({ kind: 'done', sentence: 'Done' });
  });

  it('says "Not estimated" for a custom milestone', () => {
    expect(milestoneStatus(ms(undefined, 5), book, TODAY)).toMatchObject({ kind: 'none', sentence: 'Not estimated' });
    expect(milestoneStatus(ms('custom', 5), book, TODAY)).toMatchObject({ kind: 'none' });
  });

  it('estimates a measured milestone from the fixed inputs: late, at risk or on track', () => {
    const late = milestoneStatus(ms('rec', need - 2), book, TODAY);
    expect(late.kind).toBe('late');
    expect(late.sentence).toMatch(/^Late by 2 d \(est\. [A-Z][a-z]{2} \d+\)$/);
    expect(late.short).toBe('+2 d');
    expect(milestoneStatus(ms('rec', need - 1), book, TODAY).kind).toBe('late');
    expect(milestoneStatus(ms('rec', need), book, TODAY).kind).toBe('risk');
    expect(milestoneStatus(ms('rec', need + 1), book, TODAY).kind).toBe('risk');
    const ok = milestoneStatus(ms('rec', need + 3), book, TODAY);
    expect(ok.kind).toBe('ok');
    expect(ok.sentence).toMatch(/^On track \(est\./);
  });
});

describe('calc-follows-the-basis', () => {
  it('a faster own rate shrinks the work left and a slower one grows it; no argument is the standard', () => {
    const chapters = [ch('not_started', WPH * 2)];
    const base = calc(chapters, TODAY, day(10));
    expect(calc(chapters, TODAY, day(10), 0, WPH)).toEqual(base);
    const fast = calc(chapters, TODAY, day(10), 0, WPH * 2);
    expect(fast.remain).toBeCloseTo(base.remain / 2);
    expect(fast.days).toBeLessThan(base.days);
    expect(calc(chapters, TODAY, day(10), 0, WPH / 2).remain).toBeCloseTo(base.remain * 2);
  });

  it('changes the verdict', () => {
    const chapters = [ch('not_started', WPH * 3)];
    expect(calc(chapters, TODAY, day(10)).verdict).toBe('behind');
    expect(calc(chapters, TODAY, day(10), 0, WPH * 4).verdict).toBe('ok');
  });
});
