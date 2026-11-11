import { expect, type Locator } from '@playwright/test';

/**
 * Waits until a question stops holding back Enter and Space (`Dialog`'s `holdEnter`, the leave questions' `ignoreEnterAfterMs`): the moment a narrator who
 * read the question can answer it with the keyboard. A press before it is ignored by design (#3405), so a test that answers by key waits on this and not on a delay.
 */
export async function enterHoldOver(popup: Locator): Promise<void> {
  await expect(popup).toBeVisible();
  await expect(popup).not.toHaveAttribute('data-enter-held', '', { timeout: 3_000 });
}
