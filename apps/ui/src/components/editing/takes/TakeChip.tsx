import type { KeyboardEventHandler } from 'react';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import { StatusBadge } from '../../primitives/StatusBadge';
import type { LinePassage } from './types';

/**
 * The chip under a line that has more than one take: how many, which is active, and whether one is chosen. It opens the takes in place. A line
 * with one take or none has no chip. `keptId` is the take the DAW said it kept; nothing is "kept" before it does.
 */
export function TakeChip({
  passage,
  open,
  keptId,
  controls,
  tabbable = true,
  onToggle,
  onKeyDown,
}: {
  passage: LinePassage;
  open: boolean;
  keptId: string | null;
  controls?: string;
  /** A page with many lines keeps one chip in the Tab order (the line the cursor is on) and leaves the rest to T and the pointer. */
  tabbable?: boolean;
  onToggle: () => void;
  /** Escape while the takes are open: the page folds them and keeps focus here. */
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
}) {
  const n = passage.takes.length;
  if (n < 2) return null;
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
      <b>{n} takes</b>
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {passage.takes.map((t) => (
          <i key={t.id} className={`size-1.5 rounded-full ${t.active ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]'}`} />
        ))}
      </span>
      {active ? <span className="font-['IBM_Plex_Mono',ui-monospace,monospace]">{active.label}</span> : null}
      {keptId ? <StatusBadge tone="success" label="Kept" shape="tag" /> : <StatusBadge tone="neutral" label="To choose" shape="tag" />}
      <Icon name={open ? 'previous' : 'next'} />
    </Button>
  );
}
