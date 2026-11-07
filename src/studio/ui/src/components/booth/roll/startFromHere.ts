/** A phrase index kept inside the chapter's phrases. */
export const clampPhrase = (phrase: number, count: number): number => Math.max(0, Math.min(phrase, count - 1));
