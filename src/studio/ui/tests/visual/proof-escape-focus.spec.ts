// Escape from Proof's chapter view goes back to All chapters and leaves focus on the chapter picker, never on <body> (#4014, found by the qa-breaker on #4000).
import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';

test('Escape from the chapter view leaves focus on the chapter picker, not body', async ({ page }) => {
  await page.goto('/proof?mockChapterLink=confirmed');
  await settlePage(page);
  await page.getByText('Open notes, by chapter').waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Chapter: .*\. Change chapter$/ }).click();
  await page.getByRole('menuitemradio', { name: /^Chapter 1(: | — |$)/ }).click();
  await page.getByText('Recording check', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Compare with the script' }).click();
  await page.getByRole('region', { name: 'Compare', exact: true }).getByRole('heading', { name: 'Compare the recording with the script' }).waitFor();
  await page.getByRole('button', { name: 'Differences' }).first().focus();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Open notes, by chapter')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await expect(page.locator('[data-chapter-picker]')).toBeFocused();
});
