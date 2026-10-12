import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import type { Journal } from '../../../../studio/journal/createJournal';
import { clock } from '../../bar/clock';
import { registerFlagAction } from '../../flags/flagActions';
import { registerTakeControl } from '../takeControls';
import { SplitButton } from './SplitButton';
import { SplitConfirmBody } from './SplitConfirm';
import { splitCommand, type SplitTarget } from './splitCommand';
import { NO_SPLIT_COMMAND, planSplit, type SplitPlan, type TakeSplitter } from './splitPlan';

export interface UseSplitDuplicate {
  /** The plan for the DAW now, or null until it has answered. */
  plan: SplitPlan | null;
  /** Asks first, then cuts. Cancel changes nothing; a refusal shows its sentence and the take stays whole. */
  split: (target: SplitTarget) => Promise<void>;
}

export interface SplitOptions {
  journal: Pick<Journal, 'act' | 'undo'>;
  /** The DAW's cut. Absent until the DAW port has the commands: the split is then refused with `NO_SPLIT_COMMAND`. */
  splitter?: TakeSplitter;
  /** The take to cut for a line (a paragraph or passage id), or null when it does not read the line twice. */
  resolve: (id: string) => SplitTarget | null;
}

const NO_ANSWER = 'Could not ask the DAW what it can do.';

/**
 * Splits a take that reads the line twice into two takes. Registers the "Stack as 2 takes" action the Read twice card calls and a "Split into
 * takes" control in the footer of the line's takes; with the DAW unable, the control is disabled with the capability's own sentence and the
 * action shows it in a toast.
 */
export function useSplitDuplicate({ journal, splitter, resolve }: SplitOptions): UseSplitDuplicate {
  const daw = usePort('daw');
  const [plan, setPlan] = useState<SplitPlan | null>(null);
  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (caps) => live && setPlan(planSplit(caps)),
      () => live && setPlan({ kind: 'refused', reason: NO_ANSWER }),
    );
    return () => {
      live = false;
    };
  }, [daw]);

  const split = useCallback(
    async (target: SplitTarget) => {
      if (!plan) return;
      if (plan.kind === 'refused') return overlay.toast(plan.reason, { tone: 'error' });
      if (!splitter) return overlay.toast(NO_SPLIT_COMMAND, { tone: 'error' });
      const yes = await overlay.confirm({
        title: 'Split this take?',
        body: <SplitConfirmBody plan={plan} target={target} />,
        confirmLabel: 'Split take',
      });
      if (!yes) return;
      const result = await journal.act(splitCommand(splitter, plan, target));
      if (!result.ok) return overlay.toast(result.refusal.reason, { tone: 'error' });
      const done = `Split ${target.label} at ${clock(target.at)}. The line has two takes now.`;
      if (plan.kind === 'recorder') overlay.toastUndo(done, () => journal.undo(result.value.id));
      else overlay.toast(`${done} ${result.value.value.message}`);
    },
    [journal, plan, splitter],
  );

  const latest = useRef({ split, resolve, plan });
  latest.current = { split, resolve, plan };
  useEffect(() => {
    const act = (id: string): void => {
      const target = latest.current.resolve(id);
      if (target) void latest.current.split(target);
    };
    const offAction = registerFlagAction('stackAsTakes', act);
    const offControl = registerTakeControl({
      id: 'split',
      order: 30,
      render: ({ passage }): ReactNode => {
        if (!latest.current.resolve(passage.id)) return null;
        const refused = plan?.kind === 'refused' ? plan.reason : plan ? undefined : 'Checking what the DAW can do.';
        return <SplitButton reason={refused} onSplit={() => act(passage.id)} />;
      },
    });
    return () => {
      offAction();
      offControl();
    };
  }, [plan]);

  return { plan, split };
}
