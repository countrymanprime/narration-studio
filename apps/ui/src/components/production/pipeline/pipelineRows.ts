import type { ChapterStatus } from '../../../api/contracts/manuscript';
import type { ProductionChapter } from '../../../api/contracts/production';
import { chapterName } from '../../../chapterName';
import { hm } from '../../schedule/dates';
import { WPH } from '../../schedule/estimates';
import { chapterCheckStatusText, type ChapterCheckStatus } from '../chapterCheckStatus';

/** The page a cell goes to (the mock's `cellAct`): Prep goes to the Script, Record to the Booth, Edit to Editing, Master and QC to Master. */
export type GoTarget = 'script' | 'booth' | 'editing' | 'proof' | 'pickups' | 'master';
export type PipelineColumn = 'prep' | 'record' | 'edit' | 'proof' | 'pickups' | 'master' | 'qc';
/** `done` is a tick, `progress` a percent or an in-progress mark, `open` something that needs the narrator, `none` a dash. */
export type CellKind = 'done' | 'progress' | 'open' | 'none';

export type PipelineCell = {
  column: PipelineColumn;
  target: GoTarget;
  kind: CellKind;
  /** What the cell draws: a tick, a percent, a count, PASS or a dash. A mark that is a shape as well as a colour. */
  text: string;
  /** The state in words, the end of the accessible name ("<chapter>: <stage> <state>"). */
  state: string;
  /** The tooltip: the figure behind the cell, and for Record the recording check's freshness. */
  tip: string;
  /** False for a cell with nowhere to go yet (Pickups before the chapter is fully recorded): the mock draws it as plain text. */
  go: boolean;
};

export type PipelineRow = {
  id: string;
  name: string;
  /** The estimated finished length of the chapter at the planning rate, or a dash. */
  finished: string;
  /** The column of the stage the chapter is in: the readiness chip sits on it. */
  current: PipelineColumn;
  cells: Record<PipelineColumn, PipelineCell>;
};

export const COLUMN_LABEL: Record<PipelineColumn, string> = {
  prep: 'Prep',
  record: 'Record',
  edit: 'Edit',
  proof: 'Proof',
  pickups: 'Pickups',
  master: 'Master',
  qc: 'QC',
};

/** The sources a chapter-level cell can read. A source that is absent, or has no entry for a chapter, leaves its cell "Not measured yet" (ADR 0015). */
export type PipelineSources = {
  /** `chapterCheckStatus` per chapter: the recording check's freshness, read without a click. */
  checks?: Readonly<Record<string, ChapterCheckStatus>>;
  /** Notes cleared and notes in all per chapter (SN-Q2's counters). A chapter with no entry, or none in all, has no notes. */
  proof?: Readonly<Record<string, { cleared: number; total: number }>>;
  /** Prep per chapter, from the prep completeness summary. */
  prep?: Readonly<Record<string, 'prepped' | 'progress' | 'none'>>;
  /** Open pickups per chapter. Only the pickup source the swap names can fill it; the project-wide count cannot. */
  pickups?: Readonly<Record<string, number>>;
  /** The delivery review per chapter: whether it is mastered and the QC verdict ("PASS" or the failing verdict). */
  master?: Readonly<Record<string, { mastered: boolean; qc: string | null }>>;
};

export const NOT_MEASURED = 'Not measured yet';
const DASH = '—';
const TICK = '✓';
const UNDER_WAY = '◐';

const ORDER: readonly ChapterStatus[] = ['not_started', 'recording', 'editing', 'proofing', 'finalized'];
const past = (status: ChapterStatus, at: ChapterStatus): boolean => ORDER.indexOf(status) >= ORDER.indexOf(at);

const cell = (column: PipelineColumn, target: GoTarget, kind: CellKind, text: string, state: string, tip: string, go = true): PipelineCell => ({
  column,
  target,
  kind,
  text,
  state,
  tip,
  go,
});

const notStarted = (column: PipelineColumn, target: GoTarget): PipelineCell => cell(column, target, 'none', DASH, 'not started', 'Not started');
const done = (column: PipelineColumn, target: GoTarget, tip: string): PipelineCell => cell(column, target, 'done', TICK, 'done', tip);
const underWay = (column: PipelineColumn, target: GoTarget, tip: string): PipelineCell => cell(column, target, 'progress', UNDER_WAY, 'in progress', tip);
const unknown = (column: PipelineColumn, target: GoTarget, go = true): PipelineCell => cell(column, target, 'none', DASH, 'not measured yet', NOT_MEASURED, go);

const clockOf = (seconds: number): string => hm(seconds / 3600);

