import { useCallback, useEffect, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';

export interface DawStatus {
  /** What the DAW said it can do, or null until it has answered (or when it could not). */
  caps: DawCapabilities | null;
  /** The sentence the banner shows when the DAW is not answering, else null. */
  off: string | null;
  /** Asks the DAW again. */
  retry: () => void;
}

/** The DAW-neutral name the banner uses: the DAW's own, or "The DAW" when the launch names none. */
const nameOf = (caps: DawCapabilities): string => (caps.daw === 'none' || caps.daw === 'Built-in' ? 'The DAW' : caps.daw);

/**
 * Whether the DAW answers, from `DawClient.capabilities`, asked again on Retry and on each capabilities event. When it does not, the sentence is
 * the capability's own (the record capability's message), else "<DAW> is not running." The built-in recorder always answers.
 */
export function useDawStatus(): DawStatus {
  const daw = usePort('daw');
  const events = usePort('dawCapabilities');
  const [caps, setCaps] = useState<DawCapabilities | null>(null);
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (c) => live && setCaps(c),
      () => live && setCaps(null),
    );
    return () => {
      live = false;
    };
  }, [daw, asked]);
  useEffect(() => events.subscribeDawCapabilities(() => setAsked((n) => n + 1)), [events]);

  const retry = useCallback(() => setAsked((n) => n + 1), []);
  const off = caps && !caps.reachable ? (caps.capabilities['record']?.message ?? `${nameOf(caps)} is not running.`) : null;
  return { caps, off, retry };
}
