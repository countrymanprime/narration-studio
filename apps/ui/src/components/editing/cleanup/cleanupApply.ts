import type { DawResult } from '../../../api/contracts/daw';
import type { Command } from '../../../studio/journal/createJournal';
import { actionText, appliedLabel, hasDawCommand, measureText, type CleanupKind, type CleanupParams } from './cleanupOps';
import { trimRange, type CleanupRow } from './cleanupRows';

// Preview and Apply. Nothing is called until Apply: the preview is a pure function of the selected rows. An apply is one journal
// entry. Each trim hides its piece on the muted Cuts track through the DAW, resolved by the item's GUID and never by position, and
// is recorded in the cuts only after the DAW accepted it. Source media is never rendered, trimmed or deleted.

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

/**
 * The selected findings as one journal entry. A finding with no item, or whose item the DAW no longer finds, is reported stale and
 * skipped; findings already done are not touched; none selected calls nothing. A refusal stops the apply: nothing after it is tried,
 * and the entry is refused outright when nothing had been applied yet.
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
    touches: ['cuts'],
    daw: true,
    notUndoableReason: `Use Edit > Undo in ${dawName}.`,
    async run() {
      const outcome: ApplyOutcome = { applied: [], stale: [], undoSteps: 0 };
      if (!todo.length) return { ok: false, refusal: { code: 'nothing_selected', reason: 'Nothing is selected.' } };
      if (!hasDawCommand(kind)) return { ok: false, refusal: { code: 'no_daw_command', reason: 'No DAW command for this yet.' } };
      for (const row of todo) {
        if (!row.itemGuid) {
          outcome.stale.push(row.key);
          continue;
        }
        const range = trimRange(row, params);
        const trim: RangeTrim = { chapterId, itemGuid: row.itemGuid, start: range.start, end: range.end, mode: 'mute' };
        const result = await deps.trim(trim);
        if (!result.ok) {
          if (result.code === 'stale') {
            outcome.stale.push(row.key);
            continue;
          }
          const reason = result.refused ?? result.message;
          if (!outcome.applied.length) return { ok: false, refusal: { code: 'daw_refused', reason } };
          return { ok: true, value: { ...outcome, refused: reason } };
        }
        await deps.record(trim, result);
        if (result.changed) outcome.applied.push(row.key);
        outcome.undoSteps += result.undoSteps;
      }
      if (!outcome.applied.length && outcome.stale.length) {
        return { ok: false, refusal: { code: 'stale', reason: STALE_ROW } };
      }
      return { ok: true, value: outcome };
    },
  };
}
