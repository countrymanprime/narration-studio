// The rows of Master & QC's per-file checks, drawn from what the host measured and judged: a cell is a
// measured value or a dash, and a check row exists only for a rule the host answered `met` or `not_met`. A rule it did not
// measure (`not_measurable`, `not_checked`, `off`) has no row here, and no value is made up for it.
import { chapterName } from '../../../chapterName';
import type { DeliveryProfile, DeliveryRule, DeliveryRuleResult, ManuscriptChapter, MeasureFileResult, MeasureReport } from '../../../types';
import { chapterOfFile, fileOf } from '../../master/chapterFile';
import { formatLength, formatLevel } from '../../master/deliveryFormat';
import { formatBound, formatRuleValue } from '../../master/deliveryProfile';
import { fileVerdict, type FileVerdict } from '../../master/fileVerdict';

/** One value in a cell: its text (a dash when it could not be measured) and whether the profile's rule on it was not met. */
export type Cell = { text: string; missed: boolean };

type CheckRow = { ruleId: string; label: string; passed: boolean; value: string; limit: string };

export type FileRow = {
  /** The file's path, which the host keys its results by. */
  id: string;
  name: string;
  verdict: FileVerdict;
  /** Set for a file with no measurements: what it waits on, or why it will not have any. */
  waiting?: string;
  /** True for a row with no file at all (a chapter nothing was rendered for): there is nothing to play or open. */
  noFile?: true;
  /** What the Result column says for a file with no measurements. */
  waitingPill?: string;
  /** The cells of a measured file. */
  length?: string;
  rms?: Cell;
  peak?: Cell;
  noiseFloor?: Cell;
  head?: Cell;
  tail?: Cell;
  checks: CheckRow[];
};

const DASH = '—';

/** The retail sample is a file of its own, not a chapter's (the package checks name it the same way). */
const isSampleFile = (file: MeasureFileResult): boolean => /sample/i.test(file.name);

/**
 * The files named the way the manuscript names them: a chapter's file by its chapter's name (`chapterName`), the retail sample
 * "Retail sample", and a file that matches no chapter by its own file name. Only `name` changes; a file stays keyed by its path.
 */
export function labelFiles(files: readonly MeasureFileResult[], chapters: readonly ManuscriptChapter[]): MeasureFileResult[] {
  return files.map((file) => {
    if (isSampleFile(file)) return { ...file, name: 'Retail sample' };
    const chapter = chapterOfFile(file, chapters);
    return chapter ? { ...file, name: chapterName(chapter) } : file;
  });
}

function waitingText(file: MeasureFileResult): { text: string; pill: string } {
  switch (file.status) {
    case 'pending':
      return { text: 'Waiting to be measured', pill: 'Waiting' };
    case 'measuring':
      return { text: 'Being measured now', pill: 'Waiting' };
    case 'cancelled':
      return { text: 'The measurement was cancelled', pill: 'Not measured' };
    default:
      return { text: `Could not be measured: ${file.error ?? 'the file could not be read.'}`.replace(/\.$/, ''), pill: 'Not measured' };
  }
}

/** The host's result for the profile's file rule on any of `metrics`. */
function resultFor(file: MeasureFileResult, profile: DeliveryProfile, metrics: readonly string[]): DeliveryRuleResult | undefined {
  const rule = profile.rules.find((candidate) => candidate.scope === 'file' && metrics.includes(candidate.metric));
  return rule ? file.rules.find((result) => result.ruleId === rule.id) : undefined;
}

function cell(value: number | null, result: DeliveryRuleResult | undefined, format: (n: number) => string): Cell {
  return { text: value === null ? DASH : format(value), missed: value !== null && result?.status === 'not_met' };
}

function checkRows(file: MeasureFileResult, profile: DeliveryProfile): CheckRow[] {
  return file.rules.flatMap((result) => {
    if (result.status !== 'met' && result.status !== 'not_met') return [];
    const rule: DeliveryRule | undefined = profile.rules.find((candidate) => candidate.id === result.ruleId);
    if (!rule) return [];
    const value =
      result.value === null
        ? DASH
        : `${formatRuleValue(rule, result.value)}${rule.unit && rule.metric !== 'duration_seconds' && rule.metric !== 'sample_rate' && rule.metric !== 'channels' ? ` ${rule.unit}` : ''}`;
    return [{ ruleId: rule.id, label: rule.label, passed: result.status === 'met', value, limit: formatBound(rule) }];
  });
}

/**
 * The Peak column shows the figure the profile's rule judges: the true peak when the rule is on it, else the sample peak (ACX's rule is on
 * the sample peak). Showing the other one drew a file over the limit as a Pass.
 */
