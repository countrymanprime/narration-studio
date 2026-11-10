// The one place a count and its noun are joined, so "1 take", "2 takes" and "1,234 words" read the same on every page (issue 3277).

/** The noun in its number: `one` for exactly 1, else `many` (default: `one` plus "s"). "take", "takes". */
export const pluralWord = (count: number, one: string, many = `${one}s`): string => (count === 1 ? one : many);

/** A count with its noun, the count with thousands separators: "1 take", "2 takes", "1,234 words". */
export const plural = (count: number, one: string, many?: string): string => `${count.toLocaleString('en-US')} ${pluralWord(count, one, many)}`;
