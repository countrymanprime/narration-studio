// The mock build's `window.__raiseToast` (main.tsx), shared by the specs that raise a toast: one declaration of the hook and one way to call it.
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    /** Mock build only (`main.tsx`): undefined for a Retry button, null for none, a string for a button with that label. */
    __raiseToast?: (text: string, actionLabel?: string | null) => void;
  }
}

/** Waits for the mock build's hook to exist. */
export const hookReady = (page: Page) => page.waitForFunction(() => typeof window.__raiseToast === 'function');

/** Raises an error toast: with a Retry button by default, no button for `null`, a button with that label for a string. */
export const raiseToast = (page: Page, text: string, label?: string | null) =>
  page.evaluate((args) => window.__raiseToast?.(args.text, args.label), { text, label });
