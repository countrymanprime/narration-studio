import { clock } from '../../bar/clock';
import type { SplitTarget } from './splitCommand';
import type { SplitPlan } from './splitPlan';

type Cutting = Exclude<SplitPlan, { kind: 'refused' }>;

/** How the split is taken back, in the DAW's own words for it. */
function undoSentence(plan: Cutting): string {
  return plan.kind === 'recorder' ? 'Undo here puts the take back whole.' : `It is one undo step in ${plan.dawName}: Undo there puts the take back whole.`;
}

/** What the split asks the narrator before it cuts: the time, where it is cut and how it is undone. */
export function SplitConfirmBody({ plan, target }: { plan: Cutting; target: SplitTarget }) {
  return (
    <div className="flex flex-col gap-2" data-split-confirm>
      <p className="m-0">
        {target.label} reads the line twice. Cut it at <b>{clock(target.at)}</b>, where the second read starts, so the line has two takes to choose between.
        Nothing is deleted.
      </p>
      {plan.kind === 'backup-then-daw' ? (
        <p className="m-0">{plan.dawName} replaces audio when it cuts, so the audio around the cut is backed up first.</p>
      ) : null}
      <p className="m-0 text-[var(--text-muted)]">
        {plan.kind === 'recorder' ? 'The built-in recorder makes the cut itself.' : `${plan.dawName} makes the cut.`} {undoSentence(plan)}
      </p>
    </div>
  );
}
