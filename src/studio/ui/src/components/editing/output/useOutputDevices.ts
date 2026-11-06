import { useCallback, useEffect, useRef, useState } from 'react';
import { listAudioOutputs, type OutputListing } from '../../voicesamples/audioOutputs';

export type DeviceListing = { phase: 'loading' } | ({ phase: 'ready'; checkedAt: number } & OutputListing);

/** This computer's outputs, read when the page opens, when the window gets focus and when the computer says one came or went; `refresh` reads them now. */
export function useOutputDevices(): { listing: DeviceListing; refresh: () => void } {
  const [listing, setListing] = useState<DeviceListing>({ phase: 'loading' });
  // Only the newest read is shown: an older answer that arrives late would put back a list from before an output was plugged in (qa-breaker B4).
  const latest = useRef(0);
  const refresh = useCallback(() => {
    const mine = ++latest.current;
    void listAudioOutputs().then((result) => mine === latest.current && setListing({ phase: 'ready', checkedAt: Date.now(), ...result }));
  }, []);
  useEffect(() => {
    refresh();
    const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    window.addEventListener('focus', refresh);
    devices?.addEventListener?.('devicechange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      devices?.removeEventListener?.('devicechange', refresh);
    };
  }, [refresh]);
  return { listing, refresh };
}
