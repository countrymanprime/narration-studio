import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { openPickups } from '../pickups/list/pickupRows';
import { onPickupListChanged } from '../pickups/pickupListChanged';
import { proofProgress } from '../proof/proof.selectors';

/** The rail's count badges (mock 05: "14" on Proof, "9" on Pickups). A key is absent when the host has no count to give, and the
 * rail then draws no badge: a number is never made up. Story Bible has none: the open-query count it drew went with the query list
 * (ADR 0792). */
export type NavCounts = { proof?: number; pickups?: number };

/**
 * What waits on each page, read from the host: the notes still open (Proof's summary, through the one `proofProgress` selector: not cleared, which is more than unreviewed) and the open lines of the Pickups page's list (`openPickups`, the same count Production and Schedule use). It reads again on
 * every page move, so a decision made on a page shows on the rail as the narrator leaves it. It only reads the list; it never asks the DAW
 * to count. With no manuscript it reads nothing and gives no count.
 */
export function useNavCounts(pathname: string, hasManuscript = true): NavCounts {
  const api = useApi();
  const [counts, setCounts] = useState<NavCounts>({});

  useEffect(() => {
    // With no manuscript the notes and pickups the host still holds are the previous manuscript's: no badge says they wait on anything (issue 1720).
    if (!hasManuscript) {
      setCounts({});
      return;
    }
    let active = true;
    const set = (patch: NavCounts) => active && setCounts((previous) => ({ ...previous, ...patch }));
    const clear = (key: keyof NavCounts) => () => set({ [key]: undefined });
    api
      .findingsSummary()
      .then((summary) => set({ proof: proofProgress(summary, 0).open }))
      .catch(clear('proof'));
    const readPickups = () =>
      api
        .pickupsList()
        .then((list) => set({ pickups: openPickups(list.pickups).length }))
        .catch(clear('pickups'));
    void readPickups();
    const unsubscribe = api.subscribePickups(() => void readPickups());
    const unlisten = onPickupListChanged(() => void readPickups());
    return () => {
      active = false;
      unsubscribe();
      unlisten();
    };
  }, [api, pathname, hasManuscript]);

  return counts;
}
