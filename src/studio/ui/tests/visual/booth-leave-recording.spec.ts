// Every way out of the Booth while a take records asks the way Escape does, and none leaves the DAW recording on another page with no Stop (#3325).
// The Booth hides the navigation rail, so the narrator's exits are Escape, Exit and the browser's Back; the last two ran past the question before.
import { expect, test, type Page } from '@playwright/test';
import { pastStartGuard } from './helpers/startGuard';
import { settlePage } from './helpers/settle';
import { showChapterTop } from './helpers/viewTop';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });

const record = (page: Page) => page.getByRole('button', { name: /^Record$/, includeHidden: true });
const stop = (page: Page) => page.getByRole('button', { name: /^Stop$/ });
const question = (page: Page) => page.getByRole('alertdialog', { name: /^Stop recording\?$/ });
const dawRecording = (page: Page) => page.evaluate(() => window.__NARRATION_MOCK_DAW__?.state().recording);
const onBooth = (page: Page) => page.evaluate(() => window.location.pathname === '/booth');

/** Production, then the Booth (so Back has somewhere to go), with a take running. */
async function recording(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await record(page).click();
  await expect(stop(page)).toBeVisible();
  await expect.poll(() => dawRecording(page)).toBe(true);
  await pastStartGuard(page);
}

test('browser Back during a take asks "Stop recording?", and Keep recording stays in the Booth', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => window.history.back());
  await expect(question(page)).toBeVisible();
  expect(await dawRecording(page)).toBe(true);
  await question(page)
    .getByRole('button', { name: /Keep recording|Cancel/ })
    .click();
  await expect(question(page)).toHaveCount(0);
  expect(await onBooth(page)).toBe(true);
  expect(await dawRecording(page)).toBe(true);
  await expect(stop(page)).toBeVisible();
});

test('browser Back during a take: Stop and leave stops the take and leaves exactly once', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => window.history.back());
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await expect.poll(() => dawRecording(page)).toBe(false);
  expect(await page.evaluate(() => window.location.pathname)).toBe('/');
  // One step back, not two: the entry before Production (the app's first) is where history started.
  expect(await page.evaluate(() => window.history.state?.idx)).toBe(0);
});

test('Back pressed twice while the question is open asks once', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => window.history.back());
  await expect(question(page)).toBeVisible();
  await page.evaluate(() => window.history.back());
  await page.waitForTimeout(300);
  await expect(page.getByRole('alertdialog', { includeHidden: true })).toHaveCount(1);
  expect(await onBooth(page)).toBe(true);
  expect(await dawRecording(page)).toBe(true);
});

