import type { Page } from '@playwright/test';

type Raise = (text: string, label?: string | null) => void;

/** Waits until the mock build has installed `window.__raiseToast`; a spec that measures the page before it raises a toast waits here first, so the hook's arrival cannot move what it measured. */
export const toastHookReady = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => typeof (window as unknown as { __raiseToast?: unknown }).__raiseToast === 'function');

/**
 * Raises an error toast with the text, through the mock build's `window.__raiseToast` (`main.tsx`): Retry is its button unless `label` is another one, or `null` for none.
 * An omitted label is not passed at all, so the hook's own default (Retry) applies.
 */
export async function raiseToast(page: Page, text: string, label?: string | null): Promise<void> {
  await toastHookReady(page);
  if (label === undefined) await page.evaluate((t) => (window as unknown as { __raiseToast: Raise }).__raiseToast(t), text);
  else await page.evaluate(([t, l]) => (window as unknown as { __raiseToast: Raise }).__raiseToast(t, l), [text, label] as const);
}
