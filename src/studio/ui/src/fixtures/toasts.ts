import { waitFor } from '@testing-library/react';
import { overlay } from '../overlay/overlayService';
import type { ToastMessage } from '../components/primitives/Toast';

/** What the app has told the narrator as toasts right now, newest last. For tests: errors are toasts, never text in a page's flow (rule 7). */
export const toasts = (): ToastMessage[] => [...overlay.getSnapshot().toasts];
export const toastTexts = (): string[] => toasts().map((toast) => toast.text);
/** Takes away every toast, so one test's message is not the next test's. */
export const clearToasts = (): void => toasts().forEach((toast) => overlay.dismissToast(toast.id));
/** Waits for a toast whose text matches, and returns it. */
export const findToast = (match: string | RegExp): Promise<ToastMessage> =>
  waitFor(() => {
    const found = toasts().find((toast) => (typeof match === 'string' ? toast.text.includes(match) : match.test(toast.text)));
    if (!found) throw new Error(`No toast says ${String(match)}; toasts: ${JSON.stringify(toastTexts())}`);
    return found;
  });
/** Presses the toast's own button (Retry), as the narrator would. */
export const pressToastAction = (toast: ToastMessage): void => {
  if (!toast.action) throw new Error(`The toast "${toast.text}" has no button`);
  toast.action.onAction();
  overlay.dismissToast(toast.id);
};
