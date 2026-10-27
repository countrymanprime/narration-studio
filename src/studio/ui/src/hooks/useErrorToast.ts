import { useEffect } from 'react';
import { overlay } from '../overlay/overlayService';

/** A message longer than this is cut for the toast: a tool's whole log is not a message. */
export const TOAST_ERROR_MAX_CHARS = 240;
const cut = (text: string): string => (text.length > TOAST_ERROR_MAX_CHARS ? `${text.slice(0, TOAST_ERROR_MAX_CHARS).trimEnd()}…` : text);

/**
 * Tells the narrator an error as a toast, once each time the message changes to a new sentence, instead of drawing it in the page's flow, where
 * it moves what is under it (docs/design/design-system.md#errors). An empty message says nothing.
 */
export function useErrorToast(message: string | null | undefined): void {
  useEffect(() => {
    if (message) overlay.toast(cut(message), { tone: 'error' });
  }, [message]);
}
