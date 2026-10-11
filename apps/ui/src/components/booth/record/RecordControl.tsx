import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import type { RecordControlState } from './useRecordControl';

/**
 * The Booth footer's Record / Stop button (the mock's `brec`). The label is "Record" and "Stop" in every setup; which DAW records
 * is the setup chip's to say. While Record cannot start it is disabled and described by the reason, which the footer draws as
 * `#brec-why` beside it.
 */
export function RecordControl({
  control,
  describedBy = 'brec-why',
}: {
  control: Pick<RecordControlState, 'recording' | 'disabled' | 'reason' | 'toggle'>;
  describedBy?: string;
}) {
  const { recording, disabled, reason, toggle } = control;
  return (
    <Button id="brec" disabled={disabled} aria-describedby={reason ? describedBy : undefined} onClick={() => void toggle()}>
      <Icon name={recording ? 'stop' : 'record'} />
      {recording ? 'Stop' : 'Record'}
    </Button>
  );
}
