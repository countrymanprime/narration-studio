// The one place a count and its noun are joined, so "1 take", "2 takes" and "1,234 words" read the same on every page (issue 3277).

/** The noun in its number: `one` for exactly 1, else `many` (default: `one` plus "s"). "take", "takes". */
export const pluralWord = (count: number, one: string, many = `${one}s`): string => (count === 1 ? one : many);

/**
 * A count with its noun, the count with thousands separators: "1 take", "2 takes", "1,234 words". A count the host did not send (undefined, NaN, infinite)
 * reads 0 and never throws, so one missing field cannot blank a page.
 */
export const plural = (count: number, one: string, many?: string): string => {
  const n = Number.isFinite(count) ? count : 0;
  return `${formatCount(n)} ${pluralWord(n, one, many)}`;
};

/** A count on its own, with thousands separators ("5,002", "0 of 5,002 encoded"): for a number that does not sit before a noun `plural` can join. */
export const formatCount = (count: number): string => ((Number.isFinite(count) ? count : 0) + 0).toLocaleString('en-US');
