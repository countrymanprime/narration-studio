import type { ChapterStatus, ManuscriptContentKind } from '../../api/contracts/manuscript';
import type { ProductionMilestone } from '../../api/contracts/production';
import { addDays, diffDays, fmtD, parseIso } from './dates';
import { PACE, PICKUP_HOURS, RATIO, WARN_DAYS, WPH } from './estimates';
import { CHECKPOINT_MEASURE, chaptersOf, measOf, minutesOf } from './measures';

/** A chapter as the estimates see it: its words and the stage it is in. Only real progress goes in (ADR 0015); a stage in progress is not yet done. */
export type ScheduleChapter = { words: number; status: ChapterStatus; kind: ManuscriptContentKind | '' };

/** The chapters that are narrated: a reference chapter is not recorded, so it is no work. */
export function scheduleChapters(
  chapters: readonly { status: ChapterStatus; wordCount: number; contentKind: ManuscriptContentKind | '' }[],
): ScheduleChapter[] {
  return chapters.filter((c) => c.contentKind !== 'reference').map((c) => ({ words: c.wordCount, status: c.status, kind: c.contentKind }));
}

const STAGE_ORDER: readonly ChapterStatus[] = ['not_started', 'recording', 'editing', 'proofing', 'finalized'];
/** The first status at which a stage is done. */
const DONE_AT = { rec: 'editing', edit: 'proofing', proof: 'finalized' } as const;
const stageDone = (c: ScheduleChapter, stage: keyof typeof DONE_AT): boolean => STAGE_ORDER.indexOf(c.status) >= STAGE_ORDER.indexOf(DONE_AT[stage]);

export type Verdict = 'ok' | 'tight' | 'behind';
export type Tone = 'neutral' | 'warn' | 'danger' | 'success';

export type Calc = {
  /** Words of every narrated chapter. */
  words: number;
  /** Work-hours left, in total and per stage, and for the open pickups. */
  recLeft: number;
  editLeft: number;
  proofLeft: number;
  pickH: number;
  remain: number;
  /** Days of work left at the daily pace, and the day it finishes if the work starts today. */
  days: number;
  finish: Date;
  /** Whole days to the due date, negative once passed; null until a due date is set. */
  daysLeft: number | null;
  /** Days of slack: the days left less the days of work. */
  slack: number | null;
  /** ok at 3 days of slack or more, tight from 0 to under 3, behind below 0; null until a due date is set. */
  verdict: Verdict | null;
  /** Work-hours a day the due date needs. */
  reqPace: number;
  /** Every chapter is finalized (and there is one). */
  finished: boolean;
};

/** The work left and what it means for the due date, from the fixed inputs (ADR 0801 decision 2). `wph` is the words per finished hour of the chosen schedule basis; it defaults to the standard. */
export function calc(chapters: readonly ScheduleChapter[], today: Date, due: Date | null, openPickups = 0, wph: number = WPH): Calc {
  const words = chapters.reduce((a, c) => a + c.words, 0);
  const left = (stage: keyof typeof DONE_AT): number => (chapters.filter((c) => !stageDone(c, stage)).reduce((a, c) => a + c.words, 0) / wph) * RATIO[stage];
  const recLeft = left('rec');
  const editLeft = left('edit');
  const proofLeft = left('proof');
  const pickH = openPickups * PICKUP_HOURS;
  const remain = recLeft + editLeft + proofLeft + pickH;
  const days = remain / PACE;
  const daysLeft = due ? diffDays(due, today) : null;
  const slack = daysLeft === null ? null : daysLeft - days;
  const verdict = slack === null ? null : slack >= 3 ? 'ok' : slack >= 0 ? 'tight' : 'behind';
  return {
    words,
    recLeft,
    editLeft,
    proofLeft,
    pickH,
    remain,
    days,
    finish: addDays(today, Math.ceil(days)),
    daysLeft,
    slack,
    verdict,
    reqPace: daysLeft !== null && daysLeft > 0 ? remain / daysLeft : Infinity,
    finished: chapters.length > 0 && chapters.every((c) => c.status === 'finalized'),
  };
}

