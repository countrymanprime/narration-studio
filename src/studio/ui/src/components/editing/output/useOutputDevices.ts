import { useCallback, useEffect, useState } from 'react';
import { listAudioOutputs, type OutputListing } from '../../voicesamples/audioOutputs';

export type DeviceListing = { phase: 'loading' } | ({ phase: 'ready'; checkedAt: number } & OutputListing);

/** This computer's outputs, read when the page opens, when the window gets focus and when the computer says one came or went; `refresh` reads them now. */
export function useOutputDevices(): { listing: DeviceListing; refresh: () => void } {
  const [listing, setListing] = useState<DeviceListing>({ phase: 'loading' });
  const refresh = useCallback(() => {
    void listAudioOutputs().then((result) => setListing({ phase: 'ready', checkedAt: Date.now(), ...result }));
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
