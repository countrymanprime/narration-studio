// The rows of Master & QC's per-file checks, drawn from what the host measured and judged (ADR 0440, ADR 0170): a cell is a
// measured value or a dash, and a check row exists only for a rule the host answered `met` or `not_met`. A rule it did not
// measure (`not_measurable`, `not_checked`, `off`) has no row here, and no value is made up for it.
import type { DeliveryProfile, DeliveryRule, DeliveryRuleResult, MeasureFileResult, MeasureReport } from '../../../types';
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

function measuredRow(file: MeasureFileResult, profile: DeliveryProfile, report: MeasureReport): FileRow {
  return {
    id: file.path,
    name: file.name,
    verdict: fileVerdict(file),
    length: formatLength(report.duration_seconds),
    rms: cell(report.rms_dbfs, resultFor(file, profile, ['rms_dbfs']), formatLevel),
    peak: cell(report.true_peak_dbtp, resultFor(file, profile, ['true_peak_dbtp', 'sample_peak_dbfs']), formatLevel),
    noiseFloor: cell(report.noise_floor_dbfs, resultFor(file, profile, ['noise_floor_dbfs']), formatLevel),
    head: cell(report.head_room_tone_seconds, resultFor(file, profile, ['head_room_tone_seconds']), (n) => n.toFixed(1)),
    tail: cell(report.tail_room_tone_seconds, resultFor(file, profile, ['tail_room_tone_seconds']), (n) => n.toFixed(1)),
    checks: checkRows(file, profile),
  };
}

export function buildRows(files: readonly MeasureFileResult[], profile: DeliveryProfile): FileRow[] {
  return files.map((file) => {
    if (file.status === 'measured' && file.report) return measuredRow(file, profile, file.report);
    const waiting = waitingText(file);
    return { id: file.path, name: file.name, verdict: 'none', waiting: waiting.text, waitingPill: waiting.pill, checks: [] };
  });
}

/** The file the table opens on: the first that fails, else the first. */
export function openingId(rows: readonly FileRow[]): string | undefined {
  return (rows.find((row) => row.verdict === 'fail') ?? rows[0])?.id;
}
