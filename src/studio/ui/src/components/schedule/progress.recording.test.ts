// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ChapterStatus, RecordedThrough } from '../../api/contracts/manuscript';
import { bookFigures } from '../production/overview/overviewFigures';
import type { ProductionChapter } from '../production/composeOverview';
import { recordedPercent } from '../../recordedThrough';
import { PACE, RATIO, WPH } from './estimates';
import { parseIso } from './dates';
import { calc, milestoneStatus, remainFor, scheduleChapters, type ScheduleChapter } from './progress';

const TODAY = parseIso('2026-10-01');
const DUE = parseIso('2026-12-31');
const through = (percent: number, complete = false): RecordedThrough => ({
  paragraphId: 'p',
  paragraph: 1,
  word: 1,
  percent,
  complete,
  source: 'booth',
  confident: true,
});
const chapter = (status: ChapterStatus, words = WPH, percent?: number, complete = false): ScheduleChapter => ({
  words,
  status,
  kind: 'narration',
  recordedSeconds: percent ? 100 : 0,
  ...(percent === undefined ? {} : { recordedThrough: through(percent, complete) }),
});
const recLeft = (chapters: ScheduleChapter[]) => calc(chapters, TODAY, DUE).recLeft;

describe('Recording left follows what is recorded', () => {
  it('is the whole book at its ratio with nothing recorded, and none with everything recorded', () => {
    expect(recLeft([chapter('not_started'), chapter('not_started')])).toBeCloseTo(2 * RATIO.rec);
    expect(recLeft([chapter('editing'), chapter('proofing'), chapter('finalized')])).toBe(0);
  });

  it('takes a part-recorded chapter at what is left of it, and a chapter at 100% at none, even while its stage still says recording', () => {
    expect(recLeft([chapter('recording', WPH, 50)])).toBeCloseTo(0.5 * RATIO.rec);
    expect(recLeft([chapter('recording', WPH, 100, true)])).toBe(0);
    expect(recLeft([chapter('recording', WPH, 0)])).toBeCloseTo(RATIO.rec);
  });

  it('is the total less the recorded, at the recording ratio, across a mix', () => {
    const book = [chapter('recording', WPH, 50), chapter('recording', WPH * 2, 100, true), chapter('not_started'), chapter('editing')];
    const total = WPH * 5;
    const recorded = WPH * (0.5 + 2 + 0 + 1);
    expect(recLeft(book)).toBeCloseTo(((total - recorded) / WPH) * RATIO.rec);
  });

  it('comes from the measured length when the host sent no percent', () => {
    expect(recLeft([{ words: WPH, status: 'recording', kind: 'narration', recordedSeconds: 900 }])).toBeCloseTo(0.75 * RATIO.rec);
  });

  it('leaves editing and proofing whole for a chapter recorded to 100% whose stage has not moved on', () => {
    const k = calc([chapter('recording', WPH, 100, true)], TODAY, DUE);
    expect(k.editLeft).toBeCloseTo(RATIO.edit);
    expect(k.proofLeft).toBeCloseTo(RATIO.proof);
  });

  it('is the same figure Production counts as not recorded yet, for the same chapters', () => {
    const book = [chapter('recording', WPH, 50), chapter('recording', WPH * 2, 100, true), chapter('not_started'), chapter('editing')];
    const rows = book.map((c, i) => ({
      id: `c${i}`,
      contentKind: 'narration',
      status: c.status,
      wordCount: c.words,
      recordedSeconds: c.recordedSeconds ?? null,
      recordedThrough: c.recordedThrough,
    }));
    const { words } = bookFigures(rows as unknown as ProductionChapter[], WPH);
    expect(recLeft(book)).toBeCloseTo(((words.total - words.recorded) / WPH) * RATIO.rec);
  });

  it('counts a chapter mastered with its checks passing as recorded, as Production does, whatever its stage says', () => {
    const rows = [
      { id: 'a', contentKind: 'narration', status: 'recording', wordCount: WPH, recordedSeconds: null },
      { id: 'b', contentKind: 'narration', status: 'not_started', wordCount: WPH, recordedSeconds: null },
      { id: 'c', contentKind: 'narration', status: 'recording', wordCount: WPH, recordedSeconds: null },
    ] as unknown as ProductionChapter[];
    const master = { a: { mastered: true, qc: 'PASS' }, b: { mastered: true, qc: 'FAIL' }, c: { mastered: false, qc: null } };
    const { words } = bookFigures(rows, WPH, master);
    const k = calc(scheduleChapters(rows, master), TODAY, DUE, 0, WPH);
    expect(words.total - words.recorded).toBe(2 * WPH);
    expect(k.recLeft).toBeCloseTo(((words.total - words.recorded) / WPH) * RATIO.rec);
    expect(calc(scheduleChapters(rows), TODAY, DUE).recLeft).toBeCloseTo(3 * RATIO.rec);
  });

  it('keeps recording left for a chapter the Booth prints below 100%', () => {
    // A host 0% with a long track prints 1%.
    const longTrack: ScheduleChapter = { words: WPH, status: 'recording', kind: 'narration', recordedSeconds: 7200, recordedThrough: through(0) };
    expect(recordedPercent({ recordedThrough: longTrack.recordedThrough, recordedSeconds: 7200, wordCount: WPH }, WPH)).toBe(1);
    expect(recLeft([longTrack])).toBeCloseTo(0.99 * RATIO.rec);
    // No host value and a track that reached the estimate prints 99%: only the host says done.
    const reached: ScheduleChapter = { words: WPH, status: 'recording', kind: 'narration', recordedSeconds: 3600 };
    expect(recordedPercent({ recordedSeconds: 3600, wordCount: WPH }, WPH)).toBe(99);
    expect(recLeft([reached])).toBeCloseTo(0.01 * RATIO.rec);
  });

  it('reaches the chapter list through scheduleChapters', () => {
    const [c] = scheduleChapters([{ status: 'recording', wordCount: WPH, contentKind: 'narration', recordedSeconds: 5, recordedThrough: through(40) }]);
    expect(c.recordedSeconds).toBe(5);
    expect(c.recordedThrough?.percent).toBe(40);
  });
});

