import { DAW_RESULT_MAX_UNDO_STEPS, type DawResult } from '../../../api/contracts/daw';
import type { DawClient } from '../../../ports/daw';
import type { Command, Result } from '../../../studio/journal/createJournal';

/** The kind of DAW change a take is, in the DAW port's words (`DawActionKind`). */
const TAKE_KIND = 'record_take';

/** Why a take the DAW reported no undo points for cannot be undone here: its script predates them. */
export const TAKE_SCRIPT_OUTDATED =
  "The app's script in the DAW is older than this app and cannot undo the take. Use Edit > Undo in the DAW, or import the script again from this app's DAW folder.";

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * A take the Booth stopped in the DAW, as one history entry: the stop already happened, so `run` answers what it returned. The DAW's
 * own history holds `undoSteps` points for it (one per stop, a roll's included), and the inverse asks the DAW to undo exactly those; the
 * journal runs it only while the DAW says the take is still its last action (docs/architecture/ui-state-and-journal.md#the-journal-and-undo).
 * A stop that reported none (an older script) or more than one undo may take back is journaled with no inverse, and its reason.
 */
export function recordedTakeCommand({ daw, result, title }: { daw: Pick<DawClient, 'undoLast'>; result: DawResult; title: string }): Command<DawResult> {
  const steps = result.undoSteps;
  const undoable = steps >= 1 && steps <= DAW_RESULT_MAX_UNDO_STEPS;
  return {
    label: `Recorded a take of ${title}`,
    touches: ['booth/takes'],
    daw: true,
    dawAction: () => (undoable ? { kind: TAKE_KIND, steps } : undefined),
    run: async (): Promise<Result<DawResult>> => ({ ok: true, value: result }),
    ...(undoable
      ? {
          async undo(): Promise<Result<unknown>> {
            const answer = await daw
              .undoLast(TAKE_KIND, steps)
              .catch((e: unknown): DawResult => ({ ok: false, changed: false, message: why(e), undoSteps: 0, refused: why(e) }));
            return answer.ok ? { ok: true, value: answer } : { ok: false, refusal: { code: 'daw_refused', reason: answer.refused ?? answer.message } };
          },
        }
      : { notUndoableReason: TAKE_SCRIPT_OUTDATED }),
  };
}
