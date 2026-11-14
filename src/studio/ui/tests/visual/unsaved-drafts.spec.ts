// What the shell does before it lets the narrator leave a page that holds something (#3400): a box that saves on blur is committed before a key press
// moves the page, a dialog is not left by a browser Back, and Save & continue never traps the narrator when a save does not answer. The editors that hold
// drafts of their own are driven by their screen's specs.
import { expect, test, type Page } from '@playwright/test';
import { pressOnQuestion } from './helpers/questionKey';
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
  // key: the jump menu's own row, not the question
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

// The way to stay takes the focus when the question opens, and a keyboard user must see which button Enter presses: script focus is not always :focus-visible,
// so the stay button draws its ring whenever it is focused (#3446, ux-reviewer).
test('the question opened from the keyboard shows a focus ring on the way to stay', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Set on a page');
  const entry = page.locator('[data-page-setting="ps.coverage"]');
  await entry.getByRole('button', { name: 'Change it here for now' }).click();
  await entry.getByRole('textbox', { name: 'Longest run of missing words allowed' }).fill('7');
  await page.keyboard.press('Alt+ArrowLeft');
  const question = unsaved(page, 'Unsaved settings');
  await expect(question).toBeVisible();
  const cancel = question.getByRole('button', { name: 'Cancel' });
  await expect(cancel).toBeFocused();
  const outline = await cancel.evaluate((node) => {
    const style = getComputedStyle(node);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline).toEqual({ style: 'solid', width: '2px' });
});

// Cancel has the focus when the question opens, so the second Enter of a double press must not answer it before the narrator has seen it (#3446 E7).
test('a second Enter within 300 ms of the one that asked does not dismiss the question', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Set on a page');
  const entry = page.locator('[data-page-setting="ps.coverage"]');
  await entry.getByRole('button', { name: 'Change it here for now' }).click();
  await entry.getByRole('textbox', { name: 'Longest run of missing words allowed' }).fill('7');
  await page.getByRole('button', { name: 'Production' }).first().focus();
  // key: the echo of the press that asked, which is what this case is about
  await page.keyboard.press('Enter');
  // key: the second of the double press, still the echo
  await page.keyboard.press('Enter');
  const question = unsaved(page, 'Unsaved settings');
  await expect(question).toBeVisible();
  await page.waitForTimeout(600);
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(question).toHaveCount(0);
});

// A click on the backdrop drops the focus to <body>; it goes back to the way to stay, so Tab and Enter start from the question (#3459 L1).
test('a click on the backdrop leaves the focus inside the question', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Set on a page');
  const entry = page.locator('[data-page-setting="ps.coverage"]');
  await entry.getByRole('button', { name: 'Change it here for now' }).click();
  await entry.getByRole('textbox', { name: 'Longest run of missing words allowed' }).fill('7');
  await page.keyboard.press('Alt+ArrowLeft');
  const question = unsaved(page, 'Unsaved settings');
  await expect(question).toBeVisible();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.mouse.click(5, 450);
    await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();
  }
});

// A key held down from the press that asked repeats after the 300 ms window; a repeat must not press the way to stay (#3446, qa-breaker on #3459).
test('an Enter held down from the press that asked does not dismiss the question', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Set on a page');
  const entry = page.locator('[data-page-setting="ps.coverage"]');
  await entry.getByRole('button', { name: 'Change it here for now' }).click();
  await entry.getByRole('textbox', { name: 'Longest run of missing words allowed' }).fill('7');
  await page.getByRole('button', { name: 'Production' }).first().focus();
  const question = unsaved(page, 'Unsaved settings');
  for (let press = 0; press < 3; press += 1) {
    await page.keyboard.down('Enter');
    await page.waitForTimeout(700);
    await expect(question).toBeVisible();
  }
  await page.keyboard.up('Enter');
  await expect(question).toBeVisible();
});

async function holdSettingsEdit(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Set on a page');
  const entry = page.locator('[data-page-setting="ps.coverage"]');
  await entry.getByRole('button', { name: 'Change it here for now' }).click();
  await entry.getByRole('textbox', { name: 'Longest run of missing words allowed' }).fill('7');
}

// A touch tap on the backdrop is followed by compatibility mouse events that drop the focus to <body> again (#3446 B-1).
test.describe('a tap on the backdrop', () => {
  test.use({ hasTouch: true });
  test('leaves the focus inside the question', async ({ page }) => {
    await holdSettingsEdit(page);
    await page.keyboard.press('Alt+ArrowLeft');
    const question = unsaved(page, 'Unsaved settings');
    await expect(question).toBeVisible();
    await page.touchscreen.tap(5, 450);
    await page.waitForTimeout(500);
    await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();
  });
});

// While a save is in flight the way to stay is disabled, so the focus rescue needs another place to put it (#3446 B-2).
test('a click on the backdrop during a slow save keeps the focus inside the question', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __NARRATION_MOCK_OVERRIDES__: unknown }).__NARRATION_MOCK_OVERRIDES__ = {
      saveSettings: () => new Promise((resolve) => setTimeout(resolve, 3_000)),
    };
  });
  await holdSettingsEdit(page);
  await switchProject(page);
  const question = unsaved(page, 'Unsaved settings');
  await question.getByRole('button', { name: 'Save & continue' }).click();
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await page.mouse.click(5, 450);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="alertdialog"]')))).toBe(true);
});

// The other half of the echo window: once it is over, Enter on the way to stay answers the question (it has the focus).
test('Enter on the way to stay, after the echo window, answers the question', async ({ page }) => {
  await holdSettingsEdit(page);
  await page.keyboard.press('Alt+ArrowLeft');
  const question = unsaved(page, 'Unsaved settings');
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await pressOnQuestion(page, 'Enter');
  await expect(question).toHaveCount(0);
});
