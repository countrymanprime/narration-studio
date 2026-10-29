/** Seconds the sound is faded out over at the end of a play of words. The planned stop sits where the sound has died away, so the fade only takes the
 * click off a stop that lands on the last of a decay; it ends on the planned stop, it does not start there. */
export const STOP_FADE_SECONDS = 0.012;
/** Seconds the element keeps running, silent, past the planned stop before it is paused. A media element's clock counts what it has handed to the
 * output, not what the device has played, and pausing drops what the device still holds: the sound before the stop is not to be what is dropped. */
export const OUTPUT_DRAIN_SECONDS = 0.06;
/** How often the volume steps down during the fade. */
const STEP_MS = 3;

/**
 * Fades `el` to silence over `STOP_FADE_SECONDS`, keeps it running for `OUTPUT_DRAIN_SECONDS`, then pauses it, puts its volume back and calls
 * `done`. Returns what cancels it (the volume goes back at once; `done` is not called). The element must be playing.
 */
export function fadeOutAndPause(el: HTMLMediaElement, done: () => void): () => void {
  const volume = el.volume;
  const steps = Math.max(1, Math.round((STOP_FADE_SECONDS * 1000) / STEP_MS));
  let step = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fade = (): void => {
    step += 1;
    el.volume = volume * Math.max(0, 1 - step / steps);
    if (step < steps) timer = setTimeout(fade, STEP_MS);
    else timer = setTimeout(finish, OUTPUT_DRAIN_SECONDS * 1000);
  };
  const finish = (): void => {
    el.pause();
    el.volume = volume;
    done();
  };
  timer = setTimeout(fade, STEP_MS);
  return () => {
    clearTimeout(timer);
    el.volume = volume;
  };
}
