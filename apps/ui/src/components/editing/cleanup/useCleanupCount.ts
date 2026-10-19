import { useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import { initialParams } from './cleanupOps';
import { countsOf } from './cleanupRows';
import { readFindings } from './readFindings';

/** How many findings are left to fix across every operation at the thresholds the tab opens with. */
export const totalOf = (counts: Record<string, number>): number => Object.values(counts).reduce((a, n) => a + n, 0);

/**
 * What the drawer's Clean up tab counts besides the words flagged in the text: the clean-up findings still to fix (gaps, breaths, clicks, plosives and
 * noise) at the default thresholds. Zero until they are read, and when they cannot be. `again` is what makes the page read them anew (the cuts changed).
 */
export function useCleanupCount(chapterId: string, again: unknown): number {
  const findings = usePort('findings');
  const editing = usePort('editing');
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    readFindings(findings, editing, chapterId).then(
      (all) => live && setCount(totalOf(countsOf(all, initialParams()))),
      () => live && setCount(0),
    );
    return () => {
      live = false;
    };
  }, [findings, editing, chapterId, again]);
  return count;
}
