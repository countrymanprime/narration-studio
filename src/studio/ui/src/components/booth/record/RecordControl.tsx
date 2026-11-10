import { Icon } from '../../primitives/Icon';
import { SplitMain } from '../../primitives/SplitButton';
import type { RecordControlState } from './useRecordControl';

/** The footer's polite status line that says a press is starting a take; Record is described by it while it waits. */
export const PENDING_ID = 'brec-pending';

/**
 * The Booth footer's Record / Stop button (the mock's `brec`), the main part of the footer's split button. The label is "Record" and "Stop" in every setup; which DAW records
 * is the setup chip's to say. While Record cannot start it looks off (`aria-disabled`) and is described by the reason, which the footer
 * draws as `#brec-why` beside it, but it stays pressable: the press opens the dialog that fixes the reason, or says it with an action.
 */
export function RecordControl({
  control,
  cold,
  describedBy = 'brec-why',
}: {
  control: Pick<RecordControlState, 'recording' | 'disabled' | 'reason'> & {
    toggle: () => Promise<unknown>;
    /** A press is starting a take (the Start from here lookup, the model and project checks, the start tone, the DAW command): Record shows it at once. */
    pending?: boolean;
    /** What the pending Record says: its tip. */
    pendingText?: string;
  };
  /** The side menu picked Cold read: the button reads it and starts one (`on` while it listens: Stop); Record's own reasons do not apply. */
  cold?: { mode: boolean; on: boolean };
  describedBy?: string;
}) {
  const { recording, toggle } = control;
  const coldMode = Boolean(cold?.mode) && !recording;
  // A cold read needs a microphone, not a recorder: Record's reasons leave it alone.
  const disabled = coldMode ? false : control.disabled;
  const reason = coldMode ? undefined : control.reason;
  const stop = recording || (coldMode && cold?.on);
  // Only a start is pending; a Stop (the take is running) is never dimmed.
  const pending = Boolean(control.pending) && !recording && !coldMode;
  return (
    // `SplitMain` is as wide as "Record" in both states, so the timer beside it does not move when it becomes Stop (alignment audit XBO-25).
    <SplitMain
      id="brec"
      tone={coldMode ? 'cold' : 'primary'}
      hint={
        pending
          ? (control.pendingText ?? 'Starting the take…')
          : coldMode
            ? stop
              ? 'Stop the cold read (Space)'
              : 'Start a cold read (Space). Nothing is recorded.'
            : undefined
      }
      pending={pending}
      {...(disabled && !pending ? { 'aria-disabled': true } : {})}
      aria-describedby={pending ? undefined : reason ? describedBy : undefined}
      onClick={() => void toggle()}
    >
      {pending ? null : <Icon name={stop ? 'stop' : coldMode ? 'microphone' : 'record'} />}
      {stop ? 'Stop' : coldMode ? 'Cold read' : 'Record'}
    </SplitMain>
  );
}
