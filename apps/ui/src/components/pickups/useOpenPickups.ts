import { useEffect, useMemo, useState } from 'react';
import type { PickupItem } from '../../api/contracts/pickups';
import { usePort } from '../../ports/usePort';
import { openPickups } from './list/pickupRows';

/**
 * The Pickups page's own list (`pickupsList`, ADR 0840), or undefined until it is read or when it cannot be. Every count of pickups outside that page (Production's
 * tile, Next up and pipeline, Schedule's pickup hours, the Booth companion, the recording check) reads it here, so they count the lines the Pickups page lists and never the DAW's
 * marker count. It reads again on every pickups event: a marker the DAW reports changes the list.
 */
export function usePickupList(): PickupItem[] | undefined {
  const pickups = usePort('pickups');
  const [list, setList] = useState<PickupItem[]>();
  useEffect(() => {
    let live = true;
    const read = () =>
      pickups.pickupsList().then(
        (next) => live && setList(next.pickups),
        () => live && setList(undefined),
      );
    void read();
    const unsubscribe = pickups.subscribePickups(() => void read());
    return () => {
      live = false;
      unsubscribe();
    };
  }, [pickups]);
  return list;
}

/** The open lines of that list (`openPickups`), or undefined while it is unknown. */
export function useOpenPickups(): PickupItem[] | undefined {
  const all = usePickupList();
  return useMemo(() => (all ? openPickups(all) : undefined), [all]);
}
