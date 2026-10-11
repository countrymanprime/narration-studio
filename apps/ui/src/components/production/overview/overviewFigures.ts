// The Production page's figures as pure functions of the plan, the overview and what the host measured (ADR 0015, ADR 0801).
// Each returns a value or the reason there is none; a component prints it and computes nothing.
import type { ChapterStatus } from '../../../api/contracts/manuscript';
import type { ProductionChapter } from '../../../api/contracts/production';
import type { Measured } from '../../../api/schemas/base';
import { fmtD, hm } from '../../schedule/dates';
import { RATIO } from '../../schedule/estimates';
import { deadlineTone, scheduleChapters, type Calc, type Tone } from '../../schedule/progress';
import type { ChapterSyncChapter } from '../../../api/contracts/chapterSync';

/** The page a figure goes to. The components import no router; the page maps this to a route. */
export type OverviewTarget = 'script' | 'booth' | 'editing' | 'pickups' | 'master' | 'schedule';

/** The text for a figure with no source. */
export const NOT_MEASURED = 'Not measured yet';

/** The tone as a word and a shape beside its colour, so the due date is never told by colour alone. */
const TONE_MARK: Record<Tone, { glyph: string; word: string } | null> = {
  neutral: null,
  success: { glyph: '✓', word: 'finished' },
  warn: { glyph: '!', word: 'tight' },
  danger: { glyph: '✕', word: 'behind' },
};

export type KpiTile = {
  key: string;
  target: OverviewTarget;
  label: string;
  value: string;
  unit?: string;
  hint: string;
  /** The tooltip: the ratio behind an estimate, or what the figure counts. */
  tip: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
};

/** What the delivery review found per chapter; absent where the host has no chapter-level source. */
export type DeliveryCounts = { pass: number; fail: number; total: number };

export type KpiInputs = {
  /** The estimates over the narrated chapters (`calc`). */
  k: Calc;
  /** Words per finished hour of the chosen basis. */
  wph: number;
  /** Seconds of finished audio measured over the book (the overview's totals). */
  recordedSeconds: number;
  due: Date | null;
  openPickups: number;
  /** Minutes in the booth to redo the pickups. */
  pickupMinutes: Measured<number>;
  delivery: Measured<DeliveryCounts>;
};

const TONE_TILE: Record<Tone, KpiTile['tone']> = { neutral: 'neutral', success: 'success', warn: 'warning', danger: 'danger' };
const days = (n: number): string => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'day' : 'days'}`;

/** The six KPI tiles of the mock's Production page. */
export function kpiTiles({ k, wph, recordedSeconds, due, openPickups, pickupMinutes, delivery }: KpiInputs): KpiTile[] {
  const finished = k.words / wph;
  const tone = deadlineTone(k);
  const mark = TONE_MARK[tone];
  const verdictWord = k.finished ? 'finished' : k.verdict === 'ok' ? 'on track' : k.verdict === 'tight' ? 'tight' : 'behind';
  const dueTile: KpiTile =
    due && k.daysLeft !== null
      ? {
          key: 'due',
          target: 'schedule',
          label: 'Due',
          value: fmtD(due),
          hint: `${days(k.daysLeft)}${k.daysLeft < 0 ? ' past' : ''} · ${mark ? `${mark.glyph} ` : ''}${verdictWord}`,
          tip: 'The delivery date, and what the pace says about reaching it',
          tone: TONE_TILE[tone],
        }
      : { key: 'due', target: 'schedule', label: 'Due', value: 'Set a due date', hint: 'on the Schedule', tip: 'No delivery date is set yet', tone: 'neutral' };
  return [
    {
      key: 'finished',
      target: 'script',
      label: 'Finished audio',
      value: hm(recordedSeconds / 3600),
      unit: `/ ${hm(finished)}`,
      hint: 'recorded',
      tip: 'Recorded so far, out of the whole book (estimate)',
      tone: 'neutral',
    },
    {
      key: 'recording',
      target: 'booth',
      label: 'Recording',
      value: hm(k.recLeft),
      unit: 'left',
      hint: `of ${hm(finished * RATIO.rec)} est.`,
      tip: `Estimated ${RATIO.rec.toFixed(1)}× the finished hours`,
      tone: 'neutral',
    },
    {
      key: 'editing',
      target: 'editing',
      label: 'Editing + proof',
      value: hm(k.editLeft + k.proofLeft),
      unit: 'left',
      hint: `of ${hm(finished * (RATIO.edit + RATIO.proof))} est.`,
      tip: `Estimated ${(RATIO.edit + RATIO.proof).toFixed(2)}× the finished hours`,
      tone: 'neutral',
    },
    {
      key: 'pickups',
      target: 'pickups',
      label: 'Open pickups',
      value: String(openPickups),
      hint: pickupMinutes.ok ? `about ${pickupMinutes.value} min` : 'not measured yet',
      tip: 'Time in the booth',
      tone: 'neutral',
    },
    delivery.ok
      ? {
          key: 'delivery',
          target: 'master',
          label: 'Delivery check',
          value: String(delivery.value.pass),
          unit: `/ ${delivery.value.total}`,
          hint: `${delivery.value.fail} fail · ${delivery.value.total - delivery.value.pass - delivery.value.fail} unchecked`,
          tip: 'Chapters that pass ACX, fail, or have not been checked',
          tone: 'neutral',
        }
      : { key: 'delivery', target: 'master', label: 'Delivery check', value: '—', hint: NOT_MEASURED, tip: delivery.reason, tone: 'neutral' },
    dueTile,
  ];
}

export type StageSegment = { key: 'proofed' | 'edited' | 'recorded' | 'unrecorded'; label: string; words: number; hours: number; percent: number };

/**
 * The stage bar's segments, by the finished hours at each stage, from each chapter's status. "Delivered" has no chapter-level source
 * (the audit's pipeline table), so it is left out rather than estimated. The percents sum to 100 over the narrated words, or the bar is empty.
 */
export function stageSegments(chapters: readonly ProductionChapter[], wph: number): StageSegment[] {
  const narrated = scheduleChapters(chapters);
  const total = narrated.reduce((a, c) => a + c.words, 0);
  const at = (status: ChapterStatus): number => narrated.filter((c) => c.status === status).reduce((a, c) => a + c.words, 0);
  const proofed = at('finalized');
  const edited = at('proofing');
  const recorded = at('editing');
  const parts: Array<[StageSegment['key'], string, number]> = [
    ['proofed', 'Proofed', proofed],
    ['edited', 'Edited', edited],
    ['recorded', 'Recorded', recorded],
    ['unrecorded', 'Not recorded yet', total - proofed - edited - recorded],
  ];
  return parts.map(([key, label, words]) => ({ key, label, words, hours: words / wph, percent: total > 0 ? (words / total) * 100 : 0 }));
}

export type CheckCounts = {
  current: string[];
  stale: string[];
  never: string[];
};

/** The narration chapters' recording-check freshness without a click: the ids in each state. A sync row for a chapter that is not narrated is not counted. */
export function checkCounts(sync: readonly ChapterSyncChapter[], narrationIds: ReadonlySet<string>): CheckCounts {
  const rows = sync.filter((c) => narrationIds.has(c.chapterId));
  const ids = (freshness: ChapterSyncChapter['freshness']): string[] => rows.filter((c) => c.freshness === freshness).map((c) => c.chapterId);
  return { current: ids('current'), stale: ids('stale'), never: ids('never') };
}
