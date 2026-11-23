/**
 * How many characters of a message fit the toast's two lines (#4095). A toast is a fixed 448 px wide and two lines high (`Toast.tsx`), and what shares its row
 * takes width from the text: Dismiss alone, Dismiss and Retry, or Dismiss and "Check again", the longest label a Booth refusal carries (the check offer's "Check recordings" comes with a 40-character question, which fits any of them). Measured at 16 px root
 * font with ordinary prose, a message fits up to about 109, 96 and 83 characters; the budgets keep a few characters of room for wider letters.
 * A message past its budget scrolls inside the toast, which `tests/visual/booth-refusals-two-lines.spec.ts` keeps from happening to the Booth's own sentences.
 */
export const TOAST_CHAR_BUDGET = { plain: 104, retry: 90, checkAgain: 78 } as const;

export type ToastButton = keyof typeof TOAST_CHAR_BUDGET;

// `as`: Object.keys gives string[]; the keys of the budget table are exactly the button types.
export const TOAST_BUTTONS = Object.keys(TOAST_CHAR_BUDGET) as ToastButton[];
