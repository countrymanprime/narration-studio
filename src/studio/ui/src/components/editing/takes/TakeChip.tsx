import type { KeyboardEventHandler } from 'react';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import { statusLabel, statusTone } from '../../../kinds/statusTone';
import { KindChip } from '../../primitives/KindChip';
import { StatusBadge } from '../../primitives/StatusBadge';
import type { LinePassage } from './types';
import { plural } from '../../../plural';

/**
 * The chip under a line that has takes, one take included: how many, which one it names (the kept take, else the one the DAW has active), and where the choice stands (Kept, Stacked, Duplicate read
 * or To choose). It opens the takes in place. A line with no takes has no chip. `keptId` is the take the DAW said it kept; nothing is "kept"
 * before it does.
 */
export function TakeChip({
  passage,
  open,
  keptId,
  controls,
  tabbable = true,
  stacked = false,
  duplicate = false,
  onToggle,
  onKeyDown,
}: {
  passage: LinePassage;
  open: boolean;
  keptId: string | null;
  controls?: string;
  /** A page with many lines keeps one chip in the Tab order (the line the cursor is on) and leaves the rest to T and the pointer. */
  tabbable?: boolean;
  /** The line's later reads sit on the first read's spot (a stack record exists). */
  stacked?: boolean;
  /** The line's take reads it twice and has not been split yet. */
  duplicate?: boolean;
  onToggle: () => void;
  /** Escape while the takes are open: the page folds them and keeps focus here. */
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
}) {
  const n = passage.takes.length;
  if (n < 1) return null;
  // The take the chip names is the kept one: a keep made here shows at once, before the lines are read again with the DAW's new active take.
  const active = (keptId ? passage.takes.find((t) => t.id === keptId) : undefined) ?? passage.takes.find((t) => t.active);
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-expanded={open}
      aria-controls={controls}
      data-tchip={passage.id}
      className="max-w-full overflow-hidden [&>*]:whitespace-nowrap"
      tabIndex={tabbable ? undefined : -1}
      onClick={onToggle}
      onKeyDown={onKeyDown}
    >
      <Icon name="wave" />
      <b>{plural(n, 'take')}</b>
      <span aria-hidden="true" className="inline-flex gap-0.5 max-[30rem]:hidden">
        {passage.takes.map((t) => (
          <i
            key={t.id}
            className={`block h-1.5 w-3.5 rounded-[3px] border-[1.5px] ${t.id === active?.id ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--line-strong)]'}`}
          />
        ))}
      </span>
      {/* The name stays at every width, ending in an ellipsis when it is long, so the badge and the chevron are never pushed out of the chip. */}
      {active && active.label.trim() !== '' ? (
        <span className="max-w-[14rem] min-w-0 truncate font-['IBM_Plex_Mono',ui-monospace,monospace]" title={active.label}>
          {active.label}
        </span>
      ) : null}
      {keptId ? (
        <StatusBadge tone={statusTone('kept_take')} label={statusLabel('kept_take')} shape="tag" />
      ) : stacked ? (
        <StatusBadge tone={statusTone('stacked_take')} label={statusLabel('stacked_take')} shape="tag" />
      ) : duplicate ? (
        <KindChip kind="repeat" label="Duplicate read" shape="tag" />
      ) : (
        <StatusBadge tone={statusTone('waiting')} label="To choose" shape="tag" />
      )}
      <Icon name={open ? 'previous' : 'next'} />
    </Button>
  );
}
