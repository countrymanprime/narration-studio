// The one place a number is held between two bounds (issue 3962). A page does not define its own `clamp`: the eight copies this replaced all behaved the
// same way, and one definition keeps it that way.

/**
 * `value` held to `low`..`high`. NaN in gives NaN out, so a bad reading is not quietly turned into a bound. When `low` is above `high`, `low` wins: a
 * caller with an empty range (`clamp(i, 0, length - 1)` on an empty list, `readingPosition.ts`) gets `low` back, never `high`.
 */
export const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
