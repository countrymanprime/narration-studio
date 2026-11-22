// A double click on a Record with radio while an Audacity backups value that is not a number is held keeps the value: the "Unsaved changes" question opens with its way on
// under the radio, and the second click must not press it (#4011).
import { expect, test } from '@playwright/test';
import { settlePage } from './helpers/settle';

for (const gap of [0, 250]) {
  test(`Record with: ${gap === 0 ? 'a double click' : `two clicks ${gap} ms apart`} on a radio keeps an unsaved backups value`, async ({ page }) => {
    // The wide window the question opens over the radio in (at 1100 and below the way on sits clear of it).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/settings?mockDaw=Audacity&mockAudacityLink=linked');
    await settlePage(page);
    // Settings opens on Recording & DAW.
    const days = page.getByRole('textbox', { name: 'Keep backups for (days)' });
    await days.fill('abc');
    const reaper = page.getByRole('radio', { name: /^REAPER/ });
    if (gap === 0) await reaper.dblclick();
    else {
      // The dialog hides the radio from role queries once it is open, so its centre is read first, with the radio on screen.
      await reaper.scrollIntoViewIfNeeded();
      const [x, y] = await centreOf(reaper);
      await reaper.click();
      await page.waitForTimeout(gap);
      // The second click of a double click that is slower than a Playwright `dblclick`: the OS counts it (click count two), as the real one would.
      await page.mouse.move(x, y);
      await page.mouse.down({ clickCount: 2 });
      await page.mouse.up({ clickCount: 2 });
    }
    await expect(page.getByRole('alertdialog', { name: 'Unsaved changes' })).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByRole('alertdialog', { name: 'Unsaved changes' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(days).toHaveValue('abc');
    await expect(page.getByRole('radio', { name: /^Audacity/ })).toBeChecked();
  });
}

async function centreOf(locator: import('@playwright/test').Locator): Promise<[number, number]> {
  const box = (await locator.boundingBox())!;
  return [box.x + box.width / 2, box.y + box.height / 2];
}
