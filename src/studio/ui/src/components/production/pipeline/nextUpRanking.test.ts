import { describe, expect, it } from 'vitest';
import { WPH } from '../../schedule/estimates';
import { NEXT_UP_BUSY } from './pipelineFixtures';
import { rankNextUp, recordingChapterOf } from './nextUpRanking';

describe('next-up-ranks-by-risk-then-group-then-stage', () => {
  it('lists the most work-hours at risk first, then an item with no hours by group and stage', () => {
    const kinds = rankNextUp(NEXT_UP_BUSY).map((i) => i.kind);
    // rec: 1 h left x 3 = 1.5 h x ... pick: 4 x 0.06; fail carries none, so it comes last.
    expect(kinds).toEqual(['rec', 'pick', 'fail']);
  });

  it('ranks a big pickup list above a nearly finished recording', () => {
    const kinds = rankNextUp({
      recording: { chapterId: 'c1', stage: 'recording', name: 'Chapter 1', words: WPH, share: 0.99, percent: 99 },
      pickups: { lines: 60, chapters: ['Chapter 2'] },
      failing: null,
    }).map((i) => i.kind);
    expect(kinds).toEqual(['pick', 'rec']);
  });

  it('is empty with nothing to say, and omits an item whose source says none', () => {
    expect(rankNextUp({ recording: null, pickups: { lines: 0, chapters: [] }, failing: { chapterId: 'c1', tag: 'x', fails: [] } })).toEqual([]);
  });
});

describe('next up never offers a delivered chapter as one to finish recording', () => {
  const chapters = [
    { id: 'c1', status: 'recording' as const },
    { id: 'c2', status: 'recording' as const },
    { id: 'c3', status: 'not_started' as const },
  ];
  it('skips a chapter mastered with its checks passing, and offers the next one still recording', () => {
    expect(recordingChapterOf(chapters)?.id).toBe('c1');
    expect(recordingChapterOf(chapters, { c1: { mastered: true, qc: 'PASS' } })?.id).toBe('c2');
    expect(recordingChapterOf(chapters, { c1: { mastered: true, qc: 'FAIL' } })?.id).toBe('c1');
    expect(recordingChapterOf(chapters, { c1: { mastered: true, qc: 'PASS' }, c2: { mastered: true, qc: 'PASS' } })).toBeUndefined();
  });
});
