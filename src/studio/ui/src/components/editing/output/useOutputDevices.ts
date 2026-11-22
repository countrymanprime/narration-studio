import { useCallback, useEffect, useRef, useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { listAudioOutputs, type OutputListing } from '../../voicesamples/audioOutputs';

export type DeviceListing = { phase: 'loading' } | ({ phase: 'ready'; checkedAt: number } & OutputListing);

/** This computer's outputs, read when the page opens, when the window gets focus and when the computer says one came or went; `refresh` reads them now. */
export function useOutputDevices(): { listing: DeviceListing; refresh: () => void } {
  const [listing, setListing] = useState<DeviceListing>({ phase: 'loading' });
  // Only the newest read is shown: an older answer that arrives late would put back a list from before an output was plugged in (qa-breaker B4).
  const latest = useRef(0);
  // The refusal is said once when the list turns unavailable, not on every read and not on every open of the popover (#4044).
  const wasUnavailable = useRef(false);
  const read = useCallback((pressed: boolean) => {
    const mine = ++latest.current;
    void listAudioOutputs().then((result) => {
      if (mine !== latest.current) return;
      // A press of Check again always answers, even when the list is still unavailable (rule 9).
      if (result.status === 'unavailable' && (pressed || !wasUnavailable.current)) overlay.toast(result.message);
      wasUnavailable.current = result.status === 'unavailable';
      setListing({ phase: 'ready', checkedAt: Date.now(), ...result });
    });
  }, []);
  const watch = useCallback(() => read(false), [read]);
  const refresh = useCallback(() => read(true), [read]);
  useEffect(() => {
    watch();
    const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    window.addEventListener('focus', watch);
    devices?.addEventListener?.('devicechange', watch);
    return () => {
      window.removeEventListener('focus', watch);
      devices?.removeEventListener?.('devicechange', watch);
    };
  }, [watch]);
  return { listing, refresh };
}
