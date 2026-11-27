import type { KeyboardEvent } from 'react';

/**
 * A held Enter or Space repeats keydown, and each repeat would press the button again as soon as it is free (a play would toggle with every repeat):
 * only the first press counts. `IconButton` runs it before the caller's own `onKeyDown`; a `Button` that plays or previews passes it as its `onKeyDown` (`playPathsNeverWait.guard.test.ts` finds them by label and icon). A dialog's buttons do not: their repeat is `holdEnter`'s.
 */
export function ignoreKeyRepeat(event: KeyboardEvent<HTMLElement>): void {
  if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
}