test('Escape, then Back with the question open, leaves one question and the take running', async ({ page }) => {
  await recording(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog').first()).toBeVisible();
  await page.evaluate(() => window.history.back());
  await page.waitForTimeout(300);
  await expect(page.getByRole('alertdialog', { includeHidden: true })).toHaveCount(1);
  expect(await onBooth(page)).toBe(true);
  expect(await dawRecording(page)).toBe(true);
});

test('Forward into the Booth, then Back with nothing recording, leaves with no question', async ({ page }) => {
  await recording(page);
  await page.evaluate(() => window.history.back());
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await expect.poll(() => dawRecording(page)).toBe(false);
  // Forward to the Booth: nothing records there, so Back leaves with no question.
  await page.evaluate(() => window.history.forward());
  await expect(record(page)).toBeVisible();
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('Back with nothing recording leaves with no question', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('Escape still asks, and Stop and leave stops the take', async ({ page }) => {
  await recording(page);
  await page.keyboard.press('Escape');
  await question(page).getByRole('button', { name: /^Stop/ }).click();
  await expect.poll(() => dawRecording(page)).toBe(false);
  await expect(page.locator('[data-booth-text]')).toHaveCount(0);
});

test('the keyboard Back (Alt+Left) asks too, and Keep recording keeps the take', async ({ page }) => {
  await recording(page);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(question(page)).toBeVisible();
  await question(page)
    .getByRole('button', { name: /Keep recording|Cancel/ })
    .click();
  await expect(question(page)).toHaveCount(0);
  expect(await onBooth(page)).toBe(true);
  expect(await dawRecording(page)).toBe(true);
});

// Every exit the narrator can reach ends one of two ways, whatever the DAW answers: the take is stopped and the page goes, or the stop is refused and the
// Booth stays with the host's sentence and "Leave anyway". None leaves the page with the DAW still recording.
type Exit = { name: string; start?: (page: Page) => Promise<void>; go: (page: Page) => Promise<void> };
const EXITS: Exit[] = [
  { name: 'Escape', go: (page) => page.keyboard.press('Escape') },
  { name: 'Back', go: (page) => page.evaluate(() => window.history.back()) },
  { name: 'Alt+Left', go: (page) => page.keyboard.press('Alt+ArrowLeft') },
  { name: 'Ctrl+,', go: (page) => page.keyboard.press('Control+Comma') },
  {
    name: 'the jump menu',
    go: async (page) => {
      await page.keyboard.press('Control+KeyK');
      await page.getByRole('combobox', { name: 'Jump menu' }).fill('Script');
      await page
        .getByRole('option', { name: /Script/ })
        .first()
        .click();
    },
  },
  {
    // Forward out of the Booth needs a later entry: leave by Escape (to Script), come Back to the Booth, and record there.
    name: 'Forward',
    start: async (page) => {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { level: 1, name: 'Script' })).toBeVisible();
      await page.evaluate(() => window.history.back());
      await expect(record(page)).toBeEnabled();
    },
    go: (page) => page.evaluate(() => window.history.forward()),
  },
];

for (const exit of EXITS) {
  test(`${exit.name} during a take: Stop and leave stops the take and the page goes`, async ({ page }) => {
    if (exit.start) {
      await page.goto('/');
      await settlePage(page);
      await goToPage(page, 'Booth');
      await exit.start(page);
      await record(page).click();
      await expect(stop(page)).toBeVisible();
      await pastStartGuard(page);
    } else await recording(page);
    await exit.go(page);
    await question(page).getByRole('button', { name: /^Stop/ }).click();
    await expect(page.locator('[data-booth-text]')).toHaveCount(0);
    await expect.poll(() => dawRecording(page)).toBe(false);
  });

  test(`${exit.name} during a take: a refused stop keeps the Booth with the sentence, and Leave anyway then leaves`, async ({ page }) => {
    if (exit.start) {
      await page.goto('/');
      await settlePage(page);
      await goToPage(page, 'Booth');
      await exit.start(page);
      await record(page).click();
      await expect(stop(page)).toBeVisible();
      await pastStartGuard(page);
    } else await recording(page);
    await page.evaluate(() => window.__NARRATION_MOCK_DAW__?.refuseNextRecord('Disk full.', 'stop'));
    await exit.go(page);
    await question(page).getByRole('button', { name: /^Stop/ }).click();
    const refused = page.getByRole('alertdialog', { name: /^Could not stop the take$/ });
    await expect(refused).toBeVisible();
    await expect(refused).toContainText('Disk full.');
    expect(await dawRecording(page)).toBe(true);
    await expect(page.locator('[data-booth-text]')).toHaveCount(1);
    await refused.getByRole('button', { name: 'Leave anyway' }).click();
    await expect(page.locator('[data-booth-text]')).toHaveCount(0);
  });
}

test('Back with Record options open asks nothing on top and does not move', async ({ page }) => {
  await recording(page);
  await page.getByRole('button', { name: 'Record options' }).click();
  await expect(page.getByRole('dialog', { name: 'Record options' })).toBeVisible();
  await page.evaluate(() => window.history.back());
  await page.waitForTimeout(300);
  await expect(page.getByRole('alertdialog', { includeHidden: true })).toHaveCount(0);
  expect(await onBooth(page)).toBe(true);
  expect(await dawRecording(page)).toBe(true);
});

test('Back while a start is still pending leaves with no question and starts no take', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: Record<string, unknown> }).__NARRATION_MOCK_OVERRIDES__ = {
      boothPunchTarget: () => new Promise((resolve) => setTimeout(() => resolve({ outcome: 'found', start: 12, end: 20 }), 2500)),
    };
  });
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Booth');
  await expect(record(page)).toBeEnabled();
  await showChapterTop(page);
  await page.locator('[data-booth-text] [data-word]').nth(40).click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: /Start from here/ })
    .first()
    .click();
  await expect(record(page)).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.waitForTimeout(3300);
  expect(await dawRecording(page)).toBe(false);
});

for (const [width, height] of [
  [320, 300],
  [360, 500],
] as const) {
  test(`the question from Back fits at ${width}x${height}, light and dark`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await recording(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => window.history.back());
      await expect(question(page)).toBeVisible();
      const box = await question(page).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      await question(page)
        .getByRole('button', { name: /Keep recording|Cancel/ })
        .click();
      await expect(question(page)).toHaveCount(0);
    }
  });
}
