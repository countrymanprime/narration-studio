import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { Select } from '../../primitives/Select';
import { useTakeCompare, type TakeCompareArgs } from './useTakeCompare';

/**
 * Hear a line's takes one after another: Play every take in order, or two takes the narrator picks, A then B. The pickers start on the kept take
 * and the suggested one. Takes at different levels are not comparable, so the pickers say how far apart the two are. Nothing here keeps a take.
 */
export function TakeCompare(props: TakeCompareArgs) {
  const { passage } = props;
  const c = useTakeCompare(props);
  const options = passage.takes.map((t) => ({ value: t.id, label: t.label }));
  const notes = [...c.skipped, ...(c.abReason && passage.takes.length > 1 ? [c.abReason] : [])];
  return (
    <div
      role="group"
      aria-label="Compare takes"
      data-compare
      className="flex flex-col gap-1.5"
      onKeyDown={(event) => {
        // Escape stops a run in progress; with none it is left to the page (clear the selection, leave the text).
        if (event.key !== 'Escape' || !c.running) return;
        event.stopPropagation();
        c.stop();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          action="play"
          size="sm"
          label="Play every take"
          data-tall
          {...(c.everyReason ? { disabledReason: c.everyReason } : {})}
          onClick={c.playEvery}
        />
        {passage.takes.length > 1 ? (
          <>
            <Select label="First take to compare" value={c.aId} options={options} onChange={c.setA} />
            <Select label="Second take to compare" value={c.bId} options={options} onChange={c.setB} />
            <Button
              variant="secondary"
              size="sm"
              data-abplay
              aria-disabled={c.abReason ? true : undefined}
              title={c.abReason ?? undefined}
              onClick={() => (c.abReason ? undefined : c.playAB())}
            >
              A then B
            </Button>
          </>
        ) : null}
        {c.running ? <IconButton action="stop" size="sm" label="Stop comparing" data-tstop onClick={c.stop} /> : null}
      </div>
      {c.levelGap !== null && passage.takes.length > 1 ? (
        <span className="text-[var(--text-muted)]" data-compare-level>
          These two were recorded {c.levelGap.toFixed(1)} dB apart, so they are not comparable by loudness or noise.
        </span>
      ) : null}
      {notes.length > 0 ? (
        <span className="text-[var(--text-muted)]" role="status" data-compare-note>
          {notes.join(' ')}
        </span>
      ) : null}
    </div>
  );
}
