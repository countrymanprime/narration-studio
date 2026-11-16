// After "Stop and leave" the take is told as saved, with its Undo, on the page the narrator lands on, for the toast's whole life (#3529). The question names the page the move
// goes to, by the rail's name.
import { expect, test, type Page } from '@playwright/test';
import { pastStartGuard } from './helpers/startGuard';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const question = (page: Page) => page.getByRole('alertdialog', { name: /^Stop recording\?$/ });
const saved = (page: Page) => page.getByText('Take saved', { exact: true });

async function recording(page: Page): Promise<void> {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await record(page).click();
  await expect(stop(page)).toBeVisible();
  await pastStartGuard(page);
}

const exits = [
  { via: 'Escape', path: '/script', page: 'Script', go: (page: Page) => page.keyboard.press('Escape') },
  { via: 'Ctrl+,', path: '/settings', page: 'Settings', go: (page: Page) => page.keyboard.press('Control+Comma') },
  {
    via: 'the jump menu',
    path: '/proof',
    page: 'Proof',
    go: async (page: Page) => {
      await page.keyboard.press('Control+KeyK');
      await page.getByRole('combobox', { name: 'Jump menu' }).fill('Go to Proof');
      await page.keyboard.press('Enter');
    },
  },
] as const;

for (const exit of exits) {
  test(`Stop and leave by ${exit.via} names ${exit.page}, and "Take saved" with Undo is on ${exit.page} for its whole life`, async ({ page }) => {
    await recording(page);
    await exit.go(page);
    await expect(question(page)).toContainText(`Leaving the Booth for ${exit.page} stops it.`);
    await question(page).getByRole('button', { name: 'Stop and leave' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(exit.path);
    await expect(saved(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    // Still there after the move settled and the page drew, not a flash of it.
    await page.waitForTimeout(2500);
    await expect(saved(page)).toBeVisible();
  });
}

test('Undo on the toast, from the page landed on, takes the take back', async ({ page }) => {
  await recording(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: 'Stop and leave' }).click();
  await expect(saved(page)).toBeVisible();
  const calls = () => page.evaluate(() => (window as unknown as { __hostCalls?: { name: string }[] }).__hostCalls?.map((call) => call.name) ?? []);
  const before = (await calls()).filter((name) => /undo/i.test(name)).length;
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(saved(page)).toHaveCount(0);
  await expect.poll(async () => (await calls()).filter((name) => /undo/i.test(name)).length).toBeGreaterThan(before);
});

test('the toast goes at the next move: it outlives only the one it came with', async ({ page }) => {
  await recording(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: 'Stop and leave' }).click();
  await expect(saved(page)).toBeVisible();
  await goToPage(page, 'Proof');
  await expect(saved(page)).toHaveCount(0);
});
