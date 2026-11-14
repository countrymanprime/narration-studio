import type { Page } from '@playwright/test';

/**
 * How long after the unsaved question opens a key press on its way to stay is ignored (`ECHO_MS` in `src/App.tsx`): the second Enter of a double press must not answer a
 * question the narrator has not seen (#3446 E7). A test that answers the question with the keyboard has to wait this out, or it races the window and passes only on a
 * machine slow enough to take longer.
 */
const QUESTION_ECHO_MS = 300;

/** Presses `key` on the question after its echo window, with a margin. Use it for every key press that is meant to answer the unsaved question. */
export async function pressOnQuestion(page: Page, key: 'Enter' | 'Space'): Promise<void> {
  await page.waitForTimeout(QUESTION_ECHO_MS + 150);
  await page.keyboard.press(key);
}
