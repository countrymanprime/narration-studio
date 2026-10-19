import { describe, expect, it } from 'vitest';
import { WPH } from '../../schedule/estimates';
import { NEXT_UP_BUSY } from './pipelineFixtures';
import { rankNextUp } from './nextUpRanking';

describe('next-up-ranks-by-risk-then-group-then-stage', () => {
  it('lists the most work-hours at risk first, then an item with no hours by group and stage', () => {
    const kinds = rankNextUp(NEXT_UP_BUSY).map((i) => i.kind);
    // rec: 1 h left x 3 = 1.5 h x ... pick: 4 x 0.06; fail carries none, so it comes last.
    expect(kinds).toEqual(['rec', 'pick', 'fail']);
  });

  it('ranks a big pickup list above a nearly finished recording', () => {
    const kinds = rankNextUp({
      recording: { chapterId: 'c1', stage: 'recording', name: 'Chapter 1', words: WPH, share: 0.99 },
      pickups: { lines: 60, chapters: ['Chapter 2'] },
      failing: null,
    }).map((i) => i.kind);
    expect(kinds).toEqual(['pick', 'rec']);
  });

  it('is empty with nothing to say, and omits an item whose source says none', () => {
    expect(rankNextUp({ recording: null, pickups: { lines: 0, chapters: [] }, failing: { chapterId: 'c1', tag: 'x', fails: [] } })).toEqual([]);
  });
});
