// Clusters 6 and 8 of docs/research/ui-function-audit.md, on top of #2573: every surface that totals the book counts one chapter set (narration;
// a reference section and a chapter removed from recording as Front Matter are out), and every "% recorded" figure reads one value
// (`recordedShare`, which prefers the host's `recordedThrough`, the value the Booth resumes at).
import { describe, expect, it } from 'vitest';
import type { ProductionChapter } from './api/contracts/production';
import type { ManuscriptChapter } from './api/contracts/manuscript';
import { isNarrationChapter } from './chapterKinds';
import { chapterTrackRows } from './components/engine/chapterTrackRows';
import { stageSegments } from './components/production/overview/overviewFigures';
import { buildPipelineRows } from './components/production/pipeline/pipelineRows';
import { paceChapters } from './components/schedule/useEffectiveWph';
import { remainFor, scheduleChapters } from './components/schedule/progress';
import { RATIO, WPH } from './components/schedule/estimates';
import { chapterRecordedDetail, recordedShare } from './recordedThrough';

const chapter = (id: string, patch: Partial<ProductionChapter> = {}): ProductionChapter => ({
  id,
  title: id,
  contentKind: 'narration',
  status: 'not_started',
  wordCount: 9300,
  recordedSeconds: null,
  hoursLogged: 0,
  pfh: null,
  readiness: null,
  ...patch,
});

describe('which chapters the book totals count', () => {
  const book = [chapter('c1'), chapter('c2', { contentKind: '' }), chapter('front', { contentKind: 'opening' }), chapter('ref', { contentKind: 'reference' })];
  const narrated = ['c1', 'c2'];

  it('is the narration chapters on Production, Schedule, the pace, the stage bar and the Engine links', () => {
    expect(book.filter(isNarrationChapter).map((c) => c.id)).toEqual(narrated);
    expect(scheduleChapters(book)).toHaveLength(narrated.length);
    expect(paceChapters(book).map((c) => c.id)).toEqual(narrated);
    const stageWords = stageSegments(book, WPH).reduce((sum, segment) => sum + segment.words, 0);
    expect(stageWords).toBe(narrated.length * 9300);
    expect(chapterTrackRows(book as unknown as ManuscriptChapter[], [], []).map((row) => row.chapter.id)).toEqual(narrated);
  });
});

describe('the opening of the book', () => {
  it('is the opening credits for the Schedule milestone: Front Matter is out, the credits and the first N chapters are in', () => {
    const book = [chapter('credits-opening'), chapter('front', { contentKind: 'opening' }), chapter('c1'), chapter('c2')];
    const work = remainFor(scheduleChapters(book), 'ch1');
    // Two chapters (the credits and c1) at edit + proof; not Front Matter, not c2.
    expect(work).toBeCloseTo((RATIO.edit + RATIO.proof) * 2);
    expect(scheduleChapters(book.filter((c) => c.id !== 'credits-opening'))).toHaveLength(2);
  });
});

describe('how far a chapter is recorded', () => {
  const through = { paragraphId: 'p1', word: 3, percent: 40, complete: false, source: 'booth' as const, confident: true };
  // 70% by the track's length, 40% by the Booth's resume point: the Booth's value is the one every page shows.
  const chosen = chapter('c1', { status: 'recording', recordedSeconds: 0.7 * 3600, recordedThrough: through });

  it('is the host recordedThrough in the pipeline cell, Next up, the stage bar and the chapter lists', () => {
    expect(recordedShare(chosen, WPH)).toBeCloseTo(0.4);
    expect(buildPipelineRows([chosen])[0].cells.record.text).toBe('40%');
    expect(chapterRecordedDetail(chosen)).toBe('40%');
    const recorded = stageSegments([chosen], WPH).find((segment) => segment.key === 'recorded');
    expect(recorded?.percent).toBeCloseTo(40);
  });

  it('falls back to the measured length against the finished length, and to nothing when neither is known', () => {
    expect(recordedShare(chapter('c1', { recordedSeconds: 0.5 * 3600 }), WPH)).toBeCloseTo(0.5);
    expect(recordedShare(chapter('c1'), WPH)).toBeNull();
  });
});
