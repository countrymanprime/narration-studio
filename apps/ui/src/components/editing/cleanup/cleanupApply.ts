import type { DawResult } from '../../../api/contracts/daw';
import type { Command } from '../../../studio/journal/createJournal';
import type { ClickRepairRequest, RangeGainRequest } from '../../../ports/daw';
import { actionText, appliedLabel, measureText, type CleanupKind, type CleanupParams } from './cleanupOps';
import { trimRange, type CleanupRow } from './cleanupRows';

// Preview and Apply. Nothing is called until Apply: the preview is a pure function of the selected rows. An apply is one journal
// entry. Each trim hides its piece on the muted Cuts track through the DAW, resolved by the item's GUID and never by position, and
// is recorded in the cuts only after the DAW accepted it. A reduction (breaths, plosives, noise) or a click repair names the take by
// its GUID and the stretches by their seconds in the take's own file, one DAW call per take, and leaves the cuts alone. Source media is
// never rendered, trimmed or deleted.

/** The most stretches or clicks one DAW call takes (the host refuses more). */
const MAX_PER_CALL = 500;

const CUTS_TRACK = 'the muted Cuts track';

/** One piece the DAW hides: the item as the finding recorded it, and the range inside the chapter, in project seconds. */
export interface RangeTrim {
  chapterId: string;
  itemGuid: string;
  start: number;
  end: number;
  /** The piece is muted and goes to the Cuts track; it is never deleted. */
  mode: 'mute';
}

/**
 * What an apply needs of the world, lent by the page that mounts the tab: the DAW's range cut and the cuts port. A page that has no
 * trim yet leaves `trim` out, and Apply stays off with the reason.
 */
export interface CleanupDeps {
  trim: (trim: RangeTrim) => Promise<DawResult>;
  /** Records an accepted trim in the chapter's cuts. */
  record: (trim: RangeTrim, result: DawResult) => Promise<void>;
  /** The DAW's reduction of stretches of a take (Breaths, Plosives, Noise); a page that lends none keeps those Apply buttons off. */
  reduce?: (request: RangeGainRequest) => Promise<DawResult>;
  /** The DAW's repair of clicks in a take (Clicks). */
  repair?: (request: ClickRepairRequest) => Promise<DawResult>;
}

interface PreviewLine {
  key: string;
  sec: number;
  measure: string;
  action: string;
}

export interface CleanupPreview {
  kind: CleanupKind;
  lines: PreviewLine[];
  /** Total seconds hidden (a gap) or the pieces' length (a reduction). */
  seconds: number;
  /** Where the hidden audio goes, or null when the operation hides none. */
  where: string | null;
  /** The DAW's undo sentence. */
  undo: string;
}

export function previewOf(kind: CleanupKind, rows: readonly CleanupRow[], params: CleanupParams, dawName: string): CleanupPreview {
  const hides = kind === 'gaps';
  const seconds = rows.reduce((sum, r) => {
    const range = trimRange(r, params);
    return sum + (hides ? Math.max(0, range.end - range.start) : r.dur);
  }, 0);
  return {
    kind,
    lines: rows.map((r) => ({ key: r.key, sec: r.sec, measure: measureText(kind, r), action: actionText(kind, params) })),
    seconds: Math.round(seconds * 100) / 100,
    where: hides ? CUTS_TRACK : null,
    undo: `Undo it with Edit > Undo in ${dawName}.`,
  };
}

/** How an apply went: what was hidden, what was stale and so left alone, and the sentence of a refusal that stopped it. */
export interface ApplyOutcome {
  applied: string[];
  stale: string[];
  refused?: string;
  undoSteps: number;
}

const STALE_ROW = 'This finding no longer matches an item in the project, so it was left alone.';

const reducing = (kind: CleanupKind): boolean => kind === 'breaths' || kind === 'plosives' || kind === 'noise';

/** The history label and the toast of an apply, in the words of what it did: a trim hides, a reduction lowers, a repair smooths. */
export function outcomeSentence(kind: CleanupKind, outcome: ApplyOutcome, params: CleanupParams): string {
  const parts = [kind === 'gaps' ? `Hid ${outcome.applied.length} on the muted Cuts track.` : `${appliedLabel(kind, outcome.applied.length, params)}.`];
  const { stale, refused } = outcome;
  if (stale.length) parts.push(`${stale.length} no longer matched an item and ${stale.length === 1 ? 'was' : 'were'} left alone.`);
  if (refused) parts.push(refused);
  return parts.join(' ');
}

