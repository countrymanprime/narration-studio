import { Button } from '../../primitives/Button';
import { SectionLabel } from '../../primitives/SectionLabel';
import { clock } from '../bar/clock';
import type { StackPlan } from '../model/stacking';
import { shiftText, undoSentence, type StackActing } from './stackPlan';
import { plural, STACK_TEXT } from './stackText';
import type { StackLine } from './types';

export type StackDirection = 'stack' | 'unstack';

export interface StackDialogProps {
  direction: StackDirection;
  plan: StackPlan;
  /** The lines the plan names, by passage id, for their words. */
  lines: ReadonlyMap<string, StackLine>;
  how: StackActing;
  onCancel: () => void;
  onConfirm: () => void;
}

/** The dialog's title: what it does. */
export const stackTitle = (direction: StackDirection): string => (direction === 'stack' ? STACK_TEXT.action : STACK_TEXT.unstack);

const range = (at: number, len: number): string => `${clock(at)}–${clock(at + len)}`;

/**
 * What stacking (or putting back) will do, before anything moves (the mock's `StackDialog`): the passages and their time ranges before and
 * after, how many takes, how far the audio that follows moves, and how the DAW undoes it. A DAW that works in steps lists its edits and the
 * backup made first; the recorder says the app makes the change itself. Cancel has the focus, and nothing moves until the last button.
 */
export function StackDialog({ direction, plan, lines, how, onCancel, onConfirm }: StackDialogProps) {
  const stack = direction === 'stack';
  return (
    <div className="flex flex-col gap-3" data-stack-dialog>
      <p className="m-0" data-stack-summary>
        {plural(plan.takes, 'take', 'takes')} in {plural(plan.groups.length, 'passage', 'passages')}
        {stack ? ' move onto the first read’s spot' : ' go back to where they were recorded'}. {shiftText(plan.shift)}
      </p>
      <div className="flex flex-col gap-2.5">
        {plan.groups.map((g) => (
          <div key={g.passage.id} className="flex flex-col gap-0.5" data-stack-group={g.passage.id}>
            <div className="truncate" title={lines.get(g.passage.id)?.script}>
              <b className="font-mono">{clock(g.before.start)}</b> {lines.get(g.passage.id)?.script}
            </div>
            <div className="font-mono text-sm text-[var(--text-muted)]" data-stack-span>
              {range(g.before.start, g.before.end - g.before.start)} → {range(g.after.start, g.after.end - g.after.start)}
            </div>
            {g.moves.map((m) => (
              <div key={m.takeId} className="font-mono text-sm text-[var(--text-muted)]" data-stack-move={m.takeId}>
                {m.takeId} · {range(m.from, m.len)} → {range(m.to, m.len)}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="m-0 rounded-lg bg-[var(--info-soft)] px-3 py-2.5 text-sm" data-stack-undo>
        {undoSentence(how)}
      </p>
      {how.kind === 'steps' ? (
        <>
          <SectionLabel>{how.dawName} steps</SectionLabel>
          <ol className="m-0 pl-5" data-stack-steps>
            {how.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {stack && plan.region ? (
            <div className="font-mono text-sm text-[var(--text-muted)]" data-stack-backup>
              Backup first: {clock(plan.region.start)}–{clock(plan.region.end)}
            </div>
          ) : null}
        </>
      ) : null}
      {how.kind === 'recorder' ? <p className="m-0 text-sm text-[var(--text-muted)]">No DAW is asked: the built-in recorder keeps the takes itself.</p> : null}
      <div className="sticky bottom-[-1.1rem] mx-[-1.1rem] mb-[-1.1rem] flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-[1.1rem] py-3">
        <Button type="button" variant="secondary" autoFocus onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="primary" disabled={!plan.groups.length} onClick={onConfirm}>
          {stack ? STACK_TEXT.stackGo : STACK_TEXT.unstackGo}
        </Button>
      </div>
    </div>
  );
}
