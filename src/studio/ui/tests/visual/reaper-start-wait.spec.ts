// #3880: after Start REAPER the dialog waits for the host's capabilities event. The wait once handed each announced picture back to the app's session, which announced it again: the tab froze. A REAPER that never answers must leave the page answering and end with the dialog's own sentence.
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });
test.setTimeout(60_000);

test('Start REAPER with a REAPER that never answers keeps the page alive and ends with the not-answered sentence', async ({ page }) => {
  await page.goto('/?mockDaw=quiet&mockCallLog=1');
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page
    .getByRole('link', { name: 'Booth', exact: true })
    .or(page.getByRole('button', { name: 'Booth', exact: true }))
    .and(page.locator(':visible'))
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: /is not connected/ });
  await dialog.waitFor({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Link project file…' }).click();
  const start = dialog.getByRole('button', { name: /Open in REAPER and connect|Start REAPER/ });
  await start.click();
  // The page answers while it waits (a feedback loop left it unable to), at several points of the wait.
  for (const at of [1_000, 3_000, 6_000]) {
    await page.waitForTimeout(at === 1_000 ? at : 2_000);
    expect(await Promise.race([page.evaluate(() => 1), new Promise((resolve) => setTimeout(() => resolve('frozen'), 3_000))])).toBe(1);
  }
  await expect(dialog.getByRole('alert')).toContainText('has not answered yet', { timeout: 15_000 });
  expect(await page.evaluate(() => 1)).toBe(1);
  // One launcher run, and the reads were the session's own plus a few of this wait's: nothing like one a second.
  const reads = await page.evaluate(() => (window.__hostCalls ?? []).filter((c) => c.name === 'dawCapabilities').length);
  expect(reads).toBeLessThan(15);
});
