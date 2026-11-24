import { useEffect, useMemo, useRef } from 'react';
import { overlay } from '../overlay/overlayService';

/**
 * The bookkeeping of a Retry offered for a play: `begin` counts a play asked and withdraws the Retry toast of the one before, and
 * `current(n)` is true only for the newest play while the page is still here, so a Retry for an older play, or pressed after the page
 * was left, plays nothing. Leaving the page withdraws the toast.
 */
export function useNewestPlay(topic: string): { begin: () => number; current: (n: number) => boolean } {
  const asked = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      overlay.dismissTopic(topic);
    };
  }, [topic]);
  // One object per topic, so a callback that lists it as a dependency is not rebuilt every render.
  return useMemo(
    () => ({
      begin: () => {
        overlay.dismissTopic(topic);
        return ++asked.current;
      },
      current: (n: number) => mounted.current && asked.current === n,
    }),
    [topic],
  );
}
