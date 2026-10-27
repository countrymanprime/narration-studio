/** The sound of the chapter on the document's clock: `level[i]` (0 to 1) is the loudest sample in `[start + i * step, start + (i + 1) * step)`. */
export interface Envelope {
  start: number;
  step: number;
  level: readonly number[];
}

/** A level under this share of the word's own peak is quiet. */
const QUIET_RATIO = 0.1;
/** Whatever the word's peak, a level under this is the room, not a word's tail. */
const QUIET_FLOOR = 0.012;
/** The sound must stay quiet this long to count as gone, so a closure inside a word (the gap before a "t") is not taken for its end. */
const QUIET_HOLD_SECONDS = 0.06;
/** A dip under this share of the peak that rises again is the join of two words spoken with no pause. */
const VALLEY_RATIO = 0.3;
/** Seconds kept past the moment the sound is gone, for the last of its decay. */
const DECAY_MARGIN_SECONDS = 0.04;

/**
 * Where the sound of the word that starts at `wordStart` and that the recognizer ends at `end` has died away, for a play that must not cut it.
 * The recognizer's end falls early (an "s", the rest of a vowel, a release), so the end comes from the audio: the first time after `end` that
 * the level stays quiet, or dips to a valley and rises again (the next word, spoken with no pause). Never before `end`, never after `limit`
 * (the caller's bound: the next word's start, or the middle of a touching one). Null when the audio does not cover the word or it is silent,
 * and the caller keeps its fixed tail.
 */
export function audioTail(env: Envelope, wordStart: number, end: number, limit: number): number | null {
  const { start, step, level } = env;
  if (!(step > 0) || level.length === 0) return null;
  const at = (t: number): number => Math.floor((t - start) / step + 1e-9);
  const first = at(wordStart);
  const from = at(end);
  if (first < 0 || from < first || from >= level.length) return null;
  let peak = 0;
  for (let i = first; i <= Math.min(from, level.length - 1); i += 1) peak = Math.max(peak, level[i]);
  if (peak < QUIET_FLOOR) return null;
  const quiet = Math.max(QUIET_RATIO * peak, QUIET_FLOOR);
  const valley = VALLEY_RATIO * peak;
  const hold = Math.max(1, Math.round(QUIET_HOLD_SECONDS / step));
  const last = Math.min(level.length - 1, at(limit));
  let run = 0;
  for (let i = from; i <= last; i += 1) {
    run = level[i] < quiet ? run + 1 : 0;
    if (run >= hold) return clamp(start + (i - hold + 1) * step + DECAY_MARGIN_SECONDS, end, limit);
    const falling = i > from && level[i] <= level[i - 1];
    if (falling && level[i] <= valley && i + 1 <= last && level[i + 1] > level[i]) return clamp(start + i * step, end, limit);
  }
  return limit;
}

const clamp = (t: number, low: number, high: number): number => Math.max(low, Math.min(t, high));
