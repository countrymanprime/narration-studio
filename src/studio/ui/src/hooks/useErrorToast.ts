import { useEffect, useId, useRef } from 'react';
import { retryAction } from '../components/primitives/Toast';
import { overlay } from '../overlay/overlayService';

/** A message longer than this is cut for the toast: a tool's whole log is not a message. */
export const TOAST_ERROR_MAX_CHARS = 240;
const cut = (text: string): string => (text.length > TOAST_ERROR_MAX_CHARS ? `${text.slice(0, TOAST_ERROR_MAX_CHARS).trimEnd()}…` : text);

/**
 * Tells the narrator an error as a toast, once each time the message changes to a new sentence, instead of drawing it in the page's flow, where
 * it moves what is under it (docs/design/design-system.md#errors). An empty message says nothing. The toast goes when the message clears; a press on Retry raises it again until then. `retry`, when the failure is safe to repeat,
 * becomes the toast's Retry button; the latest `retry` runs, and a new function alone does not raise the toast again.
 */
export function useErrorToast(message: string | null | undefined, retry?: () => void): void {
  const latest = useRef(retry);
  latest.current = retry;
  const retryable = retry !== undefined;
  // One topic per caller: its newer message replaces its older one, and the toast goes once the error is no longer true (a read that
  // answers again), instead of staying up as a stale fact.
  const topic = `error:${useId()}`;
  useEffect(() => {
    if (!message) {
      overlay.dismissTopic(topic);
      return;
    }
    const text = cut(message);
    // A press on Retry takes the toast away, and a read that fails again with the same words changes nothing for the effect to see: the
    // toast is raised again with the press, and goes when the message clears (the read answered) or is replaced by a new one.
    const raise = () =>
      overlay.toast(text, {
        tone: 'error',
        topic,
        ...(retryable
          ? {
              action: retryAction(() => {
                latest.current?.();
                raise();
              }),
            }
          : {}),
      });
    raise();
  }, [message, retryable, topic]);
}
