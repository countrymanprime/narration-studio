import type { Finding } from '../../../api/contracts/findings';
import { CLEANUP_OPS, DEAD_AIR_LIMIT, type CleanupKind, type CleanupParams } from './cleanupOps';

// The rows of the Clean up tab. Nothing is invented: a row is a finding the host already holds, either a Proof finding of the
// operation's category or an editing candidate (silence, click, breath), joined by item and time so one sound is one row.
// The thresholds filter them here; the findings carry their measured dB and duration.

export interface CleanupRow {
  /** Stable across reads: the operation, the item and the start time. */
  key: string;
  kind: CleanupKind;
  /** Project seconds where the finding starts and ends. */
  sec: number;
  end: number;
  dur: number;
  db?: number;
  /** The item's GUID as the finding recorded it; absent when the finding names none, which makes it stale. */
  itemGuid?: string;
  /** Source-file seconds of the same window, when the analyzer had them. */
  sourceStart?: number;
  sourceEnd?: number;
  /** The narrator already accepted it. */
  done: boolean;
  /** The ids of the findings this row stands for (a finding and a candidate of the same sound). */
  ids: string[];
}

/** Two findings of one item and operation closer than this (seconds) are the same sound. */
const SAME_SOUND = 0.05;

const CLASS_KIND: Record<string, CleanupKind> = { silence: 'gaps', breath: 'breaths', click: 'clicks', plosive: 'plosives', noise: 'noise' };

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** The operation a finding belongs to: its evidence class when it names one, else the pacing category is a gap. */
function kindOf(finding: Finding): CleanupKind | null {
  const cls = finding.evidence?.['class'];
  if (typeof cls === 'string' && cls in CLASS_KIND) return CLASS_KIND[cls] as CleanupKind;
  if (finding.category === 'pacing') return 'gaps';
  return null;
}

function rowOf(finding: Finding, kind: CleanupKind): CleanupRow | null {
  const range = finding.time_range;
  if (!range || finding.review.status === 'dismissed') return null;
  const dur = num(finding.evidence?.['duration_seconds']) ?? range.end - range.start;
  const db = num(finding.evidence?.['level_dbfs']);
  const itemGuid = finding.source.item_guid;
  return {
    key: `${kind}:${itemGuid ?? '-'}:${range.start.toFixed(3)}`,
    kind,
    sec: range.start,
    end: range.end,
    dur,
    ...(db !== undefined ? { db } : {}),
    ...(itemGuid ? { itemGuid } : {}),
    ...(range.source_start !== undefined ? { sourceStart: range.source_start } : {}),
    ...(range.source_end !== undefined ? { sourceEnd: range.source_end } : {}),
    done: finding.review.status === 'accepted',
    ids: [finding.id],
  };
}

/** Every row of this operation among the findings, in time order, a finding and a candidate of one sound as one row. */
export function cleanupRows(findings: readonly Finding[], kind: CleanupKind): CleanupRow[] {
  const rows: CleanupRow[] = [];
  for (const finding of findings) {
    if (kindOf(finding) !== kind) continue;
    const row = rowOf(finding, kind);
    if (!row) continue;
    const twin = rows.find((r) => r.itemGuid === row.itemGuid && Math.abs(r.sec - row.sec) < SAME_SOUND);
    if (!twin) {
      rows.push(row);
      continue;
    }
    twin.ids.push(...row.ids);
    twin.done = twin.done || row.done;
    if (twin.db === undefined && row.db !== undefined) twin.db = row.db;
  }
  return rows.sort((a, b) => a.sec - b.sec);
}

/** Does this finding pass the thresholds, so the page proposes a fix? */
function passes(kind: CleanupKind, params: CleanupParams, row: CleanupRow): boolean {
  return kind === 'gaps' ? row.dur > (params.limit ?? DEAD_AIR_LIMIT) : (row.db ?? -Infinity) > (params.above ?? 0);
}

/** The rows the list shows: those that pass the thresholds, and those already done. */
export const proposals = (findings: readonly Finding[], kind: CleanupKind, params: CleanupParams): CleanupRow[] =>
  cleanupRows(findings, kind).filter((r) => r.done || passes(kind, params, r));

/** How many findings of each operation pass its thresholds and are not yet done. */
export function countsOf(findings: readonly Finding[], params: Record<CleanupKind, CleanupParams>): Record<CleanupKind, number> {
  return Object.fromEntries(CLEANUP_OPS.map((o) => [o.kind, proposals(findings, o.kind, params[o.kind]).filter((r) => !r.done).length])) as Record<
    CleanupKind,
    number
  >;
}

/** The rows the apply takes: not done and not skipped. */
export const selectedRows = (rows: readonly CleanupRow[], skip: readonly string[]): CleanupRow[] => rows.filter((r) => !r.done && !skip.includes(r.key));

/** The part of a gap a trim hides: the length above what the level leaves, taken from the end of the gap. */
export function trimRange(row: CleanupRow, params: CleanupParams): { start: number; end: number } {
  const left = params.limit ?? DEAD_AIR_LIMIT;
  return { start: row.sec + left, end: row.end };
}

/** The chapter's noise floor from the measurement the findings already carry (`audio_quality` evidence), or why there is none. */
export function noiseFloorOf(findings: readonly Finding[]): { ok: true; value: number } | { ok: false; reason: string } {
  for (const f of findings) {
    const v = f.evidence?.['noise_floor_dbfs'];
    if (typeof v === 'number' && Number.isFinite(v)) return { ok: true, value: v };
  }
  return { ok: false, reason: 'no measurement of this chapter reports a noise floor yet.' };
}
