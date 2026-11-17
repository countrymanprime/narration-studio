// What the leave question says and where it leaves focus (#3555 items 3 and 7, the chapter label, and #3550 item 1): the question says the take is saved, Back names no page it
// does not know, a chapter question says it opens a chapter, and staying hands focus back to the picker the question was asked from.
import { expect, test, type Page } from '@playwright/test';
import { enterHoldOver } from './helpers/enterHold';
import { pastStartGuard } from './helpers/startGuard';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
const picker = (page: Page) => page.locator('[aria-label^="Chapter:"]').first();

async function recording(page: Page, via: 'Production' | 'Script'): Promise<void> {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  if (via === 'Script') await goToPage(page, 'Script');
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await record(page).click();
  await expect(stop(page)).toBeVisible();
  await expect.poll(() => dawRecording(page)).toBe(true);
  await pastStartGuard(page);
}

test('the question for a take that records says the take is saved', async ({ page }) => {
  await recording(page, 'Production');
  await page.keyboard.press('Escape');
  const question = page.getByRole('alertdialog', { name: 'Stop recording?' });
  await expect(question).toContainText('REAPER is recording. Leaving the Booth for Script stops it and saves the take.');
});

// Back is a move by history steps: the page it lands on is not known to the question, so it names none (it named Production whatever was behind the Booth).
test('Back from the Booth, with Script behind it, does not name Production', async ({ page }) => {
  await recording(page, 'Script');
  await page.goBack();
  const question = page.getByRole('alertdialog', { name: 'Stop recording?' });
  await expect(question).toBeVisible();
  await expect(question).not.toContainText('Production');
  await expect(question).toContainText('Leaving the Booth stops it and saves the take.');
  await enterHoldOver(question);
  await question.getByRole('button', { name: 'Stop and leave' }).click();
  await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe('/script');
});

test('a link to another chapter during a take says it opens a chapter: Stop and open, and Open anyway after a refusal', async ({ page }) => {
  await recording(page, 'Production');
  await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('Disk full.', 'stop'));
  await page.evaluate(() => {
    const state = window.history.state as { idx?: number } | null;
    window.history.pushState({ ...state, idx: (state?.idx ?? 0) + 1 }, '', '/booth?chapter=chapter-2');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  const question = page.getByRole('alertdialog', { name: 'Stop recording?' });
  await expect(question).toContainText('Opening another chapter stops it and saves the take.');
  await expect(question.getByRole('button', { name: 'Stop and leave' })).toHaveCount(0);
  await enterHoldOver(question);
  await question.getByRole('button', { name: 'Stop and open' }).click();
  const refused = page.getByRole('alertdialog', { name: 'Could not stop the take' });
  await expect(refused).toBeVisible();
  await expect(refused.getByRole('button', { name: 'Open anyway' })).toBeVisible();
  await expect(refused).toContainText('You can open it anyway');
  await expect(refused).not.toContainText('leave anyway');
  await expect(refused.getByRole('button', { name: 'Leave anyway' })).toHaveCount(0);
});

for (const how of ['Stay', 'Escape'] as const) {
  test(`${how} on the chapter question puts focus back on the chapter picker, not on the page`, async ({ page }) => {
    await recording(page, 'Production');
    // A DAW that went quiet leaves the picker enabled and asks before a chapter opens.
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.quiet());
    await page.waitForTimeout(1500);
    await picker(page).click();
    await page
      .getByRole('menuitemradio', { name: /Chapter 3/ })
      .or(page.getByRole('option', { name: /Chapter 3/ }))
      .first()
      .click();
    const question = page.getByRole('alertdialog', { name: 'Open another chapter?' });
    await expect(question).toBeVisible();
    await expect(question.getByRole('button', { name: 'Stop and open' })).toBeVisible();
    await enterHoldOver(question);
    if (how === 'Stay') await question.getByRole('button', { name: 'Stay' }).click();
    else await page.keyboard.press('Escape');
    await expect(question).toHaveCount(0);
    await expect(picker(page)).toBeFocused();
  });
}
