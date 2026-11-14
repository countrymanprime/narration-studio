import type { MouseEvent } from 'react';

/**
 * Runs `run` for a plain left click only. A ctrl, meta, shift or alt click or a non-primary button opens the link in a new tab or window and leaves this page
 * as it is, so the dialog that holds the link must stay open for it. Undefined when there is nothing to run.
 */
export function onPlainClick(run?: () => void): ((event: MouseEvent) => void) | undefined {
  if (!run) return undefined;
  return (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    run();
  };
}
