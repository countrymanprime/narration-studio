import { useEffect, useRef, useState } from 'react';
import type { SystemApi } from '../api/contracts/system';

/**
 * Closing the app window with a draft held asks the same question as every other exit (#3526). The host cancels the close and sends
 * `window:close-requested` only while the page has told it a draft is held, so this tells it whenever that changes; on the request it says it received it (so the
 * host waits for the narrator instead of closing after a few seconds), puts the question through `ask`, and answers the host: yes closes the window, a Cancel keeps it.
 * `ask` is the shell's guarded move, which runs the move at once when nothing is held any more.
 */
export function useWindowClose(
  api: Pick<SystemApi, 'windowCloseGuard' | 'windowCloseAsked' | 'windowCloseAnswer' | 'subscribeWindowCloseRequested'>,
  held: boolean,
  ask: (run: () => void, options?: { onCancel?: () => void }) => void,
): void {
  const latestAsk = useRef(ask);
  latestAsk.current = ask;
  // A field that saves when it loses focus holds its text as a draft only after the blur, and a window that goes away under the caret never sends it. While the
  // caret is in a text box the host is told to ask; the question's own settle step then blurs the box and runs the close at once if nothing turns out to be held.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const look = () => {
      const field = document.activeElement;
      setTyping(field instanceof HTMLElement && field.matches('input, textarea') && !field.closest('[role="dialog"], [role="alertdialog"]'));
    };
    look();
    document.addEventListener('focusin', look);
    document.addEventListener('focusout', look);
    return () => {
      document.removeEventListener('focusin', look);
      document.removeEventListener('focusout', look);
    };
  }, []);
  const guard = held || typing;
  useEffect(() => {
    void api.windowCloseGuard(guard).catch(() => undefined);
  }, [api, guard]);
  useEffect(
    () =>
      api.subscribeWindowCloseRequested(() => {
        void api.windowCloseAsked().catch(() => undefined);
        latestAsk.current(() => void api.windowCloseAnswer(true).catch(() => undefined), {
          onCancel: () => void api.windowCloseAnswer(false).catch(() => undefined),
        });
      }),
    [api],
  );
}
