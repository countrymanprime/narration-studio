// What the narrator chose for the sound the Editing page plays: the volume, mute, speed and output device. Kept by this browser window, as the
// take tone and the reader's preferences are (storage can be missing or blocked, and then the choices hold for the window only). The device is kept
// by name, not by id, for the reason `voicesamples/audioOutputs.ts` gives.
import { useCallback, useEffect, useState } from 'react';
import { setOutput } from '../voicesamples/audioOutputs';

export type OutputPrefs = {
  /** 0 to 100. A media element cannot play louder than its file, so 100 is the recording as it is. */
  volume: number;
  muted: boolean;
  /** Playback speed with the pitch kept. */
  rate: number;
  /** The output's name from the computer's list; '' is the system default. */
  device: string;
};

export const RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export const DEFAULT_OUTPUT: OutputPrefs = { volume: 100, muted: false, rate: 1, device: '' };
export const OUTPUT_STORAGE_KEY = 'narration-ui-editing-output';

/** "1×", "1.25×". */
export const rateLabel = (rate: number): string => `${rate}×`;

/** What a stored value may be: anything else falls back to the default for that field, so a hand-edited or older entry cannot break the page. */
export function readOutputPrefs(): OutputPrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(OUTPUT_STORAGE_KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return DEFAULT_OUTPUT;
    const o = raw as Record<string, unknown>;
    return {
      volume: typeof o.volume === 'number' && Number.isFinite(o.volume) ? Math.min(100, Math.max(0, Math.round(o.volume))) : DEFAULT_OUTPUT.volume,
      muted: o.muted === true,
      rate: RATES.find((r) => r === o.rate) ?? DEFAULT_OUTPUT.rate,
      device: typeof o.device === 'string' ? o.device : DEFAULT_OUTPUT.device,
    };
  } catch {
    return DEFAULT_OUTPUT;
  }
}

function writeOutputPrefs(prefs: OutputPrefs): void {
  try {
    localStorage.setItem(OUTPUT_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable: the choice holds for this window only.
  }
}

export function useOutputPrefs(): { prefs: OutputPrefs; change: (patch: Partial<OutputPrefs>) => void } {
  const [prefs, setPrefs] = useState(readOutputPrefs);
  const change = useCallback((patch: Partial<OutputPrefs>) => {
    setPrefs((now) => {
      const next = { ...now, ...patch };
      writeOutputPrefs(next);
      return next;
    });
  }, []);
  return { prefs, change };
}

/**
 * Puts the choices on a playing element. A new `src` resets `playbackRate` to `defaultPlaybackRate`, so both are set; `preservesPitch` is the
 * default in a webview but is set so a speed change never raises the voice.
 */
export function applyOutput(el: HTMLMediaElement, { volume, muted, rate }: Pick<OutputPrefs, 'volume' | 'muted' | 'rate'>): void {
  el.volume = volume / 100;
  el.muted = muted;
  el.defaultPlaybackRate = rate;
  el.playbackRate = rate;
  el.preservesPitch = true;
}

/** What the page says when the chosen output cannot be used; the sound plays on the system default meanwhile. */
export const deviceProblem = (device: string): string => `Could not play on ${device}. Playing on the system default until it is back.`;

/**
 * Keeps an element on the narrator's choices. `getElement` returns the player's element once it exists (a player makes it lazily); the device is
 * applied when it changes and `onDevice` hears the sentence to show when the output could not be used, or null when it took.
 */
export function useAppliedOutput(
  getElement: () => HTMLMediaElement | undefined,
  output: OutputPrefs | undefined,
  onDevice?: (problem: string | null) => void,
): void {
  const volume = output?.volume;
  const muted = output?.muted;
  const rate = output?.rate;
  const device = output?.device;
  useEffect(() => {
    const el = getElement();
    if (el && volume !== undefined && muted !== undefined && rate !== undefined) applyOutput(el, { volume, muted, rate });
  }, [getElement, volume, muted, rate]);
  useEffect(() => {
    const el = getElement();
    if (!el || device === undefined) return;
    let stale = false;
    void setOutput(el, device).then((result) => !stale && onDevice?.(result.ok ? null : deviceProblem(device)));
    return () => {
      stale = true;
    };
  }, [getElement, device, onDevice]);
}
