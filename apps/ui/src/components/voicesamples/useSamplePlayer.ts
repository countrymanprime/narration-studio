import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { overlay } from '../../overlay/overlayService';
import { usePort } from '../../ports/usePort';
import {
  NOT_WHILE_RECORDING,
  playSample,
  samplePlayerState,
  stopSample,
  stopSampleOf,
  subscribeSamplePlayer,
  type SamplePlayerState,
  type SampleReport,
} from './samplePlayerStore';

/**
 * What the page knows about the recorder. `recording` is `control.recording`. `cantTell` is the page's sentence when it cannot tell
 * whether a take is recording (a DAW is configured and silent): a sample is refused with it, because a clip through the speakers reaches
 * the microphone of a take that may be running. A page that has no recorder, such as the Story Bible, passes none and a sample plays.
 */
type RecorderGuard = { recording: boolean; cantTell?: string };

export type SamplePlayerOptions = {
  guard?: RecorderGuard;
  /** Where a refusal or a failed load is said; defaults to a toast. */
  notify?: SampleReport;
};

export type SamplePlayer = SamplePlayerState & {
  /** Plays the sample from the start, or restarts it when it is the one playing. Returns false, and says why, when the recorder guard refuses. */
  play: (id: string, options?: { name?: string }) => boolean;
  stop: () => void;
  /** Whether this sample is the one loading or playing. */
  isActive: (id: string) => boolean;
};

const toast: SampleReport = (text, tone) => overlay.toast(text, tone ? { tone } : undefined);

/**
 * The page's handle on the one shared voice-sample player (`samplePlayerStore`): one `Audio`, one sample at a time. A new play stops
 * the last, the same sample again restarts it, Esc stops it, and a failed load returns to idle and says why. It refuses while a take is
 * recording or the recorder cannot be read, and stops a sample that is playing when a take starts. The sample this page started stops
 * when the page unmounts, so call it once per page and pass the handle down.
 */
export function useSamplePlayer({ guard, notify = toast }: SamplePlayerOptions = {}): SamplePlayer {
  const { voiceSampleMediaUrl } = usePort('voiceSamples');
  const state = useSyncExternalStore(subscribeSamplePlayer, samplePlayerState);
  const self = useMemo(() => Symbol('sample player'), []);
  const live = useRef({ guard, notify, voiceSampleMediaUrl });
  useEffect(() => {
    live.current = { guard, notify, voiceSampleMediaUrl };
  });

  const recording = guard?.recording === true;
  useEffect(() => {
    if (recording) stopSampleOf(self);
  }, [recording, self]);
  useEffect(() => () => stopSampleOf(self), [self]);

  const play = useCallback(
    (id: string, options?: { name?: string }): boolean => {
      const { guard: now, notify: say, voiceSampleMediaUrl: urlOf } = live.current;
      const refusal = now?.recording ? NOT_WHILE_RECORDING : now?.cantTell;
      if (refusal) {
        say(refusal);
        return false;
      }
      playSample(id, { by: self, url: urlOf(id), name: options?.name, report: say });
      return true;
    },
    [self],
  );
  const isActive = useCallback((id: string) => state.id === id, [state.id]);

  return { ...state, play, stop: stopSample, isActive };
}
