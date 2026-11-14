import { overlay } from '../../overlay/overlayService';

/**
 * The question an editor puts when Escape (or any other way out that is not a button saying it discards) would throw away text typed in it (#3400, decided by the
 * coordinator under the owner's D1: text is dropped only by an action whose own label says so, and an exit asks). `what` completes "Discard ...?".
 */
export const confirmDiscard = (what: string): Promise<boolean> => {
  // One question at a time: a burst of Escape while it is open asks nothing more, and every caller gets the one answer (#3457, qa-breaker round 2).
  if (open) return open;
  const asked = overlay
    .confirm({
      title: `Discard ${what}?`,
      body: 'What you typed is not saved yet and goes with it.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      confirmVariant: 'danger',
    })
    .finally(() => {
      if (open === asked) open = null;
    });
  open = asked;
  return asked;
};
let open: Promise<boolean> | null = null;
