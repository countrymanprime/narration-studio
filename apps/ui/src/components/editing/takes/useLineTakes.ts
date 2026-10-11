import { useCallback, useMemo, useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import type { EditingKeyHandlers } from '../keys/useEditingKeys';
import type { LinePassage, LineTake } from './types';

export interface LineTakesState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** The take the keys are on, or null. */
  onTake: string | null;
  /** The keys the Editing page binds: T and Shift+T walk the takes, Enter keeps the one the keys are on. */
  handlers: Required<Pick<EditingKeyHandlers, 'takes' | 'keep'>>;
}

const oneTake = 'This line has one take.';

/**
 * The open/closed state of a line's takes and the take the keys are on. T opens the takes and puts the keys on the active take; each T after moves
 * on and Shift+T goes back, round the ring. Enter keeps the take the keys are on (`keep`), or says it is kept already.
 */
export function useLineTakes(passage: LinePassage | null, keep: (passage: LinePassage, take: LineTake) => Promise<void>): LineTakesState {
  const [open, setOpen] = useState(false);
  const [onTake, setOnTake] = useState<string | null>(null);
  const takes = useMemo(() => passage?.takes ?? [], [passage]);

  const walk = useCallback(
    (d: 1 | -1) => {
      if (takes.length < 2) {
        overlay.toast(oneTake);
        return;
      }
      if (!open) {
        setOpen(true);
        setOnTake((takes.find((t) => t.active) ?? takes[0]).id);
        return;
      }
      const at = takes.findIndex((t) => t.id === onTake);
      setOnTake(takes[(at + d + takes.length) % takes.length].id);
    },
    [takes, open, onTake],
  );
  const keepOnKeys = useCallback(() => {
    if (!passage) return;
    const take = takes.find((t) => t.id === onTake) ?? takes.find((t) => t.active) ?? takes[0];
    if (take) void keep(passage, take);
  }, [passage, takes, onTake, keep]);

  return {
    open,
    setOpen,
    toggle: () => setOpen((o) => !o),
    onTake: open ? onTake : null,
    handlers: { takes: walk, keep: keepOnKeys },
  };
}
