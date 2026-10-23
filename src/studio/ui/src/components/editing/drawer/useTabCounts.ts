import { useEffect, useState } from 'react';
import type { Finding } from '../../../api/contracts/findings';
import { usePort } from '../../../ports/usePort';
import { initialParams } from '../cleanup/cleanupOps';
import { countsOf } from '../cleanup/cleanupRows';
import { onCleanupChanged } from '../cleanup/cleanupChanged';

/** The audio findings the Clean up tab proposes, at the tab's own starting thresholds, summed over its five operations. */
export function proposalTotal(findings: readonly Finding[]): number {
  return Object.values(countsOf(findings, initialParams())).reduce((a, n) => a + n, 0);
}

/**
 * The two counts the drawer's tabs wear that the page does not already hold: the clean-up proposals of the chapter's audio (the tab adds the
 * flags to them), and the chapter's backups. Both are read from the ports the tabs read, so a tab and its label agree. A read that fails
 * leaves the count at 0; the tab itself says why.
 */
export function useTabCounts(chapterId: string, backups: boolean): { proposals: number; backups: number } {
  const findingsPort = usePort('findings');
  const editing = usePort('editing');
  const daw = usePort('daw');
  const [found, setFound] = useState<{ chapterId: string; n: number } | null>(null);
  const [kept, setKept] = useState<{ chapterId: string; n: number } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => onCleanupChanged(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    let live = true;
    Promise.all([findingsPort.findingsList({ chapterId }), editing.editingCandidates(chapterId)]).then(
      ([page, candidates]) => {
        if (!live) return;
        const seen = new Set<string>();
        const all = [...page.findings, ...candidates].filter((f) => !seen.has(f.id) && !!seen.add(f.id));
        setFound({ chapterId, n: proposalTotal(all) });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [findingsPort, editing, chapterId, version]);

  useEffect(() => {
    if (!backups) return;
    let live = true;
    daw.backups().then(
      (all) => live && setKept({ chapterId, n: all.filter((b) => b.chapterId === chapterId).length }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [daw, chapterId, backups, version]);

  return { proposals: found?.chapterId === chapterId ? found.n : 0, backups: kept?.chapterId === chapterId ? kept.n : 0 };
}
