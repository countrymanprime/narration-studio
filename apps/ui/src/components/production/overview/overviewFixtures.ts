import type { ChapterSyncChapter } from '../../../api/contracts/chapterSync';
import type { ProductionChapter } from '../../../api/contracts/production';
import type { Measured } from '../../../api/schemas/base';
import type { TakeLogEntry } from '../../../fixtures/measurements';
import { WPH } from '../../schedule/estimates';
import { calc, scheduleChapters } from '../../schedule/progress';
import { planStart, recordedSeries, weekFigures } from '../measured/measured.selectors';
import { FINISHED, MID_BOOK, NOTHING_RECORDED, STORY_DUE, STORY_TODAY } from '../pipeline/pipelineFixtures';
import { checkCounts, kpiTiles, stageSegments, type DeliveryCounts, type KpiInputs } from './overviewFigures';

export { FINISHED, MID_BOOK, NOTHING_RECORDED, STORY_TODAY };

const hours = (chapters: readonly ProductionChapter[]): number => chapters.reduce((a, c) => a + (c.recordedSeconds ?? 0), 0);

const TAKES: readonly TakeLogEntry[] = [
  { at: '2026-09-14T10:10', seconds: 3600 },
  { at: '2026-09-20T09:30', seconds: 3600 },
  { at: '2026-09-28T14:00', seconds: 3000 },
  { at: '2026-10-01T08:30', seconds: 1800 },
];
const TAKE_LOG: Measured<readonly TakeLogEntry[]> = { ok: true, value: TAKES };
export const NO_TAKE_LOG: Measured<never> = { ok: false, reason: 'Takes recorded in REAPER are not logged by day.' };

const DELIVERY: Measured<DeliveryCounts> = { ok: true, value: { pass: 2, fail: 1, total: 5 } };
const NO_DELIVERY: Measured<DeliveryCounts> = { ok: false, reason: 'No chapter has a delivery check yet.' };

/** The figures one page state hands the components. */
export function overviewFor(
  chapters: readonly ProductionChapter[],
  due: Date | null = STORY_DUE,
  log: Measured<readonly TakeLogEntry[]> = TAKE_LOG,
  openPickups = 3,
) {
  const k = calc(scheduleChapters(chapters), STORY_TODAY, due, openPickups);
  const start = planStart(STORY_TODAY);
  const kpi: KpiInputs = {
    k,
    wph: WPH,
    recordedSeconds: hours(chapters),
    due,
    openPickups,
    pickupMinutes: log.ok ? { ok: true, value: 12 } : { ok: false, reason: 'No pickup session has been timed.' },
    delivery: log.ok ? DELIVERY : NO_DELIVERY,
  };
  return {
    k,
    start,
    kpi,
    tiles: kpiTiles(kpi),
    segments: stageSegments(chapters, WPH),
    week: weekFigures(log, STORY_TODAY, start, due, k.words / WPH),
    series: recordedSeries(log, start),
    recordedHours: hours(chapters) / 3600,
  };
}

const sync = (chapterId: string, freshness: ChapterSyncChapter['freshness']): ChapterSyncChapter => ({
  chapterId,
  chapterTitle: chapterId,
  trackGuid: `track-${chapterId}`,
  trackName: chapterId,
  origin: 'auto',
  freshness,
  reasons: [],
  checkedAt: null,
  checking: false,
  trackChangedAt: null,
  newestSourceAt: null,
  lastChanged: null,
  pickupTrackGuid: '',
  pickupTrackName: '',
  pickupsScannedAt: null,
  pickupsChanged: false,
});

const SYNC_ROWS: ChapterSyncChapter[] = [
  sync('c1', 'current'),
  sync('c2', 'current'),
  sync('c3', 'stale'),
  sync('c4', 'never'),
  sync('c5', 'never'),
  sync('ref', 'never'),
];
const NARRATION_IDS: ReadonlySet<string> = new Set(['c1', 'c2', 'c3', 'c4', 'c5']);
export const COUNTS = checkCounts(SYNC_ROWS, NARRATION_IDS);
export const nameOf = (id: string): string => `Chapter ${id.replace(/\D/g, '')}`;
