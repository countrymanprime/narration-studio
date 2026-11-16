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

// A pickup session (opened from Pickups with "Open in Booth at this line"): a plain Stop says "Take saved · 1 pickup marked recorded" with its Undo, and Stop and leave says it too,
// on the Pickups page it lands on, for its life (#3529, ux-reviewer: it used to go quiet because the leave stop was `quiet`).
test('Stop and leave in a pickup session says the take is saved and the pickup marked, with Undo, on the Pickups page', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await page
    .locator('aside:visible')
    .first()
    .getByRole('button', { name: /^Pickups(, \d+)?$/ })
    .click();
  await page.getByRole('region', { name: 'Pickups' }).getByRole('button', { name: 'Open in Booth at this line' }).first().click();
  await page
    .getByText(/^Pickups · \d+ open$/)
    .first()
    .waitFor();
  await record(page).click();
  await expect(stop(page)).toBeVisible();
  await pastStartGuard(page);
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await expect(question(page)).toContainText('Leaving the Booth for Pickups stops it.');
  await question(page).getByRole('button', { name: 'Stop and leave' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/pickups');
  const toast = page.getByText(/^Take saved · 1 pickup marked recorded$/);
  await expect(toast).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(toast).toBeVisible();
  const calls = () => page.evaluate(() => (window as unknown as { __hostCalls?: { name: string }[] }).__hostCalls?.map((call) => call.name) ?? []);
  const dawUndos = async () => (await calls()).filter((name) => name === 'dawUndoLast').length;
  const openCount = async () => {
    const label =
      (await page
        .locator('aside:visible')
        .first()
        .getByRole('button', { name: /^Pickups(, \d+)?$/ })
        .textContent()) ?? '';
    return Number(/(\d+)/.exec(label)?.[1] ?? 0);
  };
  const before = await dawUndos();
  const openBefore = await openCount();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(toast).toHaveCount(0);
  // The mark comes back first, then the take: the other order is refused by the journal and never reaches the DAW.
  await expect.poll(dawUndos).toBeGreaterThan(before);
  // The page re-reads the list when the window is used again (it does not watch the journal), so read it as that does.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(openCount).toBe(openBefore + 1);
});

// The same Undo after a plain Stop (older than #3529, which put it on the leave path too): the mark comes back first, then the take, so the DAW is asked to undo
// and the pickup reads Open again. The other order was refused by the journal ("Undo '1 pickup marked recorded' first") and nothing came back.
test('Undo after a plain Stop in a pickup session takes the take back and opens the pickup again', async ({ page }) => {
  await page.goto('/?mockCallLog=1');
  await settlePage(page);
  await page
    .locator('aside:visible')
    .first()
    .getByRole('button', { name: /^Pickups(, \d+)?$/ })
    .click();
  await page.getByRole('region', { name: 'Pickups' }).getByRole('button', { name: 'Open in Booth at this line' }).first().click();
  const opened = page.getByText(/^Pickups · \d+ open$/).first();
  await opened.waitFor();
  const open = async () => Number(/(\d+)/.exec((await opened.textContent()) ?? '')?.[1] ?? 0);
  const openBefore = await open();
  await record(page).click();
  await expect(stop(page)).toBeVisible();
  await pastStartGuard(page);
  await page.waitForTimeout(2500);
  await stop(page).click();
  const toast = page.getByText(/^Take saved · 1 pickup marked recorded$/);
  await expect(toast).toBeVisible();
  await expect.poll(open).toBe(openBefore - 1);
  const dawUndos = async () =>
    (await page.evaluate(() => (window as unknown as { __hostCalls?: { name: string }[] }).__hostCalls?.map((call) => call.name) ?? [])).filter(
      (name) => name === 'dawUndoLast',
    ).length;
  const before = await dawUndos();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(toast).toHaveCount(0);
  await expect.poll(dawUndos).toBeGreaterThan(before);
  await expect.poll(open).toBe(openBefore);
});
