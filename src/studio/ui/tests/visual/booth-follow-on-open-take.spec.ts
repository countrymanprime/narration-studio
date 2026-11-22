// #3880: the Booth asks the DAW where it is once when it opens. An answer that comes back while a take is running must not move the Booth to another chapter.
import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

test('a late answer from the DAW does not change the chapter once a take is running', async ({ page }) => {
  // The DAW is on another chapter, but its place read takes 2.5 s: Record is pressed before the answer.
  await page.goto('/booth?mockCallLog=1&mockDawLatency=delay%3D2500ms%2Conly%3DdawPlace');
  await settlePage(page);
  const chapter = () => page.evaluate(() => new URLSearchParams(location.search).get('chapter'));
  const record = page.getByRole('button', { name: /^Record$/ });
  await expect(record).toBeEnabled();
  const before = await chapter();
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.setPlace('chapter-3', 0));
  await record.click();
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 10_000 });
  // The read has been answered by now; the take's chapter stays.
  await page.waitForTimeout(3_500);
  expect(await chapter()).toBe(before);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
