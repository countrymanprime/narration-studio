import { describe, expect, it } from 'vitest';
import { buildChapterRows, openingId, SAMPLE_ROW_ID } from './rows';
import { CHAPTERS, failingTwo, passing, profile } from './testFiles';
import type { ManuscriptChapter } from '../../../types';

const chapters: ManuscriptChapter[] = CHAPTERS;

describe('buildChapterRows: one row per chapter and the retail sample, measured or not', () => {
  it('draws every chapter and the sample before anything is measured, each waiting', () => {
    const rows = buildChapterRows([], profile, chapters);
    expect(rows).toHaveLength(chapters.length + 1);
    expect(rows.at(-1)).toMatchObject({ id: SAMPLE_ROW_ID, name: 'Retail sample', waiting: 'No measured file yet', waitingPill: 'Waiting', hasFile: false });
    for (const row of rows) expect(row).toMatchObject({ verdict: 'none', hasFile: false, waitingPill: 'Waiting' });
  });

  it('says what a chapter without a file waits on: its open pickups, as Delivery counts them', () => {
    const rows = buildChapterRows([], profile, chapters, { [chapters[0]!.id]: 3, [chapters[1]!.id]: 1 });
    expect(rows[0]!.waiting).toBe('Waiting on 3 pickups');
    expect(rows[1]!.waiting).toBe('Waiting on 1 pickup');
    expect(rows[2]!.waiting).toBe('No measured file yet');
  });

  it('puts a chapter’s measured file on its row, in the chapter’s place, and keeps the others waiting', () => {
    const file = failingTwo('Chapter 04.wav');
    const rows = buildChapterRows([passing('Chapter 01.wav'), file], profile, chapters, { [chapters[3]!.id]: 2 });
    expect(rows[3]).toMatchObject({ id: file.path, hasFile: true, verdict: 'fail' });
    expect(rows[3]!.waiting).toBeUndefined();
    expect(rows[1]).toMatchObject({ id: chapters[1]!.id, hasFile: false });
    expect(openingId(rows)).toBe(file.path);
  });

  it('keeps a measured file that no chapter claims, after the sample, so nothing measured is dropped', () => {
    const stray = passing('Interview bonus.wav');
    const rows = buildChapterRows([stray], profile, chapters);
    expect(rows.at(-1)).toMatchObject({ id: stray.path, name: 'Interview bonus.wav', hasFile: true });
  });

  it('opens on the first measured file when none fails, never on a waiting row', () => {
    const rows = buildChapterRows([passing('Chapter 03.wav')], profile, chapters);
    expect(openingId(rows)).toBe(rows[2]!.id);
    expect(openingId(buildChapterRows([], profile, chapters))).toBe(chapters[0]!.id);
  });

  it('draws no sample row for a profile with no retail-sample rule and no sample file', () => {
    const none = { ...profile, rules: profile.rules.filter((rule) => rule.metric !== 'retail_sample_seconds') };
    expect(buildChapterRows([], none, chapters)).toHaveLength(chapters.length);
  });
});
