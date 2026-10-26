// The Production page's figures as pure functions of the plan, the overview and what the host measured.
// Each returns a value or the reason there is none; a component prints it and computes nothing.
import type { ChapterStatus } from '../../../api/contracts/manuscript';
import type { ProductionChapter } from '../../../api/contracts/production';
import type { Measured } from '../../../api/schemas/base';
import { fmtD, hm } from '../../schedule/dates';
import { RATIO } from '../../schedule/estimates';
import { statusTone } from '../../../kinds/statusTone';
import { deadlineTone, TONE_STATUS, type Calc, type Tone } from '../../schedule/progress';
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

/**
 * The book's pass and fail count from the chapters' QC verdicts: `PASS` passes, any other verdict fails, a chapter with no verdict is unchecked.
 * Not measured while no narrated chapter has a review.
 */
export function deliveryCounts(
  narrationIds: readonly string[],
  master: Readonly<Record<string, { mastered: boolean; qc: string | null }>> | undefined,
): Measured<DeliveryCounts> {
  const verdicts = narrationIds.flatMap((id) => (master?.[id] ? [master[id].qc] : []));
  if (!verdicts.length) return { ok: false, reason: 'No chapter has a delivery check yet.' };
  const pass = verdicts.filter((qc) => qc === 'PASS').length;
  const fail = verdicts.filter((qc) => qc !== null && qc !== 'PASS').length;
  return { ok: true, value: { pass, fail, total: narrationIds.length } };
}

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

// The tile tones the due date can take, each the tone of its registry status (schedule/progress.ts `TONE_STATUS`).
const tileTone = (tone: Tone): KpiTile['tone'] => statusTone(TONE_STATUS[tone]) as KpiTile['tone'];
const TONE_TILE: Record<Tone, KpiTile['tone']> = {
  neutral: tileTone('neutral'),
  success: tileTone('success'),
  warn: tileTone('warn'),
  danger: tileTone('danger'),
};
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
      : // A short value, as every other tile has: a phrase in the 30 px value font wraps to two lines in a tile of the six-wide row.
        { key: 'due', target: 'schedule', label: 'Due', value: 'Not set', hint: 'Set it on the Schedule', tip: 'No delivery date is set yet', tone: 'neutral' };
  return [
    {
      key: 'recorded',
      target: 'script',
      // Raw audio on the chapters' linked tracks: nothing here knows whether it is edited, proofed or mastered, so it is not "finished".
      label: 'Recorded audio',
      value: hm(recordedSeconds / 3600),
      unit: `/ ${hm(finished)}`,
      hint: 'before editing',
      tip: 'Audio on the chapters’ linked tracks in the saved project, before editing, out of the whole book’s estimated finished length',
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

export type StageSegment = {
  key: 'delivered' | 'proofed' | 'edited' | 'recorded' | 'unrecorded';
  label: string;
  words: number;
  hours: number;
  percent: number;
};

/** The stages a status has finished, as a share of the chapter: a stage is done from the status after it. */
const DONE_SHARE: Record<ChapterStatus, { rec: number; edit: number; proof: number }> = {
  not_started: { rec: 0, edit: 0, proof: 0 },
  recording: { rec: 0, edit: 0, proof: 0 },
  editing: { rec: 1, edit: 0, proof: 0 },
  proofing: { rec: 1, edit: 1, proof: 0 },
  finalized: { rec: 1, edit: 1, proof: 1 },
};

/**
 * The stage bar's segments (the mock's five), each chapter's words weighted by how far that chapter is: Delivered where the delivery review
 * has mastered it, Proofed, Edited and Recorded from its status, and a chapter still `recording` counts for the share of its finished audio
 * measured so far. A later stage never counts for less than an earlier one, so the segments are the gaps between the running totals and
 * sum to 100 over the narrated words, or the bar is empty.
 */
export function stageSegments(chapters: readonly ProductionChapter[], wph: number, master?: Readonly<Record<string, { mastered: boolean }>>): StageSegment[] {
  let total = 0;
  let rw = 0;
  let ew = 0;
  let pw = 0;
  let mw = 0;
  for (const c of chapters) {
    if (c.contentKind === 'reference') continue;
    const done = DONE_SHARE[c.status];
    const measured = c.recordedSeconds !== null && c.wordCount > 0 ? Math.min(1, c.recordedSeconds / ((c.wordCount / wph) * 3600)) : 0;
    const delivered = master?.[c.id]?.mastered ? 1 : 0;
    const proofed = Math.max(delivered, done.proof);
    const edited = Math.max(proofed, done.edit);
    const recorded = Math.max(edited, done.rec, measured);
    total += c.wordCount;
    mw += c.wordCount * delivered;
    pw += c.wordCount * proofed;
    ew += c.wordCount * edited;
    rw += c.wordCount * recorded;
  }
  const parts: Array<[StageSegment['key'], string, number]> = [
    ['delivered', 'Delivered', mw],
    ['proofed', 'Proofed', pw - mw],
    ['edited', 'Edited', ew - pw],
    ['recorded', 'Recorded', rw - ew],
    ['unrecorded', 'Not recorded yet', total - rw],
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
