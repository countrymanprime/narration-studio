import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import type { RecordControlState } from './useRecordControl';

/**
 * The Booth footer's Record / Stop button (the mock's `brec`). The label is "Record" and "Stop" in every setup; which DAW records
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
    <Button id="brec" {...(disabled ? { 'aria-disabled': true } : {})} aria-describedby={reason ? describedBy : undefined} onClick={() => void toggle()}>
      <Icon name={recording ? 'stop' : 'record'} />
      {recording ? 'Stop' : 'Record'}
    </Button>
  );
}
