// A DAW that goes away and comes back while the Booth is on a chapter ends with that chapter soloed (#3428): the restore the Booth sent when the DAW
// went away failed and is owed, and the owed retry must not take off the solo the Booth sets again. Judged by the mock DAW's state, not by call counts.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const soloed = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.soloed().chapterId ?? '');

test('a DAW that goes quiet and answers again leaves the Booth chapter soloed', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect.poll(() => soloed(page)).not.toBe('');
  const chapter = await soloed(page);
  await page.evaluate(() => {
    window.__NARRATION_MOCK_DAW__?.refuseNextRestore(
      'REAPER could not take the solo off the chapter’s track, so the other chapters may stay silent. Unsolo it in REAPER if they still are when you leave the Booth.',
    );
    window.__NARRATION_MOCK_DAW__?.quiet();
  });
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.heartbeat());
  await expect.poll(() => soloed(page)).toBe(chapter);
  await settlePage(page);
  expect(await soloed(page)).toBe(chapter);
});

test('an owed restore is sent again when the window gets focus, with the narrator staying on the Script page', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect.poll(() => soloed(page)).not.toBe('');
  await page.evaluate(() =>
    window.__NARRATION_MOCK_DAW__?.refuseNextRestore(
      'REAPER could not take the solo off the chapter’s track, so the other chapters may stay silent. Unsolo it in REAPER if they are still silent.',
    ),
  );
  await goToPage(page, 'Script');
  await settlePage(page);
  expect(await soloed(page)).not.toBe('');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => soloed(page)).toBe('');
});
