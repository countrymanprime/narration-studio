import type { KeyboardEventHandler } from 'react';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import { statusLabel, statusTone } from '../../../kinds/statusTone';
import { StatusBadge } from '../../primitives/StatusBadge';
import type { LinePassage } from './types';

/**
 * The chip under a line that has takes, a line with one take included: how many, which is active, and where the line stands (Kept, Stacked, a take that
 * reads the line twice, or still To choose). It opens the takes in place. A line with no take has no chip. `keptId` is the take the DAW said it
 * kept; nothing is "kept" before it does.
 */
export function TakeChip({
  passage,
  open,
  keptId,
  stacked = false,
  duplicate = false,
  controls,
  tabbable = true,
  onToggle,
  onKeyDown,
}: {
  passage: LinePassage;
  open: boolean;
  keptId: string | null;
  /** The line's later takes sit on the first read's spot. */
  stacked?: boolean;
  /** A take reads the line twice (`doubledCut`). */
  duplicate?: boolean;
  controls?: string;
  /** A page with many lines keeps one chip in the Tab order (the line the cursor is on) and leaves the rest to T and the pointer. */
  tabbable?: boolean;
  onToggle: () => void;
  /** Escape while the takes are open: the page folds them and keeps focus here. */
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
}) {
  const n = passage.takes.length;
  if (n < 1) return null;
  const active = passage.takes.find((t) => t.active);
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-expanded={open}
      aria-controls={controls}
      data-tchip={passage.id}
      tabIndex={tabbable ? undefined : -1}
      onClick={onToggle}
      onKeyDown={onKeyDown}
    >
      <Icon name="wave" />
      <b>
        {n} {n === 1 ? 'take' : 'takes'}
      </b>
      <span aria-hidden="true" data-tpips className="inline-flex gap-[3px]">
        {passage.takes.map((t) => (
          <i key={t.id} className={`block h-1.5 w-3.5 rounded-[3px] border-[1.5px] border-[var(--org)] ${t.active ? 'bg-[var(--org)]' : ''}`} />
        ))}
      </span>
      {active ? <span className="font-['IBM_Plex_Mono',ui-monospace,monospace]">{active.label}</span> : null}
      {keptId ? (
        <StatusBadge tone={statusTone('kept_take')} label={statusLabel('kept_take')} shape="tag" />
      ) : stacked ? (
        <StatusBadge tone="org" label="Stacked" shape="tag" />
      ) : duplicate ? (
        <StatusBadge tone="org" label="Duplicate read" shape="tag" />
      ) : (
        <StatusBadge tone={statusTone('waiting')} label="To choose" shape="tag" />
      )}
      <Icon name={open ? 'previous' : 'next'} />
    </Button>
  );
}
