import { describe, expect, it } from 'vitest';
import type { CoverageResult } from '../../api/contracts/coverage';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { audioToCheck, finishedToast, formatAudio, lastResultSentence, recordedChapters, runTotals, stoppedToast, unmeasuredNote } from './checkSelection';

const chapter = (id: string, extra: Partial<ManuscriptChapter> = {}): ManuscriptChapter => ({
  id,
  title: id,
  index: 1,
  wordCount: 10,
  status: 'recording',
  ...extra,
});
const report = (gaps: number, unfinished: { start: number; end: number }, paragraphs = 6, model = 'small'): CoverageResult =>
  ({
    chapterId: 'c',
    state: 'current',
    reasons: [],
    result: {
      model,
      paragraphs: Array.from({ length: paragraphs }, (_, i) => ({ id: `p${i}`, tokens: 1, present: 1, longestMissingRun: 0 })),
      gaps: Array.from({ length: gaps }, (_, i) => ({ id: `g${i}` })),
      unfinished,
    },
  }) as unknown as CoverageResult;

describe('recordedChapters', () => {
  it('keeps only chapters with a recording', () => {
    const list = [
      chapter('a', { recordedSeconds: 60 }),
      chapter('b', { recordedSeconds: 0 }),
      chapter('c'),
      chapter('d', { recordedFraction: 0.5 }),
      chapter('e', { recordedSeconds: 9, removedFromRecording: true }),
    ];
    expect(recordedChapters(list).map((c) => c.id)).toEqual(['a', 'd']);
  });
});

describe('audioToCheck', () => {
  it('sums the ticked measured lengths and counts the unmeasured ones', () => {
    const list = [
      chapter('a', { recordedSeconds: 600 }),
      chapter('b', { recordedSeconds: 300 }),
      chapter('c', { recordedFraction: 0.4 }),
      chapter('d', { recordedSeconds: 999 }),
    ];
    expect(audioToCheck(list, new Set(['a', 'b', 'c']))).toEqual({ seconds: 900, unmeasured: 1 });
    expect(unmeasuredNote(1)).toBe('1 chapter left out: length not measured');
    expect(unmeasuredNote(0)).toBe('');
  });
  it('formats a duration', () => {
    expect(formatAudio(4320)).toBe('1 h 12 min');
    expect(formatAudio(2520)).toBe('42 min');
  });
});

describe('result sentences', () => {
  it('names the engine, the lines to redo and how far the read reached', () => {
    expect(lastResultSentence(report(2, { start: 0, end: 2 }))).toBe('small · 2 lines to redo · read 4 of 6 paragraphs');
    expect(lastResultSentence(report(1, { start: 0, end: 0 }))).toBe('small · 1 line to redo');
    expect(lastResultSentence({ chapterId: 'c', state: 'never', reasons: [] })).toBe('');
  });
  it('counts gaps and unfinished from the stored results; an unfinished end is never a line to redo', () => {
    const totals = runTotals([report(2, { start: 0, end: 3 }), report(1, { start: 0, end: 0 })]);
    expect(totals).toEqual({ chapters: 2, linesToRedo: 3, notToTheEnd: 1 });
    expect(finishedToast(totals)).toBe('Checked 2 chapters · 3 lines to redo · 1 not recorded to the end');
    expect(stoppedToast(0)).toBe('Stopped. Nothing was stored.');
  });
});
