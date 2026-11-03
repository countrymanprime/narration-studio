import { describe, expect, it } from 'vitest';
import { buildChapterRows, openingId, SAMPLE_ROW_ID } from './rows';
import { CHAPTERS, failingTwo, passing, profile } from './testFiles';
import type { ManuscriptChapter } from '../../../types';

const chapters: ManuscriptChapter[] = CHAPTERS;

describe('buildChapterRows: one row per chapter and the retail sample, measured or not', () => {
  it('draws every chapter and the sample before anything is measured, each waiting', () => {
    const rows = buildChapterRows([], profile, chapters);
    expect(rows).toHaveLength(chapters.length + 1);
    expect(rows.at(-1)).toMatchObject({ id: SAMPLE_ROW_ID, name: 'Retail sample', waiting: 'No file measured yet', waitingPill: 'Waiting', noFile: true });
    for (const row of rows) expect(row).toMatchObject({ verdict: 'none', noFile: true, waitingPill: 'Waiting' });
  });

  it('says what a chapter without a file waits on: its open pickups, as Delivery counts them', () => {
    const rows = buildChapterRows([], profile, chapters, { [chapters[0]!.id]: 3, [chapters[1]!.id]: 1 });
    expect(rows[0]!.waiting).toBe('Waiting on 3 pickups');
    expect(rows[1]!.waiting).toBe('Waiting on 1 pickup');
    expect(rows[2]!.waiting).toBe('No file measured yet');
  });

  it('puts a chapter’s measured file on its row, in the chapter’s place, and keeps the others waiting', () => {
    const file = failingTwo('Chapter 04.wav');
    const rows = buildChapterRows([passing('Chapter 01.wav'), file], profile, chapters, { [chapters[3]!.id]: 2 });
    expect(rows[3]).toMatchObject({ id: file.path, verdict: 'fail' });
    expect(rows[3]!.waiting).toBeUndefined();
    expect(rows[1]).toMatchObject({ id: chapters[1]!.id, noFile: true });
    expect(openingId(rows)).toBe(file.path);
  });

  it('keeps a measured file that no chapter claims, before the sample, so nothing measured is dropped', () => {
    const stray = passing('Interview bonus.wav');
    const rows = buildChapterRows([stray], profile, chapters);
    expect(rows.at(-2)).toMatchObject({ id: stray.path, name: 'Interview bonus.wav' });
    expect(rows.at(-1)).toMatchObject({ id: SAMPLE_ROW_ID });
  });

  it('draws the Text figure of a file from its chapter’s current Recording Check, and "Not checked" for every file without one (#2105)', () => {
    const texts = { [chapters[0]!.id]: { percent: 97, met: true }, [chapters[3]!.id]: { percent: 82, met: false } };
    const rows = buildChapterRows(
      [passing('Chapter 01.wav'), failingTwo('Chapter 04.wav'), passing('Chapter 02.wav'), passing('Interview bonus.wav')],
      profile,
      chapters,
      undefined,
      texts,
    );
    expect(rows[0]!.text).toEqual({ text: '97%', missed: false });
    expect(rows[3]!.text).toEqual({ text: '82%', missed: true });
    expect(rows[1]!.text).toEqual({ text: 'Not checked', missed: false, unchecked: true });
    expect(rows.find((row) => row.name === 'Interview bonus.wav')!.text).toEqual({ text: 'Not checked', missed: false, unchecked: true });
    expect(rows[2]!.text).toBeUndefined();
  });

  it('opens on the first file when none fails, never on a waiting row', () => {
    const rows = buildChapterRows([passing('Chapter 03.wav')], profile, chapters);
    expect(openingId(rows)).toBe(rows[2]!.id);
    expect(openingId(buildChapterRows([], profile, chapters))).toBeUndefined();
  });
});
