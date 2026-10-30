// A chapter whose master fails its checks is not Delivered anywhere (docs/research/ui-function-audit.md, cluster 7): the Production stage
// bar, the Production pipeline's QC cell figures and the Delivery page's rows all read the same measured files and give one answer.
import { describe, expect, it } from 'vitest';
import { chapterStates } from './components/delivery/page/chapterStates';
import { failingTwo, passing } from './components/masterqc/files/testFiles';
import { deliveryCounts, stageSegments } from './components/production/overview/overviewFigures';
import { MID_BOOK } from './components/production/overview/overviewFixtures';
import { masterByChapter } from './components/production/usePipelineSources';
import { WPH } from './components/schedule/estimates';

describe('a chapter with a FAIL master', () => {
  const [c1, c2] = MID_BOOK.slice(0, 2).map((chapter, at) => ({ ...chapter, status: 'finalized' as const, title: `Chapter 0${at + 1}`, index: at }));
  const files = [failingTwo('Chapter 01.wav'), passing('Chapter 02.wav')];
  const master = masterByChapter([c1, c2], files);

  it('is counted as failing, not delivered, by the stage bar, the delivery counts and the Delivery rows', () => {
    const delivered = stageSegments([c1, c2], WPH, master).find((segment) => segment.key === 'delivered');
    expect(delivered?.words).toBe(c2.wordCount);
    const counts = deliveryCounts([c1.id, c2.id], master);
    expect(counts.ok && counts.value).toMatchObject({ pass: 1, fail: 1 });
    expect(chapterStates([c1, c2], files).map((row) => row.kind)).toEqual(['bad', 'ok']);
  });
});
