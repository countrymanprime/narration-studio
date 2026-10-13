import { useEffect, useState } from 'react';
import type { PickupItem } from '../../api/contracts/pickups';
import { usePort } from '../../ports/usePort';
import { openPickups } from './list/pickupRows';

/**
 * The open lines of the Pickups page's own list (`pickupsList`, ADR 0840), or undefined until it is read or when it cannot be. Production's
 * tile and Next up and Schedule's pickup hours read pickups here, so they count the lines the Pickups page lists and never the DAW's
 * marker count. It reads again on every pickups event: a marker the DAW reports changes the list.
 */
export function useOpenPickups(): PickupItem[] | undefined {
  const pickups = usePort('pickups');
  const [open, setOpen] = useState<PickupItem[]>();
  useEffect(() => {
    let live = true;
    const read = () =>
      pickups.pickupsList().then(
        (list) => live && setOpen(openPickups(list.pickups)),
        () => live && setOpen(undefined),
      );
    void read();
    const unsubscribe = pickups.subscribePickups(() => void read());
    return () => {
      live = false;
      unsubscribe();
    };
  }, [pickups]);
  return open;
}
