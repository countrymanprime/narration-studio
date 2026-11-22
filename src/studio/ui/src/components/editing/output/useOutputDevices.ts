import { useCallback, useEffect, useRef, useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { listAudioOutputs, type OutputListing } from '../../voicesamples/audioOutputs';

export type DeviceListing = { phase: 'loading' } | ({ phase: 'ready'; checkedAt: number } & OutputListing);

/** What the list says besides its own refusal, for the pages that keep a saved output. */
export type OutputDevicesOptions = {
  /** The saved output's name, '' when none. */
  saved?: string;
  /** The sentence for a saved output that is not in the list. */
  missingSentence?: (saved: string) => string;
  /** Says a missing saved output as soon as it is found, not only when Check again is pressed (the Settings row has no other notice). */
  missingAtOnce?: boolean;
  /** False while the page does not use the list (a DAW's own output): nothing is said. */
  announce?: boolean;
};

/**
 * This computer's outputs, read when the page opens, when the window gets focus and when the computer says one came or went; `refresh` reads them now.
 * A refusal (the list would not come, or the saved output is gone) is said as a toast, never as red text in the page (#4044): once when it starts, and
 * again on every press of Check again, so a press never looks dead.
 */
export function useOutputDevices(options: OutputDevicesOptions = {}): { listing: DeviceListing; refresh: () => void; watch: () => void } {
  const [listing, setListing] = useState<DeviceListing>({ phase: 'loading' });
  // Only the newest read is shown: an older answer that arrives late would put back a list from before an output was plugged in (qa-breaker B4).
  const latest = useRef(0);
  const said = useRef<string | null>(null);
  const now = useRef(options);
  now.current = options;
  const read = useCallback((pressed: boolean) => {
    const mine = ++latest.current;
    void listAudioOutputs().then((result) => {
      if (mine !== latest.current) return;
      const o = now.current;
      let sentence: string | null = null;
      if (o.announce !== false) {
        if (result.status === 'unavailable') sentence = result.message;
        else if (o.saved && o.missingSentence && !result.outputs.some((out) => out.label === o.saved) && (pressed || o.missingAtOnce))
          sentence = o.missingSentence(o.saved);
      }
      if (sentence && (pressed || sentence !== said.current)) overlay.toast(sentence);
      said.current = sentence;
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
