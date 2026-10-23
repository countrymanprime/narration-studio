import type { DawCapabilities } from '../../../api/contracts/daw';

// The five Clean up operations, the thresholds behind Light, Standard and Heavy, and the sentences the page proposes
// (the Studio Next mock's `CLEANUP_OPS` and its text helpers). Pure: nothing here reads a port.

export type CleanupKind = 'gaps' | 'breaths' | 'clicks' | 'plosives' | 'noise';
export type Level = 'light' | 'standard' | 'heavy';
export type ParamKey = 'limit' | 'above' | 'reduce';
export type CleanupParams = Partial<Record<ParamKey, number>>;

export const LEVELS: ReadonlyArray<readonly [Level, string]> = [
  ['light', 'Light'],
  ['standard', 'Standard'],
  ['heavy', 'Heavy'],
];

interface OpField {
  key: ParamKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export interface OpSpec {
  kind: CleanupKind;
  label: string;
  /** What one finding is called, singular then plural. */
  noun: readonly [string, string];
  fields: OpField[];
  levels: Record<Level, CleanupParams>;
}

/** The longest gap the Standard level leaves (the mock's `DEAD_AIR_LIMIT`). */
export const DEAD_AIR_LIMIT = 1.2;

const ABOVE = (label: string): OpField => ({ key: 'above', label, unit: 'dB', min: -60, max: 0, step: 1 });
const REDUCE: OpField = { key: 'reduce', label: 'Reduce by', unit: 'dB', min: 1, max: 24, step: 1 };

/** The thresholds behind Light, Standard and Heavy are the mock's numbers: starting values to tune on real recordings. */
export const CLEANUP_OPS: readonly OpSpec[] = [
  {
    kind: 'gaps',
    label: 'Gaps',
    noun: ['gap', 'gaps'],
    fields: [{ key: 'limit', label: 'Longest gap left', unit: 's', min: 0.2, max: 5, step: 0.1 }],
    levels: { light: { limit: 2 }, standard: { limit: DEAD_AIR_LIMIT }, heavy: { limit: 0.8 } },
  },
  {
    kind: 'breaths',
    label: 'Breaths',
    noun: ['breath', 'breaths'],
    fields: [ABOVE('Louder than'), REDUCE],
    levels: { light: { above: -20, reduce: 6 }, standard: { above: -26, reduce: 9 }, heavy: { above: -32, reduce: 12 } },
  },
  {
    kind: 'clicks',
    label: 'Clicks',
    noun: ['click', 'clicks'],
    fields: [ABOVE('Louder than')],
    levels: { light: { above: -22 }, standard: { above: -28 }, heavy: { above: -34 } },
  },
  {
    kind: 'plosives',
    label: 'Plosives',
    noun: ['plosive', 'plosives'],
    fields: [ABOVE('Louder than'), REDUCE],
    levels: { light: { above: -9, reduce: 4 }, standard: { above: -14, reduce: 6 }, heavy: { above: -18, reduce: 9 } },
  },
  {
    kind: 'noise',
    label: 'Noise',
    noun: ['noise', 'noises'],
    fields: [ABOVE('Louder than'), REDUCE],
    levels: { light: { above: -32, reduce: 8 }, standard: { above: -36, reduce: 12 }, heavy: { above: -40, reduce: 16 } },
  },
];

export const opSpec = (kind: CleanupKind): OpSpec => CLEANUP_OPS.find((o) => o.kind === kind) as OpSpec;

/** The thresholds the page opens with: every operation at Standard. */
export const initialParams = (): Record<CleanupKind, CleanupParams> =>
  Object.fromEntries(CLEANUP_OPS.map((o) => [o.kind, { ...o.levels.standard }])) as Record<CleanupKind, CleanupParams>;

/** The level whose thresholds these are, or null for custom ones. */
export function levelOf(kind: CleanupKind, params: CleanupParams): Level | null {
  const spec = opSpec(kind);
  return LEVELS.map(([l]) => l).find((l) => spec.fields.every((f) => spec.levels[l][f.key] === params[f.key])) ?? null;
}

/** The DAW capability each operation's Apply needs: a range cut for gaps, a gain change for the reductions, a click repair for clicks. */
const CAPABILITY: Record<CleanupKind, string> = {
  gaps: 'cut_range',
  breaths: 'range_gain',
  clicks: 'click_repair',
  plosives: 'range_gain',
  noise: 'range_gain',
};

/** The reason when the capability report names no support for the operation at all. */
const NO_DAW_COMMAND = 'No DAW command for this yet';

/** Does the DAW's capability report say it can apply this operation now? A report not read yet says no. */
const hasDawCommand = (kind: CleanupKind, caps: Pick<DawCapabilities, 'capabilities'> | null): boolean =>
  caps?.capabilities[CAPABILITY[kind]]?.available === true;

/** Why Apply is off for this operation: the capability's own sentence, or null when the DAW can do it or the report is not read yet. */
export function dawCommandReason(kind: CleanupKind, caps: Pick<DawCapabilities, 'capabilities'> | null): string | null {
  if (!caps || hasDawCommand(kind, caps)) return null;
  return caps.capabilities[CAPABILITY[kind]]?.message ?? NO_DAW_COMMAND;
}

const db = (n: number): string => `${n < 0 ? '−' : '+'}${Math.abs(n)} dB`;
const seconds = (n: number): string => `${Math.round(n * 100) / 100} s`;

/** The measure column: a duration, or dB and a length. */
export function measureText(kind: CleanupKind, finding: { dur: number; db?: number }): string {
  if (kind === 'gaps') return seconds(finding.dur);
  const len = finding.dur < 0.1 ? `${Math.round(finding.dur * 1000)} ms` : seconds(finding.dur);
  return finding.db != null ? `${db(finding.db)} · ${len}` : len;
}

/** The fix the page proposes for a finding of this operation. */
export function actionText(kind: CleanupKind, params: CleanupParams): string {
  if (kind === 'gaps') return `Shorten to ${params.limit} s`;
  if (kind === 'clicks') return 'Repair the click';
  return `Reduce by ${params.reduce} dB`;
}

/** The history label of an apply: "Shortened 3 gaps". */
export function appliedLabel(kind: CleanupKind, n: number, params: CleanupParams): string {
  const spec = opSpec(kind);
  const noun = `${n} ${spec.noun[n === 1 ? 0 : 1]}`;
  if (kind === 'gaps') return `Shortened ${noun}`;
  if (kind === 'clicks') return `Repaired ${noun}`;
  return `${kind === 'plosives' ? 'Softened' : 'Reduced'} ${noun} by ${params.reduce} dB`;
}
