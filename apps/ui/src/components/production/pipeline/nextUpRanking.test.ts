import { describe, expect, it } from 'vitest';
import { WPH } from '../../schedule/estimates';
import { NEXT_UP_BUSY } from './pipelineFixtures';
import { rankNextUp } from './nextUpRanking';

describe('next-up-ranks-by-risk-then-group-then-stage', () => {
  it('lists the most work-hours at risk first, then an item with no hours by group and stage', () => {
    const kinds = rankNextUp({ ...NEXT_UP_BUSY, changed: { count: 2, names: ['Chapter 1', 'Chapter 2'] } }).map((i) => i.kind);
    // rec: 1 h left x 3 = 1.5 h x ... pick: 4 x 0.06; fail and flags carry none. fail (group 0) comes before flags (group 1).
    expect(kinds).toEqual(['rec', 'pick', 'fail', 'flags']);
  });

  it('ranks a big pickup list above a nearly finished recording', () => {
    const kinds = rankNextUp({
      recording: { chapterId: 'c1', stage: 'recording', name: 'Chapter 1', words: WPH, share: 0.99 },
      pickups: { lines: 60, chapters: ['Chapter 2'] },
      failing: null,
      changed: null,
    }).map((i) => i.kind);
    expect(kinds).toEqual(['pick', 'rec']);
  });

  it('breaks a tie of hours by group, then by the least advanced stage', () => {
    const kinds = rankNextUp({
      recording: null,
      pickups: null,
      failing: { chapterId: 'c1', tag: 'Chapter 1', fails: ['RMS'] },
      changed: { count: 1, names: ['Chapter 3'] },
    }).map((i) => i.kind);
    expect(kinds).toEqual(['fail', 'flags']);
  });

  it('is empty with nothing to say, and omits an item whose source says none', () => {
    expect(rankNextUp({ recording: null, pickups: { lines: 0, chapters: [] }, failing: { chapterId: 'c1', tag: 'x', fails: [] }, changed: null })).toEqual([]);
  });
});
