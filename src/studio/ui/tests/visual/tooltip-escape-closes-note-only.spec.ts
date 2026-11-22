// Escape on an open hint closes the note and nothing else (#3995): Proof's own Escape ("All chapters") must not also run.
import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';

test('proof compare: Escape on an open hint closes the note only; the chapter view stays', async ({ page }) => {
  await page.goto('/proof?mockChapterLink=confirmed');
  await settlePage(page);
  await page.getByText('Open notes, by chapter').waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Chapter: .*\. Change chapter$/ }).click();
  await page.getByRole('menuitemradio', { name: /^Chapter 1(: | — |$)/ }).click();
  await page.getByText('Recording check', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Compare with the script' }).click();
  const region = page.getByRole('region', { name: 'Compare', exact: true });
  await region.getByRole('heading', { name: 'Compare the recording with the script' }).waitFor();
  const icon = page.locator('button.cursor-help:visible').first();
  await page.keyboard.press('Shift');
  await icon.focus();
  await expect(page.locator('[role="tooltip"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(region).toBeVisible();
  await expect(icon).toBeFocused();
});
