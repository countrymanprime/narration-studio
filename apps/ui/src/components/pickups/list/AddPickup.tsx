import { useState } from 'react';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { Button } from '../../primitives/Button';
import { Field } from '../../primitives/Field';
import { parseClock, reasonSentence } from './pickupRows';

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
  /* What is wrong, said under the field it is about as well as in a toast (the toast is gone in five seconds); typing in the field clears it. */
  const [problem, setProblem] = useState<{ field: 'time' | 'line'; text: string } | null>(null);
  const refuse = (field: 'time' | 'line', text: string) => {
    setProblem({ field, text });
    overlay.toast(text);
  };

  const submit = async () => {
    if (!line.trim()) return refuse('line', 'Type the line first.');
    const seconds = parseClock(time);
    if (seconds === null) return refuse('time', 'Type the time like 05:12.0.');
    setProblem(null);
    setBusy(true);
    try {
      await onAdd(chapterId, seconds, line.trim());
      onDone();
    } catch (error) {
      overlay.toast(reasonSentence(error), { tone: 'error' });
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
      <Field
        label="Time in the recording"
        value={time}
        onChange={(value) => {
          setTime(value);
          if (problem?.field === 'time') setProblem(null);
        }}
        placeholder="05:12.0"
        error={problem?.field === 'time' ? problem.text : undefined}
      />
      <Field
        label="Line to re-record"
        value={line}
        onChange={(value) => {
          setLine(value);
          if (problem?.field === 'line') setProblem(null);
        }}
        placeholder="Start of the line"
        error={problem?.field === 'line' ? problem.text : undefined}
      />
      <Button type="submit" pending={busy}>
        Add pickup
      </Button>
    </form>
  );
}
