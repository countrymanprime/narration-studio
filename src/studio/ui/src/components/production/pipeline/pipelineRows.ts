import type { ChapterStatus, RecordedThrough, RecordedUnavailable } from '../../../api/contracts/manuscript';
import type { ProductionChapter } from '../../../api/contracts/production';
import { chapterName, chapterParts } from '../../../chapterName';
import { reached } from '../../../chapterStatus';
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

/** What the row's Rec. column says: the measured length of the chapter's linked track, or why there is none (never a 0 standing in for "unknown"). */
export type RecordedFigure = {
  /** `measured` for a length the host read, `none` for a state word. */
  kind: 'measured' | 'none';
  /** A clock ("1:12"), "<0:01" for under a minute, or a short state ("None yet", "Not linked"). */
  text: string;
  /** The accessible name: "<chapter>: 1:12 recorded of about 1:20 estimated", or the state in words. */
  label: string;
  tip: string;
};

export type PipelineRow = {
  id: string;
  name: string;
  /** The name's two parts, drawn by `TitleSubtitle`; `name` stays the plain text for accessible names. */
  parts: { title: string; subtitle?: string };
  /** What is recorded on the chapter's linked track in the saved project: a measurement, not a stage. */
  recorded: RecordedFigure;
  /** The estimated finished length of the chapter from its words at the planning rate, or a dash. */
  estimate: string;
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

/** The sources a chapter-level cell can read. A source that is absent, or has no entry for a chapter, leaves its cell "Not measured yet". */
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
  /** Words per finished hour of the schedule's basis (`useEffectiveWph`); the standard when absent. */
  wph?: number;
};

export const NOT_MEASURED = 'Not measured yet';
const DASH = '—';
const TICK = '✓';
/** The text of an under-way cell (a stage with no measured percent): the table draws it as a shape, not as this glyph, which many fonts lack. */
export const UNDER_WAY = '◐';

const past = reached;

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

/** Why a chapter has no recorded length, as the Rec. column's word and its tip (`recordedlengths.go`'s reasons). */
const UNAVAILABLE: Record<RecordedUnavailable, { text: string; tip: string }> = {
  unlinked: { text: 'Not linked', tip: 'Not linked to a track, so nothing is measured. Link it from the chapter’s track panel' },
  no_project: { text: 'No project', tip: 'No saved DAW project could be read, so nothing is measured' },
  multiple_tracks: { text: '2+ tracks', tip: 'Linked to more than one track, so nothing is measured. Keep one in the chapter’s track panel' },
  track_missing: { text: 'Track gone', tip: 'The linked track is no longer in the saved project, so nothing is measured' },
};
const NOT_READ = { text: 'Not read', tip: 'The recorded length has not been read' };

/** A recorded length as h:mm; under a minute is "<0:01", so a few seconds of audio never reads as nothing. */
const recordedClock = (seconds: number): string => (seconds > 0 && seconds < 60 ? '<0:01' : clockOf(seconds));

type ThroughWords = { label: string; tip: string };

/**
 * How far the chapter is recorded (`recordedThrough`, the value the Booth resumes at, #2251) in words for a tip and an accessible name:
 * "Recorded through ¶ 12 (38%)" or "Recorded to the end", with "about" for the track-length estimate. A host that sends no paragraph
 * number gets the share alone. The cells draw no extra line for it, so the rows keep their height.
 */
function throughWords(through: RecordedThrough | undefined): ThroughWords | null {
  if (!through) return null;
  const about = through.confident ? '' : 'about ';
  const from = through.confident ? '' : ', from the track’s length';
  if (through.complete) return { label: `recorded ${about}to the end`, tip: `Recorded ${about}to the end${from}` };
  const share = `${through.confident ? '' : '~'}${through.percent}%`;
  if (through.paragraph === undefined) return { label: `recorded through ${about}${through.percent}%`, tip: `Recorded through ${share}${from}` };
  return {
    label: `recorded through ${about}paragraph ${through.paragraph} (${share})`,
    tip: `Recorded through ${about}¶ ${through.paragraph} (${share}${from})`,
  };
}

function recordedFigure(name: string, chapter: ProductionChapter, estimate: string): RecordedFigure {
  const words = throughWords(chapter.recordedThrough);
  const figure = measuredFigure(name, chapter, estimate);
  return words ? { ...figure, label: `${figure.label}, ${words.label}`, tip: `${figure.tip} · ${words.tip}` } : figure;
}

function measuredFigure(name: string, chapter: ProductionChapter, estimate: string): RecordedFigure {
  const seconds = chapter.recordedSeconds;
  const of = estimate === DASH ? ', no estimate' : ` of about ${estimate} estimated`;
  if (seconds !== null && seconds > 0) {
    const text = recordedClock(seconds);
    return {
      kind: 'measured',
      text,
      label: `${name}: ${text} recorded${of}`,
      tip: `${text} recorded${of} · on the linked track in the saved project, before editing`,
    };
  }
  const state =
    seconds === 0
      ? { text: 'None yet', tip: 'Linked to its track, with nothing recorded on it yet' }
      : chapter.recordedUnavailable
        ? UNAVAILABLE[chapter.recordedUnavailable]
        : NOT_READ;
  return { kind: 'none', text: state.text, label: `${name}: recorded ${state.text.toLowerCase()}`, tip: state.tip };
}

