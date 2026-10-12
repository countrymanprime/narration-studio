import { useEffect, useMemo, useState } from 'react';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';
import type { CleanupDeps, RangeTrim } from './cleanupApply';

/** Why a gap cannot be trimmed from here: the DAW port cuts words by alignment token, not an item by seconds, and the cuts hold words. */
export const NO_TRIM = 'Trimming a gap needs a range trim by item that the app does not have yet, so nothing was changed.';

const available = (caps: DawCapabilities, key: string): boolean => caps.capabilities[key]?.available === true;

/**
 * The DAW calls Clean up needs, built from the `daw` port and lent by the page. `reduce` is lent only where the DAW reports `range_gain`
 * and `repair` only where it reports `click_repair`; the tab turns an operation's Apply off with the capability's sentence otherwise.
 * Undefined until the DAW has answered, and when it cannot.
 */
export function useCleanupDeps(): CleanupDeps | undefined {
  const daw = usePort('daw');
  const [caps, setCaps] = useState<DawCapabilities | null>(null);
  useEffect(() => {
    let live = true;
    setCaps(null);
    daw.capabilities().then(
      (answer) => live && setCaps(answer),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [daw]);
  const reducible = caps ? available(caps, 'range_gain') : false;
  const repairable = caps ? available(caps, 'click_repair') : false;
  return useMemo(() => {
    if (!caps) return undefined;
    const refuse = (): Promise<DawResult> => Promise.resolve({ ok: false, changed: false, message: NO_TRIM, undoSteps: 0, refused: NO_TRIM });
    return {
      trim: (_trim: RangeTrim) => refuse(),
      record: () => Promise.reject(new Error(NO_TRIM)),
      ...(reducible ? { reduce: (request) => daw.reduceRangeGain(request) } : {}),
      ...(repairable ? { repair: (request) => daw.repairClick(request) } : {}),
    } satisfies CleanupDeps;
  }, [daw, caps !== null, reducible, repairable]); // eslint-disable-line react-hooks/exhaustive-deps
}
