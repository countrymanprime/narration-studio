// How Master & QC writes a measured value: a level to one decimal
// with a typographic minus, and a duration as m:ss or h:mm:ss.

/** A level as the page writes it: one decimal, with a typographic minus so a column of negatives reads cleanly. */
export function formatLevel(value: number): string {
  return value.toFixed(1).replace('-', '−');
}
