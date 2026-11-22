// The one place a number is held between two bounds (issue 3962). A page does not define its own `clamp` or write one inline. Of the twelve copies this replaced, the ones
// nested the other way (`Math.min(high, Math.max(low, v))`: RunOptions' `clampTo`, holdScroll, the reader's layers, recordedThrough, the teleprompter
// mock) let high win on crossed bounds and can differ on signed-zero bounds, but none of their callers can cross the bounds or pass a -0 bound, so
// every one gave the same results as this.

/**
 * `value` held to `low`..`high`. NaN in gives NaN out, so a bad reading is not quietly turned into a bound. When `low` is above `high`, `low` wins: a
 * caller with an empty range (`clamp(i, 0, length - 1)` on an empty list, `readingPosition.ts`) gets `low` back, never `high`.
 */
export const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
