import { useState } from 'react';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { Button } from '../../primitives/Button';
import { Field } from '../../primitives/Field';
import { Select } from '../../primitives/Select';
import { IconButton } from '../../primitives/IconButton';
import { clock, parseClock, PICKUP_LINE_MAX, reasonSentence } from './pickupRows';

/**
 * The popover form of "Add a pickup by hand" (mock `AddPickup`): the time in the recording and the line to re-record, for the chapter in view.
 * It refuses an empty line or an unusable time before anything is sent, saying so under that field only; a host refusal keeps what was typed and says why in a toast, and success closes the popover.
 */
export function AddPickup({
  chapterId,
  chapterName,
  choices,
  onAdd,
  onDone,
}: {
  chapterId: string;
  chapterName: string;
  /** The chapters to pick from when the page shows every chapter; with none, the line goes to `chapterId`. */
  choices?: readonly { id: string; name: string }[];
  /** Adds the line; rejects with the host's words when it refuses. */
  onAdd: (chapterId: string, time: number, line: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const overlay = useOverlay();
  const [time, setTime] = useState('');
  const [line, setLine] = useState('');
  const [chosen, setChosen] = useState(chapterId);
  const [busy, setBusy] = useState(false);
  /* What is wrong, said once: under the field it is about, which the popover holds (rule 7: one surface, never the toast as well), marks it invalid and describes it;
     typing in the field clears it. */
  const [problem, setProblem] = useState<{ field: 'time' | 'line'; text: string } | null>(null);
  const refuse = (field: 'time' | 'line', text: string) => setProblem({ field, text });

  const submit = async () => {
    if (!line.trim()) return refuse('line', 'Type the line first.');
    if ([...line.trim()].length > PICKUP_LINE_MAX) return refuse('line', `A line can be at most ${PICKUP_LINE_MAX} characters.`);
    const seconds = parseClock(time);
    if (seconds === null) return refuse('time', 'Type the time like 05:12.0.');
    setProblem(null);
    setBusy(true);
    try {
      await onAdd(choices ? chosen : chapterId, seconds, line.trim());
      onDone();
    } catch (error) {
      overlay.toast(reasonSentence(error), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    /* As wide as 18 rem, never wider than the window less the popover's margins (XPK-9). */
    <form
      className="flex w-[min(18rem,calc(100vw-3rem))] flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {/* A title and a way out, then where the line goes: the chapter is the target, not a heading (XPK-9, R3PK-5). */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[0.9375rem] font-semibold">Add a pickup</h2>
        <IconButton action="close" label="Close" size="sm" onClick={onDone} />
      </div>
      {choices && choices.length > 1 ? (
        <Select label="Chapter" fullWidth value={chosen} onChange={setChosen} options={choices.map((c) => ({ value: c.id, label: c.name }))} />
      ) : (
        <p className="m-0 text-[0.8125rem] text-[var(--text-muted)]">
          To <span className="font-semibold text-[var(--text)]">{chapterName}</span>
        </p>
      )}
      {/* Focus starts in the time, as before the popover had a Close ahead of it. */}
      <Field
        autoFocus
        label="Time in the recording"
        value={time}
        onChange={(value) => {
          setTime(value);
          if (problem?.field === 'time') setProblem(null);
        }}
        /* The format, not a time: a sample such as 05:12.0 in the box's muted text reads as a value already typed. */
        placeholder="mm:ss.s"
        /* A time such as 5:12 is shown as the form it is kept in (05:12.0), so the rewrite is seen and not silent. */
        onBlur={() => {
          const seconds = parseClock(time);
          if (seconds !== null) setTime(clock(seconds));
        }}
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
