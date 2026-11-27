// #3880: the Booth asks the DAW where it is once when it opens. An answer that comes back while a take is running must not move the Booth to another chapter.
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

test('a slow answer from the DAW is waited for, and a take then runs on the chapter it named', async ({ page }) => {
  // The DAW is on another chapter and its place read takes 2.5 s (the host cuts a read at 3 s, and the Booth waits 3.5 s): the Booth draws nothing until the answer, so
  // Record cannot be pressed on a chapter the answer then replaces, and a take never has its chapter moved under it.
  await page.goto('/booth?mockCallLog=1&mockDawLatency=delay%3D2500ms%2Conly%3DdawPlace');
  await page.waitForFunction(() => window.__NARRATION_MOCK_DAW__ !== undefined);
  // The DAW's place is set before the read is answered, whatever the page does while it loads.
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.setPlace('chapter-3', 0));
  const chapter = () => page.evaluate(() => new URLSearchParams(location.search).get('chapter'));
  const record = page.getByRole('button', { name: /^Record$/ });
  // Nothing is drawn while the answer is out: no Record, no chapter in the address.
  await page.waitForTimeout(1_000);
  await expect(record).toHaveCount(0);
  expect(await chapter()).toBeNull();
  await expect(record).toBeEnabled({ timeout: 10_000 });
  expect(await chapter()).toBe('chapter-3');
  await record.click();
  await expect(page.getByRole('button', { name: /^Stop$/ })).toBeVisible({ timeout: 20_000 });
  // The read was answered once and asked once; the take's chapter stays.
  await page.waitForTimeout(4_000);
  expect(await chapter()).toBe('chapter-3');
  const asked = await page.evaluate(() => (window.__hostCalls ?? []).filter((c) => c.name === 'dawPlace').length);
  expect(asked).toBe(1);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
