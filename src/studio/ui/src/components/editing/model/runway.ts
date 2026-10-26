import type { ChapterDoc } from './doc';

/** Seconds of audio kept after the last word of a paragraph. The aligner's end time for a word can fall before the sound has died away. */
export const RUNWAY_SECONDS = 0.35;
/** Room left before the next paragraph's first word, so the runway never plays or draws part of it. */
const BEFORE_NEXT_SECONDS = 0.02;

const heard = (i: { t0: number | null; t1: number | null; st: string; cut?: unknown }): boolean => i.t0 != null && i.t1 != null && i.st !== 'miss' && !i.cut;

/**
 * Where a play or a drawn window that ends on the word `lastKey` at `end` should really end: the last word of a paragraph gets the runway
 * (never into the next paragraph's first word), and any other word, or an unknown one, ends where it did.
 */
export function runwayEnd(doc: ChapterDoc, lastKey: string, end: number): number {
  const at = doc.index.get(lastKey);
  if (at == null) return end;
  const word = doc.items[at];
  const next = doc.items.slice(at + 1).find(heard);
  if (next && next.pid === word.pid) return end;
  const limit = next?.t0 == null ? Number.POSITIVE_INFINITY : next.t0 - BEFORE_NEXT_SECONDS;
  return Math.min(end + RUNWAY_SECONDS, Math.max(end, limit));
}

/** Seconds a play may run past the aligner's end of a word inside a line. Word end times from the recognizer fall early: an "s", the release of
 * a "p" or "t" and the unvoiced tail of a word sound after them, so a play that stops on the end time is heard as "U" for "Up". */
export const WORD_TAIL_SECONDS = 0.2;
/** Seconds a play runs past a word's end when the next word's aligned start touches it. The recognizer gives touching words one shared
 * boundary that sits early, so the next word's start is no more trustworthy than this word's end; this much of the tail is kept, never past the
 * middle of the next word. */
export const MIN_TAIL_SECONDS = 0.12;
/** A next word that starts at least this long after a word's end was heard after a pause, and the play stops before it. */
const TOUCHING_SECONDS = 0.05;
/** Seconds a play may start before the first word's aligned start, for a plosive or breath the aligner put after its onset. */
export const WORD_LEAD_SECONDS = 0.05;

const nextHeard = (doc: ChapterDoc, word: ChapterDoc['items'][number]): ChapterDoc['items'][number] | undefined => {
  let best: ChapterDoc['items'][number] | undefined;
  for (const i of doc.items) {
    if (i === word || !heard(i) || (i.t0 as number) <= (word.t0 as number)) continue;
    if (!best || (i.t0 as number) < (best.t0 as number)) best = i;
  }
  return best;
};

const previousHeard = (doc: ChapterDoc, word: ChapterDoc['items'][number]): ChapterDoc['items'][number] | undefined => {
  let best: ChapterDoc['items'][number] | undefined;
  for (const i of doc.items) {
    if (i === word || !heard(i) || (i.t0 as number) >= (word.t0 as number)) continue;
    if (!best || (i.t0 as number) > (best.t0 as number)) best = i;
  }
  return best;
};

/**
 * Where a play that ends on the word `lastKey` at `end` should stop. It runs on past the aligner's end by `WORD_TAIL_SECONDS` (the runway after a
 * paragraph's last word), up to `BEFORE_NEXT_SECONDS` before the next heard word's start when a pause comes between them, and by
 * `MIN_TAIL_SECONDS` (never past the middle of the next word) when that start touches this word's end. The next word is the heard one that starts soonest after this one, so a
 * re-read or an extra word laid out of order is found by its time. An unknown word, or one with no time, ends where it did.
 */
export function tailEnd(doc: ChapterDoc, lastKey: string, end: number): number {
  const at = doc.index.get(lastKey);
  const word = at == null ? undefined : doc.items[at];
  if (!word || word.t0 == null) return end;
  const next = nextHeard(doc, word);
  const tail = next && next.pid === word.pid ? WORD_TAIL_SECONDS : RUNWAY_SECONDS;
  if (!next) return end + tail;
  const t0 = next.t0 as number;
  if (t0 - end >= TOUCHING_SECONDS) return Math.min(end + tail, Math.max(end, t0 - BEFORE_NEXT_SECONDS));
  const middle = t0 + Math.max(0, (next.t1 as number) - t0) / 2;
  return Math.max(end, Math.min(end + MIN_TAIL_SECONDS, middle));
}

/** Where a play that starts on the word `firstKey` at `start` should start: up to `WORD_LEAD_SECONDS` earlier, never before the previous heard
 * word's end or the chapter's start. */
export function leadStart(doc: ChapterDoc, firstKey: string, start: number): number {
  const at = doc.index.get(firstKey);
  const word = at == null ? undefined : doc.items[at];
  if (!word || word.t0 == null) return start;
  const previous = previousHeard(doc, word);
  const limit = previous ? Math.min(start, previous.t1 as number) : 0;
  return Math.max(0, start - WORD_LEAD_SECONDS, limit);
}

/** The stretch a play of the words `firstKey`..`lastKey`, aligned at `start`..`end`, hears: every Editing play of words goes through it. */
export function heardWindow(doc: ChapterDoc, firstKey: string, lastKey: string, start: number, end: number): [number, number] {
  return [leadStart(doc, firstKey, start), tailEnd(doc, lastKey, end)];
}
