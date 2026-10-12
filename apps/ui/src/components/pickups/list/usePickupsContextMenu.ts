import { useMemo, useRef } from 'react';
import { useContextProvider, type ContextProvider } from '../../../registries/context';
import type { ContextMenuItem } from '../../primitives/ContextMenu';
import type { PickupItem } from '../../../api/contracts/pickups';

/** The attribute a pickup row carries: its pickup's id. */
export const PICKUP_ROW = 'data-pk';

export type PickupMenuActions = {
  onSetIncluded: (id: string, included: boolean) => unknown;
  onSetDone: (id: string, done: boolean) => unknown;
  onRemove: (id: string) => unknown;
  onOpenInBooth: (pickups: PickupItem[]) => void;
  onOpenInScript: (chapterId: string) => void;
  /** Goes to the note the pickup came from, in Proof. */
  onGoToNote: (pickup: PickupItem) => void;
};

/** The right-click menu of a pickup row (mock `registerContext` for the Pickups page); it matches a pickup row and nothing else. */
function pickupMenuItems(pickup: PickupItem, actions: PickupMenuActions): ContextMenuItem[] {
  return [
    {
      key: 'pickup-include',
      label: pickup.included ? 'Leave out of the session' : 'Include in the session',
      unavailable: pickup.done ? 'Recorded lines are not in a session.' : undefined,
      onSelect: () => void actions.onSetIncluded(pickup.id, !pickup.included),
    },
    { key: 'pickup-booth', label: 'Open in Booth at this line', onSelect: () => actions.onOpenInBooth([pickup]) },
    { key: 'pickup-script', label: 'Open this chapter in Script', onSelect: () => actions.onOpenInScript(pickup.chapterId) },
    { key: 'pickup-done', label: pickup.done ? 'Mark open again' : 'Mark recorded', onSelect: () => void actions.onSetDone(pickup.id, !pickup.done) },
    { key: 'pickup-remove', label: 'Remove from pickups', onSelect: () => void actions.onRemove(pickup.id) },
    {
      key: 'pickup-note',
      label: 'Go to the note in Proof',
      unavailable: pickup.findingId ? undefined : 'This line did not come from a note in Proof.',
      onSelect: () => actions.onGoToNote(pickup),
    },
  ];
}

/** Registers the row menu while the list is mounted. `pickups` and `actions` are read at the moment the menu opens. */
export function usePickupsContextMenu(pickups: readonly PickupItem[], actions: PickupMenuActions): void {
  const live = useRef({ pickups, actions });
  live.current = { pickups, actions };
  const provider = useMemo<ContextProvider>(() => {
    const row = (target: Element): HTMLElement | null => target.closest<HTMLElement>(`[${PICKUP_ROW}]`);
    const find = (target: Element): PickupItem | undefined => live.current.pickups.find((p) => p.id === row(target)?.getAttribute(PICKUP_ROW));
    return {
      match: (target) => find(target) !== undefined,
      items: (target) => {
        const pickup = find(target);
        return pickup ? pickupMenuItems(pickup, live.current.actions) : [];
      },
    };
  }, []);
  useContextProvider(provider);
}
