/** Where a phrase sits and what is already on the track, in seconds into the chapter's audio. */
export type StartPoint = { phrase: number; seconds: number; recordedEnd: number };

/**
 * Whether Start from here, before a take runs, starts a punch: only a phrase that lies inside what is already recorded is one.
 * At or beyond the end it is not, and the take starts at the end of the last item so nothing is overwritten.
 */
export function isPunch({ seconds, recordedEnd }: StartPoint): boolean {
  return Math.round(seconds) < recordedEnd;
}

/** A phrase index kept inside the chapter's phrases. */
export const clampPhrase = (phrase: number, count: number): number => Math.max(0, Math.min(phrase, count - 1));