function recordCell(chapter: ProductionChapter, check: ChapterCheckStatus | undefined, wph: number): PipelineCell {
  const status = check ? chapterCheckStatusText(chapterName(chapter), check) : undefined;
  const checkLine = status ? `Recording check: ${status.label}${status.detail ? ` · ${status.detail}` : ''}` : '';
  const withCheck = (tip: string): string => (checkLine ? `${tip} · ${checkLine}` : tip);
  const length = chapter.recordedSeconds !== null ? `${clockOf(chapter.recordedSeconds)} recorded` : '';
  if (past(chapter.status, 'editing')) return done('record', 'booth', withCheck(length ? `Recorded · ${length}` : 'Recorded'));
  const through = chapter.recordedThrough;
  const words = throughWords(through);
  if (through && words) {
    // The one value the Booth resumes at, so the board's percent and the Booth's agree.
    const stageNote = chapter.status === 'recording' ? '' : ' · The chapter’s stage is still Not started';
    const percent = through.complete ? 100 : Math.min(99, Math.max(1, through.percent));
    return cell('record', 'booth', 'progress', `${percent}%`, `${percent}% recorded`, withCheck(`${words.tip}${length ? ` · ${length}` : ''}${stageNote}`));
  }
  // Audio on the linked track means recording is under way, even while the chapter's stage still says not started.
  const audio = chapter.recordedSeconds !== null && chapter.recordedSeconds > 0;
  if (chapter.status === 'recording' || audio) {
    const stageNote = chapter.status === 'recording' ? '' : ' · The chapter’s stage is still Not started';
    const finished = (chapter.wordCount / wph) * 3600;
    // A percent only from a measured length against the chapter's finished length; never one made up.
    if (chapter.recordedSeconds !== null && finished > 0) {
      const percent = Math.min(99, Math.max(1, Math.floor((chapter.recordedSeconds / finished) * 100)));
      return cell(
        'record',
        'booth',
        'progress',
        `${percent}%`,
        `${percent}% recorded`,
        withCheck(`${percent}% recorded · ${length} of about ${clockOf(finished)}${stageNote}`),
      );
    }
    return underWay('record', 'booth', withCheck(`Recording in progress${stageNote}`));
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
    return notes.cleared >= total ? done('proof', 'proof', counted) : cell('proof', 'proof', 'progress', `${percent}%`, `${percent}%, ${counted}`, counted);
  }
  return notStarted('proof', 'proof');
}

function prepCell(prep: 'prepped' | 'progress' | 'none' | undefined): PipelineCell {
  if (prep === 'prepped') return done('prep', 'script', 'Prepped');
  if (prep === 'progress') return underWay('prep', 'script', 'Prep in progress');
  if (prep === 'none') return cell('prep', 'script', 'none', DASH, 'not started', 'Prep not started');
  return unknown('prep', 'script');
}

function pickupsCell(chapter: ProductionChapter, open: number | undefined): PipelineCell {
  // Pickups wait for a chapter recorded to the end: until then nothing is left to pick up.
  if (!past(chapter.status, 'editing')) return cell('pickups', 'pickups', 'none', DASH, 'waiting for the recording', 'Waits for the full recording', false);
  if (open === undefined) return cell('pickups', 'pickups', 'none', DASH, 'not measured yet', 'Pickups are counted for the whole project');
  if (open === 0) return cell('pickups', 'pickups', 'done', '0', '0 open', 'No open pickups');
  return cell('pickups', 'pickups', 'open', String(open), `${open} open`, `${open} open pickups`);
}

function masterCell(review: { mastered: boolean; qc: string | null } | undefined): PipelineCell {
  if (!review) return unknown('master', 'master');
  return review.mastered ? done('master', 'master', 'Mastered') : cell('master', 'master', 'none', DASH, 'not mastered', 'Not mastered');
}

function qcCell(review: { mastered: boolean; qc: string | null } | undefined): PipelineCell {
  if (!review) return unknown('qc', 'master');
  if (review.qc === 'PASS') return cell('qc', 'master', 'done', 'PASS', 'PASS', 'Passes the delivery check');
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
  const wph = sources.wph ?? WPH;
  return chapters.map((chapter) => {
    const open = sources.pickups?.[chapter.id];
    const review = sources.master?.[chapter.id];
    const cells: Record<PipelineColumn, PipelineCell> = {
      prep: prepCell(sources.prep?.[chapter.id]),
      record: recordCell(chapter, sources.checks?.[chapter.id], wph),
      edit: editCell(chapter),
      proof: proofCell(chapter, sources.proof?.[chapter.id]),
      pickups: pickupsCell(chapter, open),
      master: masterCell(review),
      qc: qcCell(review),
    };
    const name = chapterName(chapter);
    const estimate = chapter.wordCount > 0 ? hm(chapter.wordCount / wph) : DASH;
    return {
      id: chapter.id,
      name,
      parts: chapterParts(chapter),
      recorded: recordedFigure(name, chapter, estimate),
      estimate,
      current: currentColumn(chapter.status, open),
      cells,
    };
  });
}

/** The accessible name of a cell: "<chapter>: <stage> <state>". */
// A cell's state starts with the text it draws (a count, a percent, PASS), so its name holds that text: axe fails a name that
// leaves out what the button draws.
export const cellName = (rowName: string, c: PipelineCell): string => `${rowName}: ${COLUMN_LABEL[c.column]} ${c.state}`;