describe('milestone estimates follow the pipeline order', () => {
  const ORDER = ['rec', 'edit', 'proof', 'editproof', 'all'] as const;
  const stages: ChapterStatus[] = ['not_started', 'recording', 'editing', 'proofing', 'finalized'];
  const books: ScheduleChapter[][] = [
    [chapter('not_started')],
    // Little left to edit, much to record: before the fix "All edited" was estimated before "All recorded".
    [chapter('not_started', WPH * 3), chapter('proofing', WPH * 0.1)],
    [chapter('recording', WPH * 3, 40), chapter('not_started', WPH * 0.2)],
    [chapter('finalized'), chapter('editing', WPH * 2), chapter('recording', WPH * 0.1, 100, true)],
    ...stages.map((s) => [chapter(s), chapter(s, WPH * 7, 30)]),
  ];

  it('keeps First N milestones within the whole book and ch(N) within ch(N+1)', () => {
    const numbered = (status: ChapterStatus, words = WPH, percent?: number) => chapter(status, words, percent);
    for (const book of [
      [numbered('not_started'), numbered('recording', WPH, 60), numbered('editing')],
      [numbered('proofing'), numbered('not_started', WPH * 3)],
    ]) {
      const all = remainFor(book, 'all');
      for (const m of ['ch1', 'ch2', 'ch3', 'min15', 'min60', 'checkpoint']) expect(remainFor(book, m)).toBeLessThanOrEqual(all + 1e-9);
      expect(remainFor(book, 'ch1')).toBeLessThanOrEqual(remainFor(book, 'ch2') + 1e-9);
      expect(remainFor(book, 'ch2')).toBeLessThanOrEqual(remainFor(book, 'ch3') + 1e-9);
      expect(remainFor(book, 'min15')).toBeLessThanOrEqual(remainFor(book, 'min60') + 1e-9);
      // The work of the first chapter is no less than recording alone: a chapter is edited after it is recorded.
      expect(remainFor(book, 'ch1')).toBeGreaterThanOrEqual(remainFor(book.slice(0, 1), 'rec') - 1e-9);
    }
  });

  it('never lets an earlier milestone come later than a later one, in hours or in days', () => {
    for (const book of books) {
      const hours = ORDER.map((m) => remainFor(book, m));
      for (let i = 1; i < hours.length; i += 1) expect(hours[i] + 1e-9).toBeGreaterThanOrEqual(hours[i - 1]);
      const days = hours.map((h) => Math.ceil(h / PACE));
      for (let i = 1; i < days.length; i += 1) expect(days[i]).toBeGreaterThanOrEqual(days[i - 1]);
    }
  });

  it('puts "All edited" no earlier than "All recorded" in the date the Schedule prints', () => {
    const book = [chapter('not_started', WPH * 3), chapter('proofing', WPH * 0.1)];
    const date = (measure: string) => /est\. (.*?)\)?$/.exec(milestoneStatus({ dueDate: '2027-12-31', measure, done: false }, book, TODAY).short)?.[1];
    const rec = date('rec');
    const edit = date('edit');
    expect(rec).toBeTruthy();
    expect(remainFor(book, 'edit')).toBeGreaterThan(remainFor(book, 'rec'));
    expect(Date.parse(`${edit} 2026`)).toBeGreaterThanOrEqual(Date.parse(`${rec} 2026`));
  });
});
