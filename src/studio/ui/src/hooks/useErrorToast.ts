import { useEffect } from 'react';
import { overlay } from '../overlay/overlayService';

/**
 * Tells the narrator an error as a toast, once each time the message changes to a new sentence, instead of drawing it in the page's flow, where
 * it moves what is under it (docs/design/design-system.md#errors). An empty message says nothing.
 */
export function useErrorToast(message: string | null | undefined): void {
  useEffect(() => {
    if (message) overlay.toast(message, { tone: 'error' });
  }, [message]);
}
