/**
 * Trims what the host trims: Go's `strings.TrimSpace` strips every Unicode space (U+0085, U+00A0, U+1680, U+2000-200A, U+2028/2029, U+202F, U+205F, U+3000 and the ASCII ones), and JavaScript's
 * `trim()` does not strip U+0085. Text of only such characters is blank to the host (a message would be deleted, a template body saved empty), so the page must call it blank too (#3458 qa round 6 B-1, #3461 BR-J).
 */
export const hostTrim = (text: string): string =>
  text.replace(
    /^[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+|[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+$/g,
    '',
  );
