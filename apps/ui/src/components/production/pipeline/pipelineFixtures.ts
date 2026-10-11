import type { ProductionChapter } from '../../../api/contracts/production';
import type { StageChapterRecommendation } from '../../../types';
import { WPH } from '../../schedule/estimates';
import type { ChapterCheckStatus } from '../chapterCheckStatus';
import { recommendation } from '../readiness/readinessFixtures';
import { calc, scheduleChapters, type Calc } from '../../schedule/progress';
import type { PipelineSources } from './pipelineRows';
import type { NextUpInputs } from './nextUpRanking';

/** "Chapter 4" for `c4`: built, not written out, because a sample title is a fixture's to take from `src/fixtures/` (ADR 0770). */
const nameOf = (id: string): string => `Chapter ${id.replace(/\D/g, '')}`;

/** A chapter for tests and stories: a Studio Next sized one, an hour of finished audio by default. */
export function chapter(id: string, overrides: Partial<ProductionChapter> = {}): ProductionChapter {
  return {
    id,
    title: nameOf(id),
    contentKind: 'narration',
    status: 'not_started',
    wordCount: WPH,
    recordedSeconds: null,
    hoursLogged: 0,
    pfh: null,
    readiness: null,
    ...overrides,
  };
}

/** Mid-book: one chapter in each stage, with a measured recording under way. */
export const MID_BOOK: ProductionChapter[] = [
  chapter('c1', { status: 'finalized', recordedSeconds: 3600 }),
  chapter('c2', { status: 'proofing', recordedSeconds: 3500 }),
  chapter('c3', { status: 'editing', recordedSeconds: 3700 }),
  chapter('c4', { status: 'recording', recordedSeconds: 1800 }),
  chapter('c5'),
];

export const FINISHED: ProductionChapter[] = [chapter('c1', { status: 'finalized' }), chapter('c2', { status: 'finalized' })];
export const NOTHING_RECORDED: ProductionChapter[] = [chapter('c1'), chapter('c2'), chapter('c3')];
export const LONG_NAME: ProductionChapter[] = [
  chapter('c1', {
    title: 'An exceptionally long chapter title that keeps going well past the width the chapter column has to give it',
    subtitle: 'and a subtitle that does the same, so the cell has to wrap rather than push the stage columns out of line',
    status: 'recording',
    recordedSeconds: 900,
  }),
];

export const MID_BOOK_SOURCES: PipelineSources = {
  checks: { c4: { kind: 'stale', reason: 'item_added', changedAt: '2026-10-10T09:00:00Z' } satisfies ChapterCheckStatus },
  proof: { c2: { cleared: 6, total: 9 } },
  prep: { c1: 'prepped', c2: 'prepped', c3: 'prepped', c4: 'progress', c5: 'none' },
  pickups: { c1: 0, c2: 2, c3: 0 },
  master: { c1: { mastered: true, qc: 'PASS' }, c2: { mastered: false, qc: 'RMS -24 dB' } },
};

export const MID_BOOK_RECOMMENDATIONS: ReadonlyMap<string, StageChapterRecommendation> = new Map([
  ['c3', recommendation({ chapterId: 'c3', title: nameOf('c3'), from: 'editing', target: 'proofing' })],
  ['c4', recommendation({ chapterId: 'c4', title: nameOf('c4'), from: 'recording', target: 'editing', verdict: 'not_ready' })],
]);

export const STORY_TODAY = new Date(2026, 9, 1);
export const STORY_DUE = new Date(2026, 9, 31);

/** The estimates for the header's verdict, over the narrated chapters of an overview. */
export function calcFor(chapters: readonly ProductionChapter[], due: Date | null = STORY_DUE): Calc {
  return calc(scheduleChapters(chapters), STORY_TODAY, due);
}

export const NEXT_UP_BUSY: NextUpInputs = {
  recording: { chapterId: 'c4', stage: 'recording', name: nameOf('c4'), words: WPH, share: 0.5 },
  pickups: { lines: 4, chapters: [nameOf('c2'), nameOf('c3')] },
  failing: { chapterId: 'c2', tag: nameOf('c2'), fails: ['RMS -24 dB (limit -23 to -18 dB)'] },
  changed: null,
};

export const NEXT_UP_EMPTY: NextUpInputs = { recording: null, pickups: null, failing: null, changed: null };
