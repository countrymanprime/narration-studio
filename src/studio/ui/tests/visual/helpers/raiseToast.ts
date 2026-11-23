import type { Page } from '@playwright/test';

type Raise = (text: string, label?: string | null) => void;

/**
 * Raises an error toast with the text, through the mock build's `window.__raiseToast` (`main.tsx`): Retry is its button unless `label` is another one, or `null` for none.
 * An omitted label is not passed at all: a script argument that is `undefined` arrives as `null`, which is "no button".
 */
export async function raiseToast(page: Page, text: string, label?: string | null): Promise<void> {
  await page.waitForFunction(() => typeof (window as unknown as { __raiseToast?: unknown }).__raiseToast === 'function');
  if (label === undefined) await page.evaluate((t) => (window as unknown as { __raiseToast: Raise }).__raiseToast(t), text);
  else await page.evaluate(([t, l]) => (window as unknown as { __raiseToast: Raise }).__raiseToast(t, l), [text, label] as const);
}
