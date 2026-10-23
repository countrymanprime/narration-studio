import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import type { VoiceSamples } from '../../api/contracts/voiceSamples';
import { usePort } from '../../ports/usePort';

/**
 * What a page knows of the project's voice samples. `failed` keeps the last list that was read, so a row the narrator was looking at does
 * not vanish because a re-read failed; the message says what the host answered.
 */
export type VoiceSamplesRead =
  { status: 'loading' } | { status: 'ready'; samples: VoiceSamples } | { status: 'failed'; message: string; samples?: VoiceSamples };

/**
 * The project's voice samples, read once when the page opens and again on every `voice_samples_changed` (a mark in Editing, a delete in
 * another window) and when `refresh` is called ("Check again": the host looks at each clip's file again). A slow read that settles after a
 * newer one is dropped, so an old list never replaces a new one.
 */
export function useVoiceSamples(): { read: VoiceSamplesRead; refresh: () => Promise<void> } {
  const port = usePort('voiceSamples');
  const [read, setRead] = useState<VoiceSamplesRead>({ status: 'loading' });
  const latest = useRef(0);
  const last = useRef<VoiceSamples | undefined>(undefined);

  const refresh = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const samples = await port.voiceSamplesList();
      if (mine !== latest.current) return;
      last.current = samples;
      setRead({ status: 'ready', samples });
    } catch (error) {
      if (mine !== latest.current) return;
      setRead({ status: 'failed', message: apiErrorMessage(error), ...(last.current ? { samples: last.current } : {}) });
    }
  }, [port]);

  useEffect(() => {
    void refresh();
    const unsubscribe = port.subscribeVoiceSamples(() => void refresh());
    return () => {
      unsubscribe();
      // A read still in flight belongs to a page that has gone.
      latest.current += 1;
    };
  }, [port, refresh]);

  return { read, refresh };
}
