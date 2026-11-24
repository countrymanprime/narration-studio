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
// The drawn toast's text: a toast that waits behind another is also read out from a screen-reader-only line (`data-toast-announce`).
const saved = (page: Page) => page.locator('[data-toast-text]', { hasText: /^Take saved$/ });

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
    await expect(question(page)).toContainText(`Leaving the Booth for ${exit.page} stops it and saves the take.`);
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

// A pickup session (opened from Pickups with "Open in Booth at this line"): Stop and leave says "Take saved · 1 pickup marked recorded" on the Pickups page it lands on, for the
// toast's life and with no Undo (a plain Stop keeps its own toast and Undo; the pickup Undo path is #3545). It used to go quiet because the leave stop was `quiet` (#3529).
test('Stop and leave in a pickup session says the take is saved and the pickup marked, with no Undo, on the Pickups page', async ({ page }) => {
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
  await expect(question(page)).toContainText('Leaving the Booth for Pickups stops it and saves the take.');
  await question(page).getByRole('button', { name: 'Stop and leave' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/pickups');
  const toast = page.getByText(/^Take saved · 1 pickup marked recorded$/);
  await expect(toast).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await page.waitForTimeout(2500);
  await expect(toast).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
});

// qa-breaker B1 (#3529): the passage map's run is written between the stop and the move. With it taking 6 s (longer than a toast lives), "Take saved" with Undo must still be
// on the page landed on: it is raised at the move, so its clock starts there. Class guard: what is promised for the next page is raised at the move, not before an awaited step.
test('Take saved is on the page landed on when the passage map write takes 6 seconds', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __NARRATION_MOCK_OVERRIDES__?: Record<string, unknown> };
    w.__NARRATION_MOCK_OVERRIDES__ = Object.assign(w.__NARRATION_MOCK_OVERRIDES__ ?? {}, {
      passageMapRecordRun: async () => {
        await new Promise((resolve) => setTimeout(resolve, 6000));
      },
    });
  });
  await recording(page);
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: 'Stop and leave' }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 20_000 }).toBe('/script');
  await expect(saved(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(saved(page)).toBeVisible();
});

// ux-reviewer and qa-breaker on the B1 fix (N1): REAPER's transport says the take ended, and its stop reply trails by 2.5 s, more than the leave's 1.5 s grace. The move does not wait
// for the reply, so "Take saved" with Undo is raised when the reply comes, on the page landed on, and is not held for good.
test("Take saved is on the page landed on when REAPER's stop reply trails its transport by 2.5 seconds", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __NARRATION_MOCK_OVERRIDES__?: Record<string, unknown>; __NARRATION_MOCK_DAW__: { record: (what: string) => unknown } };
    w.__NARRATION_MOCK_OVERRIDES__ = Object.assign(w.__NARRATION_MOCK_OVERRIDES__ ?? {}, {
      readAloudRecordStop: async () => {
        w.__NARRATION_MOCK_DAW__.record('stop');
        await new Promise((resolve) => setTimeout(resolve, 2500));
        return { outcome: 'stopped', undoPoints: 1, message: '' };
      },
    });
  });
  await recording(page);
  await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: 'Stop and leave' }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 20_000 }).toBe('/script');
  await expect(saved(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
});
