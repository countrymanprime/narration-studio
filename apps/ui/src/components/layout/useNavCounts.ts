import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { proofProgress } from '../proof/proof.selectors';

/** The rail's count badges (mock 05: "14" on Proof, "9" on Pickups). A key is absent when the host has no count to give, and the
 * rail then draws no badge: a number is never made up. Story Bible has none: the open-query count it drew went with the query list
 * (ADR 0792). */
export type NavCounts = { proof?: number; pickups?: number };

/**
 * What waits on each page, read from the host: the notes still open (Proof's summary, through the one `proofProgress` selector: not cleared, which is more than unreviewed) and the pickups REAPER last reported remaining. It reads again on
 * every page move, so a decision made on a page shows on the rail as the narrator leaves it. It only reads: the pickups count
 * is what REAPER last reported, and the hook never asks REAPER to count.
 */
export function useNavCounts(pathname: string): NavCounts {
  const api = useApi();
  const [counts, setCounts] = useState<NavCounts>({});

  useEffect(() => {
    let active = true;
    const set = (patch: NavCounts) => active && setCounts((previous) => ({ ...previous, ...patch }));
    const clear = (key: keyof NavCounts) => () => set({ [key]: undefined });
    api
      .findingsSummary()
      .then((summary) => set({ proof: proofProgress(summary, 0).open }))
      .catch(clear('proof'));
    api
      .pickupsState()
      .then((state) => set({ pickups: state.remaining }))
      .catch(clear('pickups'));
    const unsubscribe = api.subscribePickups((state) => set({ pickups: state.remaining }));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api, pathname]);

  return counts;
}