/**
 * How the due date reads (ADR 0801 decisions 3 and 4). The days left set it: neutral beyond a week, a warning within a week while
 * unfinished, danger once past, success when finished. The projection can only make it worse, and only when there is work left.
 */
export function deadlineTone(k: Calc): Tone {
  if (k.finished) return 'success';
  if (k.daysLeft === null) return 'neutral';
  let tone: Tone = k.daysLeft < 0 ? 'danger' : k.daysLeft <= WARN_DAYS ? 'warn' : 'neutral';
  if (k.remain > 0) {
    if (k.verdict === 'behind') tone = 'danger';
    else if (k.verdict === 'tight' && tone === 'neutral') tone = 'warn';
  }
  return tone;
}

/** Work-hours left to reach a milestone's measure. */
export function remainFor(chapters: readonly ScheduleChapter[], stored: string): number {
  const stagesLeft = (c: ScheduleChapter, stages: readonly (keyof typeof DONE_AT)[]): number =>
    stages.reduce((a, s) => a + (stageDone(c, s) ? 0 : (c.words / WPH) * RATIO[s]), 0);
  const measure = measOf(stored);
  if (measure === 'minN' || stored === CHECKPOINT_MEASURE) {
    // The first N finished minutes of the book, in reading order: each chapter in the window counts for the share of it that falls inside.
    let words = (minutesOf(stored) / 60) * WPH;
    let hours = 0;
    for (const c of chapters) {
      if (words <= 0) break;
      if (!c.words) continue;
      hours += Math.min(1, words / c.words) * stagesLeft(c, ['rec', 'edit', 'proof']);
      words -= c.words;
    }
    return hours;
  }
  if (measure === 'chN') {
    // The opening, then the first N numbered chapters.
    const n = chaptersOf(stored);
    let numbered = 0;
    return chapters.reduce((a, c) => {
      if (c.kind === 'narration') numbered += 1;
      return c.kind === 'opening' || numbered <= n ? a + stagesLeft(c, ['edit', 'proof']) : a;
    }, 0);
  }
  const stages: Record<string, readonly (keyof typeof DONE_AT)[]> = {
    rec: ['rec'],
    edit: ['edit'],
    proof: ['proof'],
    editproof: ['edit', 'proof'],
    all: ['rec', 'edit', 'proof'],
  };
  return chapters.reduce((a, c) => a + stagesLeft(c, stages[measure] ?? []), 0);
}

export type MilestoneStatus = {
  kind: 'done' | 'none' | 'late' | 'risk' | 'ok';
  /** The full sentence, the cell's name and its tooltip. */
  sentence: string;
  /** What the cell shows: a check for done, a dash for no estimate, "+3 d" for late, or the estimated date. */
  short: string;
};

/** Whether the pace reaches a milestone's measure by its date. A done milestone is done; a custom one is not estimated. */
export function milestoneStatus(
  m: Pick<ProductionMilestone, 'dueDate' | 'measure' | 'done'>,
  chapters: readonly ScheduleChapter[],
  today: Date,
): MilestoneStatus {
  if (m.done) return { kind: 'done', sentence: 'Done', short: '✓' };
  if (measOf(m.measure) === 'custom') return { kind: 'none', sentence: 'Not estimated', short: '—' };
  const projected = addDays(today, Math.ceil(remainFor(chapters, m.measure ?? '') / PACE));
  const est = fmtD(projected);
  const late = diffDays(projected, parseIso(m.dueDate));
  if (late > 0) return { kind: 'late', sentence: `Late by ${late} d (est. ${est})`, short: `+${late} d` };
  if (late >= -1) return { kind: 'risk', sentence: `At risk (est. ${est})`, short: est };
  return { kind: 'ok', sentence: `On track (est. ${est})`, short: est };
}
