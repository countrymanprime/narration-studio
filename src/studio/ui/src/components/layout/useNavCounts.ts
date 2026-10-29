import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { openPickups } from '../pickups/list/pickupRows';
import { onPickupListChanged } from '../pickups/pickupListChanged';
import { CREDITS_FILE_CHAPTERS } from '../credits/creditsEntries';
import { masterByChapter } from '../production/usePipelineSources';
import { openPickupsBeyondNotes, proofProgress } from '../proof/proof.selectors';

/** The rail's count badges (mock 05: "14" on Proof, "9" on Pickups, and on Master & QC the chapters whose file fails a delivery check). A key is absent when the host has no count to give, and the
 * rail then draws no badge: a number is never made up. Story Bible has none: the open-query count it drew went with the query list
 * */
export type NavCounts = { proof?: number; pickups?: number; master?: number };

/**
 * What waits on each page, read from the host: the notes still open (Proof's summary, through the one `proofProgress` selector: not cleared, which is more than unreviewed) and the open lines of the Pickups page's list (`openPickups`, the same count Production and Schedule use) and the chapters whose measured file fails a check (the per-chapter verdict the Production pipeline's QC cell reads: `masterByChapter`; a chapter with no measured file is not counted). It reads again on
 * every page move and when Proof or Pickups announce a change, so a decision shows on the rail at once. It only reads the list; it never asks the DAW
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
    // The Proof page's whole-book head adds the pickups no note stands for; the badge counts the same, so the two never differ. A pickup list that
    // fails to read leaves the notes alone (the Pickups badge reports its own failure).
    const readProof = () =>
      Promise.all([
        api.findingsSummary(),
        api.pickupsList().then(
          (list) => openPickupsBeyondNotes(list.pickups),
          () => 0,
        ),
      ])
        .then(([summary, beyondNotes]) => set({ proof: proofProgress(summary, beyondNotes).open }))
        .catch(clear('proof'));
    void readProof();
    const readPickups = () =>
      api
        .pickupsList()
        .then((list) => set({ pickups: openPickups(list.pickups).length }))
        .catch(clear('pickups'));
    void readPickups();
    Promise.all([api.measureState(), api.manuscriptChapters()])
      .then(([job, chapters]) => {
        const byChapter = masterByChapter([...chapters, ...CREDITS_FILE_CHAPTERS], job.files);
        set({ master: Object.values(byChapter).filter((entry) => entry.qc === 'FAIL').length });
      })
      .catch(clear('master'));
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

  return counts;
}