function recordCell(chapter: ProductionChapter, check: ChapterCheckStatus | undefined): PipelineCell {
  const status = check ? chapterCheckStatusText(chapterName(chapter), check) : undefined;
  const checkLine = status ? `Recording check: ${status.label}${status.detail ? ` · ${status.detail}` : ''}` : '';
  const withCheck = (tip: string): string => (checkLine ? `${tip} · ${checkLine}` : tip);
  const length = chapter.recordedSeconds !== null ? `${clockOf(chapter.recordedSeconds)} recorded` : '';
  if (past(chapter.status, 'editing')) return done('record', 'booth', withCheck(length ? `Recorded · ${length}` : 'Recorded'));
  if (chapter.status === 'recording') {
    const finished = (chapter.wordCount / WPH) * 3600;
    // A percent only from a measured length against the chapter's finished length; never one made up.
    if (chapter.recordedSeconds !== null && finished > 0) {
      const percent = Math.min(99, Math.max(1, Math.floor((chapter.recordedSeconds / finished) * 100)));
      return cell(
        'record',
        'booth',
        'progress',
        `${percent}%`,
        `${percent}% recorded`,
        withCheck(`${percent}% recorded · ${length} of about ${clockOf(finished)}`),
      );
    }
    return underWay('record', 'booth', withCheck('Recording in progress'));
  }
  return { ...notStarted('record', 'booth'), tip: withCheck('Not started') };
}

function editCell(chapter: ProductionChapter): PipelineCell {
  if (past(chapter.status, 'proofing')) return done('edit', 'editing', 'Edited');
  if (chapter.status === 'editing') return underWay('edit', 'editing', 'Editing in progress');
  return notStarted('edit', 'editing');
}

function proofCell(chapter: ProductionChapter, notes: { cleared: number; total: number } | undefined): PipelineCell {
  const total = notes?.total ?? 0;
  const counted = notes && total > 0 ? `${notes.cleared} of ${total} notes cleared` : '';
  if (chapter.status === 'finalized') return done('proof', 'proof', counted || 'Proofed');
  if (notes && total > 0) {
    const percent = Math.floor((notes.cleared / total) * 100);
    return notes.cleared >= total ? done('proof', 'proof', counted) : cell('proof', 'proof', 'progress', `${percent}%`, counted, counted);
  }
  return notStarted('proof', 'proof');
}

function prepCell(prep: 'prepped' | 'progress' | 'none' | undefined): PipelineCell {
  if (prep === 'prepped') return done('prep', 'script', 'Prepped');
  if (prep === 'progress') return underWay('prep', 'script', 'Prep in progress');
  if (prep === 'none') return notStarted('prep', 'script');
  return unknown('prep', 'script');
}

function pickupsCell(chapter: ProductionChapter, open: number | undefined): PipelineCell {
  // Pickups wait for a chapter recorded to the end: until then nothing is left to pick up.
  if (!past(chapter.status, 'editing')) return cell('pickups', 'pickups', 'none', DASH, 'waiting for the recording', 'Waits for the full recording', false);
  if (open === undefined) return cell('pickups', 'pickups', 'none', DASH, 'not measured yet', 'Pickups are counted for the whole project');
  if (open === 0) return done('pickups', 'pickups', 'No open pickups');
  return cell('pickups', 'pickups', 'open', String(open), `${open} open`, `${open} open pickups`);
}

function masterCell(review: { mastered: boolean; qc: string | null } | undefined): PipelineCell {
  if (!review) return unknown('master', 'master');
  return review.mastered ? done('master', 'master', 'Mastered') : cell('master', 'master', 'none', DASH, 'not mastered', 'Not mastered');
}

function qcCell(review: { mastered: boolean; qc: string | null } | undefined): PipelineCell {
  if (!review) return unknown('qc', 'master');
  if (review.qc === 'PASS') return cell('qc', 'master', 'done', 'PASS', 'passes', 'Passes the delivery check');
  if (review.qc) return cell('qc', 'master', 'open', review.qc, `fails: ${review.qc}`, `Fails the delivery check: ${review.qc}`);
  return cell('qc', 'master', 'none', DASH, 'not checked', 'Not checked');
}

/** The column of the stage a chapter is in; a proofed chapter with open pickups is at the Pickups column. */
export function currentColumn(status: ChapterStatus, openPickups = 0): PipelineColumn {
  if (status === 'not_started') return 'prep';
  if (status === 'recording') return 'record';
  if (status === 'editing') return 'edit';
  if (status === 'proofing') return openPickups > 0 ? 'pickups' : 'proof';
  return 'qc';
}

/** One row per chapter of the overview, each cell drawn from the field that measures it and a dash where nothing does. */
export function buildPipelineRows(chapters: readonly ProductionChapter[], sources: PipelineSources = {}): PipelineRow[] {
  return chapters.map((chapter) => {
    const open = sources.pickups?.[chapter.id];
    const review = sources.master?.[chapter.id];
    const cells: Record<PipelineColumn, PipelineCell> = {
      prep: prepCell(sources.prep?.[chapter.id]),
      record: recordCell(chapter, sources.checks?.[chapter.id]),
      edit: editCell(chapter),
      proof: proofCell(chapter, sources.proof?.[chapter.id]),
      pickups: pickupsCell(chapter, open),
      master: masterCell(review),
      qc: qcCell(review),
    };
    return {
      id: chapter.id,
      name: chapterName(chapter),
      finished: chapter.wordCount > 0 ? hm(chapter.wordCount / WPH) : DASH,
      current: currentColumn(chapter.status, open),
      cells,
    };
  });
}

/** The accessible name of a cell: "<chapter>: <stage> <state>". */
export const cellName = (rowName: string, c: PipelineCell): string => `${rowName}: ${COLUMN_LABEL[c.column]} ${c.state}`;
