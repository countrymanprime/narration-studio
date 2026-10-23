import { useEffect, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { EditCut } from '../../../api/contracts/editCuts';
import { shownFindingNoteType, type Finding } from '../../../api/contracts/findings';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { usePort } from '../../../ports/usePort';
import { applyCleanupCommand, outcomeSentence } from '../../editing/cleanup/cleanupApply';
import { DEAD_AIR_LIMIT } from '../../editing/cleanup/cleanupOps';
import { cleanupRows } from '../../editing/cleanup/cleanupRows';
import { useCleanupDeps } from '../../editing/cleanup/useCleanupDeps';
import { IconButton } from '../../primitives/IconButton';
import { dawNameOf } from './InspectorActions';

/** The label of the control and of the note's menu entry (mock `#trim`). */
export const TRIM_LABEL = `Trim the gap to ${DEAD_AIR_LIMIT} s`;

const PARAMS = { limit: DEAD_AIR_LIMIT };

/** Whether a note is a gap Proof can trim: a pacing note not decided yet, with a gap the finding measured (mock `row.ty === 'pacing' && !row.res`). */
export function trimmableGap(finding: Finding): boolean {
  return shownFindingNoteType(finding) === 'pacing' && finding.review.status === 'unreviewed' && cleanupRows([finding], 'gaps').length > 0;
}

/**
 * Trim the gap on Proof (mock `cleanDeadAir`, G5 of the Proof parity note): Editing's own gap operation (`applyCleanupCommand`, a
 * range cut on the muted Cuts track recorded in the chapter's cuts) for this one note, through the same `cut_range` capability. Proof
 * has no second implementation. A trim the DAW made is one change there with its own Undo, and `onTrimmed` then decides the note
 * Fix in edit, so the Clean up tab counts it as done. Shown only for a gap note not decided yet.
 */
export function TrimGap({ finding, inert, onTrimmed }: { finding: Finding; inert: boolean; onTrimmed: () => void }) {
  const daw = usePort('daw');
  const log = usePort('editCuts');
  const action = usePendingAction();
  const chapterId = finding.manuscript?.chapter_id ?? '';
  const [caps, setCaps] = useState<DawCapabilities>();
  const [cuts, setCuts] = useState<EditCut[]>();
  const [result, setResult] = useState<{ message: string; failed: boolean }>();
  const deps = useCleanupDeps({ cuts: cuts ?? [], onCuts: setCuts });

  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (found) => live && setCaps(found),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [daw]);
  useEffect(() => {
    let live = true;
    if (chapterId)
      log.editingCutsList(chapterId).then(
        (read) => live && setCuts(read.cuts),
        (error: unknown) => live && setResult({ message: `The chapter's cuts were not read: ${apiErrorMessage(error)}`, failed: true }),
      );
    return () => {
      live = false;
    };
  }, [log, chapterId]);

  const row = cleanupRows([finding], 'gaps')[0];
  const support = caps?.capabilities['cut_range'];
  const reason = !caps
    ? 'Checking what the DAW can do…'
    : !support?.available
      ? (support?.message ?? 'Your DAW does not offer this.')
      : !chapterId
        ? 'This note names no chapter.'
        : !row || row.dur <= DEAD_AIR_LIMIT
          ? `This gap is already ${DEAD_AIR_LIMIT} s or shorter.`
          : !cuts || !deps
            ? 'Reading the chapter’s cuts…'
            : undefined;

  const trim = () =>
    action.run('trim', async () => {
      if (!row || !deps) return;
      setResult(undefined);
      const dawName = dawNameOf(caps);
      try {
        const done = await applyCleanupCommand('gaps', [row], PARAMS, chapterId, deps, dawName).run();
        if (!done.ok) {
          setResult({ message: done.refusal.reason, failed: true });
          return;
        }
        setResult({ message: `${outcomeSentence('gaps', done.value, PARAMS)} Undo it with Edit > Undo in ${dawName}.`, failed: Boolean(done.value.refused) });
        if (done.value.applied.length) onTrimmed();
      } catch (error) {
        setResult({ message: `The DAW was not asked: ${apiErrorMessage(error)}`, failed: true });
      }
    });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <IconButton
          action="trimGap"
          label={TRIM_LABEL}
          disabled={inert}
          disabledReason={reason}
          pending={action.isPending('trim')}
          onClick={() => void trim()}
        />
        <span className="text-sm text-[var(--text-muted)]">Cleanup</span>
      </div>
      {result?.failed ? (
        <p role="alert" className="text-sm text-[var(--danger-text)]">
          {result.message}
        </p>
      ) : (
        <p role="status" className="text-sm empty:hidden">
          {result?.message}
        </p>
      )}
    </div>
  );
}
