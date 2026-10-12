/**
 * A take that reads the line twice: the narrator restarted and the take was never cut. Pure: the script's text and the words the recogniser
 * heard in the take, passed in. A second read is the line's first words heard again after a pause, so a stutter ("Serpent! Serpent!"), an
 * added word and a line that repeats itself in the script are not one.
 */
import { normKey, type HeardWord } from './align';

/** How many of the script's first words the second read must repeat, one after another. Fewer than this can be a stutter or an echo. */
export const DUP_HEAD_WORDS = 4;

/** The pause, in seconds, that must come before the repeat. A restart leaves a gap while the narrator takes a breath; a stutter does not. */
export const DUP_MIN_PAUSE = 0.3;

export interface DuplicateRead {
  /** Index in the heard words of the first word of the second read. */
  index: number;
  /** Seconds from the start of the take where the second read begins: the start of its first word. */
  startsAt: number;
  /** Seconds from the start of the take where to cut: the middle of the pause before the second read, so neither read loses a word. */
  cutAt: number;
  /** What the first read said, and what the second read said. */
  first: string;
  second: string;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Where `head` occurs in `words`, as the indexes of its first word, without overlapping a previous occurrence. */
function occurrences(words: readonly string[], head: readonly string[]): number[] {
  const found: number[] = [];
  for (let i = 0; i + head.length <= words.length; i++) {
    if (head.every((h, k) => words[i + k] === h)) {
      found.push(i);
      i += head.length - 1;
    }
  }
  return found;
}

/**
 * Whether a take of `script` reads it twice, and where the second read starts. Null when it reads the line once, when the repeat comes with
 * no pause (`DUP_MIN_PAUSE`), when the script repeats its own first words, or when the line is a single word.
 */
export function duplicateRead(script: string, heard: readonly HeardWord[]): DuplicateRead | null {
  const scriptWords = script.split(/\s+/).map(normKey).filter(Boolean);
  const head = scriptWords.slice(0, DUP_HEAD_WORDS);
  if (head.length < 2) return null;
  if (occurrences(scriptWords, head).length > 1) return null;
  const heardWords = heard.map((w) => normKey(w.text));
  const at = occurrences(heardWords, head);
  const index = at[1];
  if (at.length < 2 || index === undefined) return null;
  const before = heard[index - 1];
  const start = heard[index];
  if (start.off0 - before.off1 < DUP_MIN_PAUSE - 1e-9) return null;
  const said = (words: readonly HeardWord[]): string => words.map((w) => w.text).join(' ');
  return {
    index,
    startsAt: start.off0,
    cutAt: round3((before.off1 + start.off0) / 2),
    first: said(heard.slice(0, index)),
    second: said(heard.slice(index)),
  };
}

/** A read of a passage: seconds into the chapter and how long it lasts. */
interface CuttableTake {
  id: string;
  start: number;
  len: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The two takes a cut at `at` (seconds into the chapter) makes of one: `<id>a` before it, `<id>b` from it on. */
export function splitDuplicateTake<T extends CuttableTake>(take: T, at: number): [T, T] {
  return [
    { ...take, id: `${take.id}a`, len: round1(at - take.start) },
    { ...take, id: `${take.id}b`, start: round1(at), len: round1(take.start + take.len - at) },
  ];
}
