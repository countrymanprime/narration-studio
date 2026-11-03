import { Icon } from '../../primitives/Icon';
import { SplitMain } from '../../primitives/SplitButton';
import type { RecordControlState } from './useRecordControl';

/**
 * The Booth footer's Record / Stop button (the mock's `brec`), the main part of the footer's split button. The label is "Record" and "Stop" in every setup; which DAW records
 * is the setup chip's to say. While Record cannot start it looks off (`aria-disabled`) and is described by the reason, which the footer
 * draws as `#brec-why` beside it, but it stays pressable: the press opens the dialog that fixes the reason, or says it with an action.
 */
export function RecordControl({
  control,
  describedBy = 'brec-why',
}: {
  control: Pick<RecordControlState, 'recording' | 'disabled' | 'reason'> & { toggle: () => Promise<unknown> };
  describedBy?: string;
}) {
  const { recording, disabled, reason, toggle } = control;
  return (
    // `SplitMain` is as wide as "Record" in both states, so the timer beside it does not move when it becomes Stop (alignment audit XBO-25).
    <SplitMain id="brec" {...(disabled ? { 'aria-disabled': true } : {})} aria-describedby={reason ? describedBy : undefined} onClick={() => void toggle()}>
      <Icon name={recording ? 'stop' : 'record'} />
      {recording ? 'Stop' : 'Record'}
    </SplitMain>
  );
}
