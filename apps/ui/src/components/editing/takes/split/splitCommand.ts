import type { DawResult } from '../../../../api/contracts/daw';
import type { Command, Result } from '../../../../studio/journal/createJournal';
import type { SplitPlan, TakeSplitter } from './splitPlan';

/** The take to cut and where, in seconds of the chapter. */
export interface SplitTarget {
  chapterId: string;
  takeId: string;
  /** What the narrator calls the take ("T-12"). */
  label: string;
  /** Where the cut goes: in the pause before the second read. */
  at: number;
}

type Cutting = Exclude<SplitPlan, { kind: 'refused' }>;

const refusal = (r: DawResult): Result<never> => ({ ok: false, refusal: { code: r.code ?? 'daw_refused', reason: r.refused ?? r.message } });

/**
 * Cuts the take in two: in the DAW, or by the recorder itself. With backups the audio around the cut is backed up first, and if the backup is
 * refused the take is not cut. One command is one history entry. Undo is the recorder's own join; a DAW's cut is one undo step in the DAW, which
 * is where it is taken back (the confirmation says so).
 */
export function splitCommand(splitter: TakeSplitter, plan: Cutting, target: SplitTarget): Command<DawResult> {
  return {
    label: `Split ${target.label} at the second read`,
    touches: [`takes/${target.takeId}`],
    daw: plan.kind !== 'recorder',
    async run() {
      if (plan.kind === 'backup-then-daw') {
        const backed = await splitter.backupAround(target.chapterId, target.at, 'Split a duplicate read');
        if (!backed.ok) return refusal(backed);
      }
      const cut = await (plan.kind === 'recorder' ? splitter.cutOwnTake(target.takeId, target.at) : splitter.splitTake(target.takeId, target.at));
      return cut.ok ? { ok: true, value: cut } : refusal(cut);
    },
    ...(plan.kind === 'recorder'
      ? {
          async undo() {
            const joined = await splitter.joinOwnTakes(target.takeId);
            return joined.ok ? { ok: true as const, value: joined } : refusal(joined);
          },
        }
      : { notUndoableReason: `Undo the split in ${plan.dawName}.` }),
  };
}