/**
 * The selected findings as one journal entry. A finding with no item (no take or source time, for a reduction or a repair), or whose
 * item the DAW no longer finds, is reported stale and skipped; findings already done are not touched; none selected calls nothing. A
 * refusal stops the apply: nothing after it is tried, and the entry is refused outright when nothing had been applied yet.
 */
export function applyCleanupCommand(
  kind: CleanupKind,
  rows: readonly CleanupRow[],
  params: CleanupParams,
  chapterId: string,
  deps: CleanupDeps,
  dawName: string,
): Command<ApplyOutcome> {
  const todo = rows.filter((r) => !r.done);
  return {
    label: appliedLabel(kind, todo.length, params),
    touches: kind === 'gaps' ? ['cuts'] : [],
    daw: true,
    notUndoableReason: `Use Edit > Undo in ${dawName}.`,
    async run() {
      const outcome: ApplyOutcome = { applied: [], stale: [], undoSteps: 0 };
      if (!todo.length) return { ok: false, refusal: { code: 'nothing_selected', reason: 'Nothing is selected.' } };
      const calls = kind === 'gaps' ? trimCalls(todo, params, chapterId, deps, outcome) : takeCalls(kind, todo, params, chapterId, deps, outcome);
      if (!calls) return { ok: false, refusal: { code: 'no_daw_command', reason: 'No DAW command for this yet.' } };
      for (const call of calls) {
        const result = await call.send();
        if (!result.ok) {
          if (result.code === 'stale') {
            outcome.stale.push(...call.keys);
            continue;
          }
          const reason = result.refused ?? result.message;
          if (!outcome.applied.length) return { ok: false, refusal: { code: 'daw_refused', reason } };
          return { ok: true, value: { ...outcome, refused: reason } };
        }
        await call.done?.(result);
        if (result.changed) outcome.applied.push(...call.keys);
        outcome.undoSteps += result.undoSteps;
      }
      if (!outcome.applied.length && outcome.stale.length) {
        return { ok: false, refusal: { code: 'stale', reason: STALE_ROW } };
      }
      return { ok: true, value: outcome };
    },
  };
}

/** A stretch or click in a take's own file, in seconds. */
type DawSpan = { start: number; end: number };

/** One DAW call of an apply: the rows it covers, what it sends and what is recorded once the DAW accepted it. */
interface Call {
  keys: string[];
  send: () => Promise<DawResult>;
  done?: (result: DawResult) => Promise<void>;
}

/** A gap is trimmed one piece at a time, each recorded in the cuts. A row with no item is stale before any call. */
function trimCalls(todo: readonly CleanupRow[], params: CleanupParams, chapterId: string, deps: CleanupDeps, outcome: ApplyOutcome): Call[] {
  const calls: Call[] = [];
  for (const row of todo) {
    if (!row.itemGuid) {
      outcome.stale.push(row.key);
      continue;
    }
    const range = trimRange(row, params);
    const trim: RangeTrim = { chapterId, itemGuid: row.itemGuid, start: range.start, end: range.end, mode: 'mute' };
    calls.push({ keys: [row.key], send: () => deps.trim(trim), done: (result) => deps.record(trim, result) });
  }
  return calls;
}

/**
 * A reduction or a repair is one DAW call per take (and per 500 stretches). A row the finding gave no take or source window is stale
 * before any call. Null when the page lends no call for this operation.
 */
function takeCalls(
  kind: CleanupKind,
  todo: readonly CleanupRow[],
  params: CleanupParams,
  chapterId: string,
  deps: CleanupDeps,
  outcome: ApplyOutcome,
): Call[] | null {
  const { reduce, repair } = deps;
  const ask = reducing(kind)
    ? reduce && ((takeId: string, spans: DawSpan[]) => reduce({ chapterId, takeId, stretches: spans, reduceDb: params.reduce ?? 0 }))
    : repair && ((takeId: string, spans: DawSpan[]) => repair({ chapterId, takeId, clicks: spans }));
  if (!ask) return null;
  const byTake = new Map<string, CleanupRow[]>();
  for (const row of todo) {
    if (!row.takeGuid || row.sourceStart === undefined || row.sourceEnd === undefined) {
      outcome.stale.push(row.key);
      continue;
    }
    byTake.set(row.takeGuid, [...(byTake.get(row.takeGuid) ?? []), row]);
  }
  const calls: Call[] = [];
  for (const [takeId, group] of byTake) {
    for (let i = 0; i < group.length; i += MAX_PER_CALL) {
      const rows = group.slice(i, i + MAX_PER_CALL);
      const spans = rows.map((r) => ({ start: r.sourceStart as number, end: r.sourceEnd as number }));
      calls.push({ keys: rows.map((r) => r.key), send: () => ask(takeId, spans) });
    }
  }
  return calls;
}
