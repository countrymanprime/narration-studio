/**
 * Where focus goes when a dialog opened from the script text closes: the script text itself, so the narrator is back on the words with the
 * selection as it was. The word menu closes as its item runs, so the item that had focus is gone by then and the dialog's own rule would
 * fall through to the page's first control.
 */
export const returnToScript = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-script]');
