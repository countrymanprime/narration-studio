// What the shell does before it lets the narrator leave a page that holds something (#3400): a box that saves on blur is committed before a key press
// moves the page, a dialog is not left by a browser Back, and Save & continue never traps the narrator when a save does not answer. The editors that hold
// drafts of their own are driven by their screen's specs.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage, openSettings } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const picker = (page: Page) => page.getByRole('heading', { name: 'Choose your project' });
const switchProject = (page: Page) => page.getByRole('button', { name: /, switch project$/ }).click();
const unsaved = (page: Page, name: string) => page.getByRole('alertdialog', { name });

test('Alt+Left with the cursor still in a Settings box that saves on blur keeps what was typed', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Project');
  const narrator = page.getByRole('textbox', { name: /Narrator name/ });
  await narrator.fill('Ada Reader');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await openSettings(page, 'Project');
  await expect(page.getByRole('textbox', { name: /Narrator name/ })).toHaveValue('Ada Reader');
});

// The modal dialogs are exempt from the registry (draftHolders.guard.test.ts) because the exits are off while one is open: a typed project name stays.
test('Alt+Left with the New project dialog open does not leave it, and the typed name stays', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await switchProject(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: /new project/i });
  await dialog.getByRole('textbox').first().fill('A Book Not Yet Made');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(dialog.getByRole('textbox').first()).toHaveValue('A Book Not Yet Made');
});

// The exit is decided after the box that was focused has reported its edit: a focused invalid number box, Alt+Left, ten times over.
test('Alt+Left from a focused invalid number box asks every time', async ({ page }) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.goto('/');
    await settlePage(page);
    await openSettings(page, 'Set on a page');
    const entry = page.locator('[data-page-setting="ps.coverage"]');
    await entry.getByRole('button', { name: 'Change it here for now' }).click();
    const box = entry.getByLabel('Share of each paragraph that must be read', { exact: false }).first();
    await box.fill('abc');
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(unsaved(page, 'Unsaved settings'), `attempt ${attempt + 1}`).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(box).toBeFocused();
    await expect(box).toHaveValue('abc');
  }
});

test('a browser Back with a dialog open and nothing held leaves the dialog and the page where they were', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Script');
  await page.keyboard.press('Control+KeyK');
  await page.getByRole('combobox', { name: 'Jump menu' }).fill('> Show keyboard shortcuts');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => window.location.pathname)).toBe('/script');
});

// A save that never answers must not trap the narrator: after its limit the buttons come back and the text is still there.
test('a Settings save that never answers gives Cancel and Discard back after 15 seconds, and the edit stays', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: unknown }).__NARRATION_MOCK_OVERRIDES__ = { saveSettings: () => new Promise(() => {}) };
  });
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Set on a page');
  const entry = page.locator('[data-page-setting="ps.coverage"]');
  await entry.getByRole('button', { name: 'Change it here for now' }).click();
  const box = entry.getByRole('textbox', { name: 'Longest run of missing words allowed' });
  await box.fill('7');
  await switchProject(page);
  const question = unsaved(page, 'Unsaved settings');
  await question.getByRole('button', { name: 'Save & continue' }).click();
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(question).toBeVisible();
  await page.clock.fastForward(16_000);
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  await expect(page.getByText('Saving is taking too long. What you typed is still here.')).toBeVisible();
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(box).toHaveValue('7');
  await switchProject(page);
  await unsaved(page, 'Unsaved settings').getByRole('button', { name: 'Discard & continue' }).click();
  await expect(picker(page)).toBeVisible();
});

// Below 860 px the navigation is a drawer. It closes a moment after a page is picked and hands the focus back to its opener, outside the question; the question
// takes the focus back, whichever variant it is (#3446 B2).
test('the question from the navigation drawer holds the focus: Tab stays inside it and Escape closes it', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 600 });
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Set on a page');
  const entry = page.locator('[data-page-setting="ps.coverage"]');
  await entry.getByRole('button', { name: 'Change it here for now' }).click();
  await entry.getByRole('textbox', { name: 'Longest run of missing words allowed' }).fill('7');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('dialog', { name: /navigation/i })
    .getByRole('button', { name: /^Script/ })
    .click();
  const question = unsaved(page, 'Unsaved settings');
  await expect(question).toBeVisible();
  await expect.poll(() => question.evaluate((node) => node.contains(document.activeElement)), { timeout: 3000 }).toBe(true);
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('Tab');
    // The dialog's own focus guard (an empty span at the edge of the trap) is the one stop outside the dialog that is allowed; the page behind never is.
    const where = await question.evaluate((node) => {
      const active = document.activeElement;
      return node.contains(active) || (active instanceof HTMLSpanElement && (active.textContent ?? '') === '')
        ? 'ok'
        : `${active?.tagName}: ${active?.textContent?.slice(0, 40)}`;
    });
    expect(where, `Tab ${step + 1}`).toBe('ok');
  }
  await page.keyboard.press('Escape');
  await expect(question).toBeHidden();
});

// The focus rescue must not depend on timers: on a slow machine the drawer hands the focus back to its opener late, and Enter there reopened the drawer over the
// question (#3446 D3). With the page's work slowed 20 times, the focus still ends inside the question, and Enter does not open the drawer.
test('under a 20x CPU slowdown the question still holds the focus and Enter does not reopen the drawer', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 600 });
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Set on a page');
  const entry = page.locator('[data-page-setting="ps.coverage"]');
  await entry.getByRole('button', { name: 'Change it here for now' }).click();
  await entry.getByRole('textbox', { name: 'Longest run of missing words allowed' }).fill('7');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  await page
    .getByRole('dialog', { name: /navigation/i })
    .getByRole('button', { name: /^Script/ })
    .click();
  const question = unsaved(page, 'Unsaved settings');
  await expect(question).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => question.evaluate((node) => node.contains(document.activeElement)), { timeout: 20_000 }).toBe(true);
  await page.keyboard.press('Enter');
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect(page.getByRole('dialog', { name: /navigation/i })).toHaveCount(0);
});