function peakCell(report: MeasureReport, file: MeasureFileResult, profile: DeliveryProfile): Cell {
  const rule = profile.rules.find((candidate) => candidate.scope === 'file' && ['true_peak_dbtp', 'sample_peak_dbfs'].includes(candidate.metric));
  const sample = rule?.metric === 'sample_peak_dbfs';
  return cell(sample ? report.sample_peak_dbfs : report.true_peak_dbtp, resultFor(file, profile, ['true_peak_dbtp', 'sample_peak_dbfs']), formatLevel);
}

function measuredRow(file: MeasureFileResult, profile: DeliveryProfile, report: MeasureReport): FileRow {
  return {
    id: file.path,
    name: file.name,
    verdict: fileVerdict(file),
    length: formatLength(report.duration_seconds),
    rms: cell(report.rms_dbfs, resultFor(file, profile, ['rms_dbfs']), formatLevel),
    peak: peakCell(report, file, profile),
    noiseFloor: cell(report.noise_floor_dbfs, resultFor(file, profile, ['noise_floor_dbfs']), formatLevel),
    head: cell(report.head_room_tone_seconds, resultFor(file, profile, ['head_room_tone_seconds']), (n) => n.toFixed(1)),
    tail: cell(report.tail_room_tone_seconds, resultFor(file, profile, ['tail_room_tone_seconds']), (n) => n.toFixed(1)),
    checks: checkRows(file, profile),
  };
}

function rowOf(file: MeasureFileResult, profile: DeliveryProfile, name = file.name): FileRow {
  if (file.status === 'measured' && file.report) return { ...measuredRow(file, profile, file.report), name };
  const waiting = waitingText(file);
  return { id: file.path, name, verdict: 'none', waiting: waiting.text, waitingPill: waiting.pill, checks: [] };
}

export function buildRows(files: readonly MeasureFileResult[], profile: DeliveryProfile): FileRow[] {
  return files.map((file) => rowOf(file, profile));
}

/** A chapter (or the opening or closing credits) the table has a row for, whether or not it has a file. */
export type ChapterSlot = Pick<ManuscriptChapter, 'id' | 'title' | 'subtitle' | 'index'>;

/** The id of the retail sample's row when it has no file, so the table can select it. */
export const SAMPLE_ROW_ID = 'retail-sample';

/** What a row with no file waits on: its open pickups when it has any, else only that no file was measured for it. */
function noFileText(open: number | undefined): string {
  return open ? `Waiting on ${open} ${open === 1 ? 'pickup' : 'pickups'}` : 'No file measured yet';
}

/**
 * One row per chapter, the credits and the retail sample, in the manuscript's order, whether or not they have a file (the Studio Next mock's
 * Master page, so the table is never empty): a row with a file is that file's row, named the way the manuscript names the chapter, and one
 * without says what it waits on ("Waiting on 3 pickups · not mastered") with the neutral Waiting pill. `openPickups` counts the open pickups
 * by chapter id, from the Pickups page's own list; with none (not read yet) nothing is said about pickups. A measured file no row claims keeps
 * its own file name after them, so it still counts. A fileless row is keyed by its chapter's id, which the shared chapter selects.
 */
export function buildChapterRows(
  files: readonly MeasureFileResult[],
  profile: DeliveryProfile,
  slots: readonly ChapterSlot[],
  openPickups?: Readonly<Record<string, number>>,
): FileRow[] {
  const claimed = new Set<string>();
  const waitingRow = (id: string, name: string, open?: number): FileRow => ({
    id,
    name,
    verdict: 'none',
    waiting: noFileText(open),
    waitingPill: 'Waiting',
    noFile: true,
    checks: [],
  });
  const rows = slots.map((slot) => {
    const file = fileOf(
      slot,
      files.filter((candidate) => !isSampleFile(candidate)),
    );
    const name = chapterName(slot);
    if (!file) return waitingRow(slot.id, name, openPickups?.[slot.id]);
    claimed.add(file.path);
    return rowOf(file, profile, name);
  });
  const sample = files.find(isSampleFile);
  if (sample) claimed.add(sample.path);
  const strays = files.filter((file) => !claimed.has(file.path)).map((file) => rowOf(file, profile));
  return [...rows, ...strays, sample ? rowOf(sample, profile, 'Retail sample') : waitingRow(SAMPLE_ROW_ID, 'Retail sample')];
}

/** The file the table opens on: the first that fails, else the first with a file. Nothing before a file exists: no waiting row is picked for the narrator. */
export function openingId(rows: readonly FileRow[]): string | undefined {
  return (rows.find((row) => row.verdict === 'fail') ?? rows.find((row) => !row.noFile))?.id;
}
