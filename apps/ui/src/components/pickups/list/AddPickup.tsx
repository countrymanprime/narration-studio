import { useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { Button } from '../../primitives/Button';
import { Field } from '../../primitives/Field';
import { parseClock } from './pickupRows';

/**
 * The popover form of "Add a pickup by hand" (mock `AddPickup`): the time in the recording and the line to re-record, for the chapter in view.
 * It refuses an empty line before anything is sent; a host refusal keeps what was typed and says why, and success closes the popover.
 */
export function AddPickup({
  chapterId,
  chapterName,
  onAdd,
  onDone,
}: {
  chapterId: string;
  chapterName: string;
  /** Adds the line; rejects with the host's words when it refuses. */
  onAdd: (chapterId: string, time: number, line: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const overlay = useOverlay();
  const [time, setTime] = useState('');
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!line.trim()) {
      overlay.toast('Type the line first.');
      return;
    }
    const seconds = parseClock(time);
    if (seconds === null) {
      overlay.toast('Type the time like 05:12.0.');
      return;
    }
    setBusy(true);
    try {
      await onAdd(chapterId, seconds, line.trim());
      onDone();
    } catch (error) {
      overlay.toast(describeApiError(error), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex min-w-[18rem] flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <span className="text-[0.88rem] font-medium text-[var(--text-muted)]">{chapterName}</span>
      <Field label="Time in the recording" value={time} onChange={setTime} placeholder="05:12.0" />
      <Field label="Line to re-record" value={line} onChange={setLine} placeholder="Start of the line" />
      <Button type="submit" pending={busy}>
        Add pickup
      </Button>
    </form>
  );
}
