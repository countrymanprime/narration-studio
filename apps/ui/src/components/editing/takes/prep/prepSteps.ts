import type { DawResult } from '../../../../api/contracts/daw';
import type { LevelMatchApplyResult, LevelMatchMetric } from '../../../../api/contracts/cleanup';
import type { DawClient } from '../../../../ports/daw';
import type { Command, Result } from '../../../../studio/journal/createJournal';
import { LEVEL_TOLERANCE_DB, TARGET_RMS_DB } from '../../model/estimates';
import type { LinePassage } from '../types';

export type PrepStepId = 'trim-silence' | 'trim-breaths' | 'normalise';
export type TrimStepId = Exclude<PrepStepId, 'normalise'>;

/** A stretch of the passage to cut, as the first and last word (token) of the chapter's stored alignment that `deleteRange` takes. */
export interface PrepRange {
  firstToken: number;
  lastToken: number;
}

/** Where a passage's long pauses or breaths are. The page answers it from the editing check's candidates; absent until it can. */
export type RangesOf = (passage: LinePassage, step: TrimStepId) => Promise<readonly PrepRange[]>;

/** The item-gain path normalise takes: the same two calls the old Match levels row makes, at the target the suggestion measures against. */
export interface LevelMatcher {
  levelMatchPreview(chapterId: string, metric: LevelMatchMetric, targetValueDb: number, toleranceDb: number): Promise<{ candidates: readonly unknown[] }>;
  levelMatchApply(chapterId: string, metric: LevelMatchMetric, targetValueDb: number, toleranceDb: number): Promise<LevelMatchApplyResult>;
}

export const LEVEL_METRIC: LevelMatchMetric = 'rms_dbfs';
export const LEVEL_TARGET_DB = TARGET_RMS_DB;
export const LEVEL_TOLERANCE = LEVEL_TOLERANCE_DB;
/** The fade at each seam of a trim, milliseconds: short enough to keep the words, long enough to avoid a click. */
const TRIM_FADE_MS = 10;

interface StepText {
  /** The control and the question: "Trim white space". */
  label: string;
  /** The history entry and the toast. */
  entry: string;
  /** The capability the DAW must have. */
  capability: 'cut_range' | 'item_gain';
}

export const STEP_TEXT: Record<PrepStepId, StepText> = {
  'trim-silence': { label: 'Trim white space', entry: 'Trimmed white space', capability: 'cut_range' },
  'trim-breaths': { label: 'Trim breaths', entry: 'Trimmed breaths', capability: 'cut_range' },
  normalise: { label: 'Normalise', entry: 'Normalised the takes', capability: 'item_gain' },
};

export const isTrim = (step: PrepStepId): step is TrimStepId => step !== 'normalise';

const refuse = (reason: string, code = 'daw_refused'): Result<never> => ({ ok: false, refusal: { code, reason } });

/**
 * A trim: one range cut to the muted Cuts track per stretch, `close` so the take is shorter, stopping at the first refusal. The history has one entry
 * for the step. The DAW holds the undo (one step per cut), so the entry has no inverse of its own and says where to undo it.
 */
export function trimCommand(daw: DawClient, passage: LinePassage, step: TrimStepId, ranges: readonly PrepRange[], dawName: string): Command<DawResult> {
  return {
    label: STEP_TEXT[step].entry,
    touches: [`takes/${passage.id}`],
    daw: true,
    async run() {
      let last: DawResult | null = null;
      let changed = false;
      for (const r of ranges) {
        const result = await daw.deleteRange({
          chapterId: passage.chapterId,
          firstToken: r.firstToken,
          lastToken: r.lastToken,
          mode: 'close',
          fadeMs: TRIM_FADE_MS,
        });
        if (!result.ok) return refuse(result.refused ?? result.message, result.code ?? 'daw_refused');
        changed ||= result.changed;
        last = result;
      }
      if (!last || !changed) return refuse('Nothing to trim: those stretches are already cut.');
      return { ok: true, value: last };
    },
    notUndoableReason: `Undo the trim in ${dawName}.`,
  };
}

/** Normalise through the item-gain path. `levelMatchApply` measures again itself, so the preview's numbers are never what is applied. */
export function normaliseCommand(matcher: LevelMatcher, passage: LinePassage, dawName: string): Command<LevelMatchApplyResult> {
  return {
    label: STEP_TEXT.normalise.entry,
    touches: [`takes/${passage.id}`],
    daw: true,
    async run() {
      let result: LevelMatchApplyResult;
      try {
        result = await matcher.levelMatchApply(passage.chapterId, LEVEL_METRIC, LEVEL_TARGET_DB, LEVEL_TOLERANCE);
      } catch (error) {
        return refuse(error instanceof Error ? error.message : String(error));
      }
      if (result.changed.length === 0) {
        const stale = result.stale[0]?.reason;
        return refuse(stale ? `Nothing changed: ${stale}` : 'Nothing changed: every take is already within the level.');
      }
      return { ok: true, value: result };
    },
    notUndoableReason: `Undo the level change in ${dawName}.`,
  };
}
