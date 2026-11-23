import { useEffect, useMemo, useState } from 'react';
import type { MeasureJob } from '../../types';
import { useChapters } from '../../studio/useChapters';
import { useApi } from '../../api/ApiContext';
import { onPickupListChanged } from '../pickups/pickupListChanged';
import { masterByChapter } from '../production/usePipelineSources';
import { proofProgress } from '../proof/proof.selectors';

/** The rail's count badges (mock 05: "14" on Proof, "9" on Pickups, and on Master & QC the chapters whose file fails a delivery check). A key is absent when the host has no count to give, and the
 * rail then draws no badge: a number is never made up. Story Bible has none: the open-query count it drew went with the query list
 * */
export type NavCounts = { proof?: number; pickups?: number; master?: number };

/**
 * What waits on each page, read from the host: the notes still open (Proof's summary, through the one `proofProgress` selector: not cleared, which is more than unreviewed; pickups are not added) and the open lines of the Pickups page's list (the host's `pickupsOpenCount`, the count `openPickups` gives Production and Schedule) and the chapters whose measured file fails a check (the per-chapter verdict the Production pipeline's QC cell reads: `masterByChapter`; a chapter with no measured file is not counted). It reads again on
 * every page move and when Proof or Pickups announce a change, so a decision shows on the rail at once. It only reads the count; it never asks the DAW
 * to count. With no manuscript it reads nothing and gives no count.
 */
export function useNavCounts(pathname: string, hasManuscript = true): NavCounts {
  const api = useApi();
  const [counts, setCounts] = useState<NavCounts>({});
  // The failing files are the measurement's, paired with the chapter list every page shares (the store's slot), so a re-split or a rename moves the badge without a page move.
  const [job, setJob] = useState<MeasureJob>();
  const { chapters } = useChapters(hasManuscript);

  useEffect(() => {
    // With no manuscript the notes and pickups the host still holds are the previous manuscript's: no badge says they wait on anything (issue 1720).
    if (!hasManuscript) {
      setCounts({});
      setJob(undefined);
      return;
    }
    let active = true;
    const set = (patch: NavCounts) => active && setCounts((previous) => ({ ...previous, ...patch }));
    const clear = (key: keyof NavCounts) => () => set({ [key]: undefined });
    // The badge is the notes still open, the figure the Proof page draws as "Open". Pickups no note stands for have their own badge on Pickups.
    const readProof = () =>
      api
        .findingsSummary()
        .then((summary) => set({ proof: proofProgress(summary, 0).open }))
        .catch(clear('proof'));
    void readProof();
    const readPickups = () =>
      api
        .pickupsOpenCount()
        .then((count) => set({ pickups: count.open }))
        .catch(clear('pickups'));
    void readPickups();
    api
      .measureState()
      .then((next) => active && setJob(next))
      .catch(() => active && setJob(undefined));
    const unsubscribe = api.subscribePickups(() => {
      void readPickups();
      void readProof();
    });
    // A decision saved on Proof announces too, so the rail's two badges follow it without a page move.
    const unlisten = onPickupListChanged(() => {
      void readProof();
      void readPickups();
    });
    return () => {
      active = false;
      unsubscribe();
      unlisten();
    };
  }, [api, pathname, hasManuscript]);

  const master = useMemo(() => {
    if (!hasManuscript || !chapters || !job) return undefined;
    return Object.values(masterByChapter(chapters, job.files)).filter((entry) => entry.qc === 'FAIL').length;
  }, [hasManuscript, chapters, job]);
  return useMemo(() => (master === undefined ? counts : { ...counts, master }), [counts, master]);
}
