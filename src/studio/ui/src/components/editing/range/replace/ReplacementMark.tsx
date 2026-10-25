import { Button } from '../../../primitives/Button';
import { Popover } from '../../../primitives/Popover';
import { clock } from '../../bar/clock';
import { useReplacementMark } from './replacementMarks';

const sec = (n: number): string => `${n.toFixed(2)} s`;
const db = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(1)} dB`;

/**
 * The mark after the last word of a replaced stretch (#2251): the other narrator's name, which opens what plays there (their stretch, its level and
 * the change in length) and Put my audio back. A replacement whose words changed since says so.
 */
export function ReplacementMark({ wordKey }: { wordKey: string }) {
  const mark = useReplacementMark(wordKey);
  if (!mark) return null;
  const { replacement: r, restore } = mark;
  return (
    <Popover
      side="bottom"
      align="start"
      fitToWindow
      label={`${r.narratorName}'s audio`}
      trigger={
        // native-control-ok: a name chip drawn inline in the script's text, smaller than Button.
        <button
          type="button"
          data-replacement-mark
          data-stale={r.stale ? '' : undefined}
          aria-label={`${r.narratorName}'s audio plays for the ${r.words.length === 1 ? 'word' : `${r.words.length} words`} before. Press Enter for details`}
          className={`mx-[0.15em] inline-flex cursor-pointer items-center rounded-full border px-1.5 align-[0.15em] font-mono text-[11px] leading-[1.4] focus-visible:outline-2 focus-visible:outline-[var(--focus)] ${
            r.stale ? 'border-dashed border-[var(--warn)] text-[var(--warn)]' : 'border-[var(--info)] bg-[var(--info-soft)] text-[var(--text)]'
          }`}
        >
          {r.narratorName}
        </button>
      }
    >
      <div className="flex max-w-[22rem] flex-col gap-2 p-1 text-sm" data-replacement-details>
        <p className="m-0">
          <strong>{r.narratorName}</strong>'s audio plays here in place of yours: “{r.words.join(' ')}”.
        </p>
        <p className="m-0 font-mono text-[var(--text-muted)]">
          Theirs {clock(r.sourceStart)} to {clock(r.sourceEnd)} · {sec(r.sourceEnd - r.sourceStart)} · {db(r.gainDb)}
          {r.measuredLufs !== null ? ` (from ${r.measuredLufs.toFixed(1)} to ${r.targetLufs.toFixed(0)} LUFS)` : ''}
        </p>
        {r.stale ? <p className="m-0 text-[var(--warn)]">The words changed since their audio was put here.</p> : null}
        <div>
          <Button type="button" variant="secondary" onClick={() => void restore(r)}>
            Put my audio back
          </Button>
        </div>
      </div>
    </Popover>
  );
}
