import { expect, test } from '@playwright/test';
import { DESKTOP, openApp } from './helpers';

// QA break B2 of #2819: the render dialog hands off to Create chapter regions, so the dialog that opened the second is gone when it closes.
// jsdom restores focus here without help, so only a real browser shows the loss.
test('focus returns to the toolbar button after a render to regions chain', async ({ page }) => {
  await openApp(page, DESKTOP, ['engine', 'render-config-no-regions']);
  const dialogs = page.getByRole('dialog');
  await dialogs
    .last()
    .getByRole('button', { name: /Create chapter regions/i })
    .click();
  await expect(dialogs.last()).toContainText(/regions/i);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const active = await page.evaluate(() => document.activeElement?.textContent);
  expect(active).toBe('Prepare chapter render…');
});
