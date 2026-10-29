/** The sound of the chapter on the document's clock: `level[i]` (0 to 1) is the loudest sample in `[start + i * step, start + (i + 1) * step)`. */
export interface Envelope {
  start: number;
  step: number;
  level: readonly number[];
  /** The room's level in the whole chapter (0 to 1), when it is known: a level under about twice this is the room, not a word's tail. */
  floor?: number;
}

/** The next word when its aligned start touches the end of this one: the recognizer gives them one shared boundary, so only the audio says where one ends. */
export interface TouchingWord {
  start: number;
  end: number;
}

/** A level under this share of the word's own peak is gone: 36 dB down. A word's last /s/, /z/ or release sits 20 to 30 dB under its vowel, so a
 * threshold nearer the peak (the 10% this replaces) calls the word over while it is still sounding. */
const GONE_RATIO = 0.016;
/** A level under this many times the chapter's room level is the room. */
const ROOM_RATIO = 2.5;
/** Whatever the word's peak, a level under this is the room, not a word's tail. */
const QUIET_FLOOR = 0.012;
/** The sound must stay gone this long to count as over. A stop closure inside a word ("statues": the /t/ before the "ues") is quiet for up to about 80 ms. */
export const GONE_HOLD_SECONDS = 0.1;
/** Seconds kept past the moment the sound is gone, for the last of its decay. */
export const DECAY_MARGIN_SECONDS = 0.06;

/**
 * Where the sound of the word that starts at `wordStart` and that the recognizer ends at `end` has died away, for a play that must not cut it.
 * The recognizer's end falls early (an "s", the rest of a vowel, a release), so the end comes from the audio. With no `next` word touching, it is
 * the first time after `end` that the level stays gone (`GONE_HOLD_SECONDS`), plus `DECAY_MARGIN_SECONDS`. With a `next` word near, it is where the sound
 * is gone if that comes before the next word is loud, else the join of the two: the quietest moment between this word's end and the next one's loudest point.
 * Never before `end`, never after `limit` (the caller's bound: the next word's start, or the middle of a touching one). Null when the audio does
 * not cover the word or it is silent, and the caller keeps its fixed tail.
 */
export function audioTail(env: Envelope, wordStart: number, end: number, limit: number, next?: TouchingWord): number | null {
  const { start, step, level } = env;
  if (!(step > 0) || level.length === 0) return null;
  const at = (t: number): number => Math.floor((t - start) / step + 1e-9);
  const first = at(wordStart);
  const from = at(end);
  if (first < 0 || from < first || from >= level.length) return null;
  const last = Math.min(level.length - 1, at(limit));
  let peak = 0;
  for (let i = first; i <= from; i += 1) peak = Math.max(peak, level[i]);
  if (peak < QUIET_FLOOR) return null;
  const gone = Math.max(GONE_RATIO * peak, QUIET_FLOOR, ROOM_RATIO * (env.floor ?? 0));
  const hold = Math.max(1, Math.round(GONE_HOLD_SECONDS / step));
  let run = 0;
  let over = last + 1;
  for (let i = from; i <= last; i += 1) {
    run = level[i] < gone ? run + 1 : 0;
    if (run >= hold) {
      over = i - hold + 1;
      break;
    }
  }
  const soundEnds = clamp(start + over * step + DECAY_MARGIN_SECONDS, end, limit);
  if (!next) return soundEnds;
  // The join: the quietest moment between the end and the next word's loudest point (the latest of equally quiet ones).
  let loudest = at(next.start);
  for (let i = loudest; i <= Math.min(last, at(next.end)); i += 1) if (level[i] > level[loudest]) loudest = i;
  let join = from;
  for (let i = from; i <= Math.min(last, Math.max(from, loudest)); i += 1) if (level[i] <= level[join]) join = i;
  // Gone before the next word is loud: a real pause, and the sound ends where it died away.
  if (over < loudest) return soundEnds;
  return clamp(start + (join + 0.5) * step, end, limit);
}

const clamp = (t: number, low: number, high: number): number => Math.max(low, Math.min(t, high));
