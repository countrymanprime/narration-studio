import { useCallback, useEffect, useRef, useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { listAudioOutputs, OUTPUT_TOAST_TOPIC, type OutputListing } from '../../voicesamples/audioOutputs';

export type DeviceListing = { phase: 'loading' } | ({ phase: 'ready'; checkedAt: number } & OutputListing);

/** What a press of Check again says besides the list's own refusal, for the pages that keep a saved output. */
export type OutputDevicesOptions = {
  /** The saved output's name, '' when none. */
  saved?: string;
  /** The sentence for a saved output that is not in the list. */
  missingSentence?: (saved: string) => string;
};

/**
 * This computer's outputs, read when the page opens, when the window gets focus and when the computer says one came or went; `refresh` reads them now.
 * The reads say nothing on their own (opening a page raises no toast about a detail the narrator did not touch); a press of Check again always
 * answers, as a toast, never as red text in the page (#4044): the list would not come, or the saved output is gone, again on every press.
 */
export function useOutputDevices(options: OutputDevicesOptions = {}): { listing: DeviceListing; refresh: () => void; watch: () => void } {
  const [listing, setListing] = useState<DeviceListing>({ phase: 'loading' });
  // Only the newest read is shown: an older answer that arrives late would put back a list from before an output was plugged in (qa-breaker B4).
  const latest = useRef(0);
  // A press whose read was overtaken by a newer read (focus, devicechange) is still answered by that newer read.
  const owed = useRef(false);
  const now = useRef(options);
  now.current = options;
  const read = useCallback((pressed: boolean) => {
    const mine = ++latest.current;
    if (pressed) owed.current = true;
    void listAudioOutputs().then((result) => {
      if (mine !== latest.current) return;
      const o = now.current;
      if (owed.current) {
        owed.current = false;
        if (result.status === 'unavailable') overlay.toast(result.message, { topic: OUTPUT_TOAST_TOPIC });
        else if (o.saved && o.missingSentence && !result.outputs.some((out) => out.label === o.saved))
          overlay.toast(o.missingSentence(o.saved), { topic: OUTPUT_TOAST_TOPIC });
      }
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
  return { listing, refresh, watch };
}
