// A Merriam-Webster key pasted into Settings and not saved is held text that is not one of Settings' saved fields; leaving, or swapping the pane under it, asks (#3400).
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { openSettings } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(60_000);

const picker = (page: Page) => page.getByRole('heading', { name: 'Choose your project' });
const switchProject = (page: Page) => page.getByRole('button', { name: /, switch project$/ }).click();
const unsaved = (page: Page) => page.getByRole('alertdialog', { name: 'Unsaved settings' });

async function pasteKey(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Voice & pronunciation');
  await page.getByRole('button', { name: /Advanced/ }).click();
  await page.getByRole('textbox', { name: 'Merriam-Webster key' }).fill('pasted-key-123');
}

test('Switch project over a pasted key asks, names the key, and Cancel keeps it', async ({ page }) => {
  await pasteKey(page);
  await switchProject(page);
  await expect(unsaved(page)).toContainText('Save or discard the key you pasted before leaving?');
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveValue('pasted-key-123');
  await expect(picker(page)).toHaveCount(0);
});

test('Alt+Left over a pasted key asks, and Discard & continue leaves', async ({ page }) => {
  await pasteKey(page);
  await page.getByRole('heading', { level: 2 }).first().click();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(unsaved(page)).toBeVisible();
  await unsaved(page).getByRole('button', { name: 'Discard & continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
});

test('another category and the Settings search ask over a pasted key, and the typing carries on after Cancel', async ({ page }) => {
  await pasteKey(page);
  await page
    .getByRole('navigation', { name: 'Settings categories' })
    .getByRole('button', { name: /^Appearance/ })
    .click();
  await expect(unsaved(page)).toContainText('before going on?');
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveValue('pasted-key-123');
  await page.getByRole('textbox', { name: 'Search settings' }).fill('abc');
  await expect(unsaved(page)).toBeVisible();
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveValue('pasted-key-123');
  // Cancel keeps the key, and the box reads what the results are for again (#3456).
  await expect(page.getByRole('textbox', { name: 'Search settings' })).toHaveValue('');
  // Discard & continue applies the search.
  await page.getByRole('textbox', { name: 'Search settings' }).fill('abcd');
  await unsaved(page).getByRole('button', { name: 'Discard & continue' }).click();
  await expect(page.getByRole('textbox', { name: 'Search settings' })).toHaveValue('abcd');
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveCount(0);
});

test.describe('at 320 x 300', () => {
  test.use({ viewport: { width: 320, height: 300 } });
  test('the question over a pasted key shows its whole sentence', async ({ page }) => {
    await pasteKey(page);
    await page.keyboard.press('Alt+ArrowLeft');
    const question = unsaved(page);
    await expect(question).toBeVisible();
    const box = await question.boundingBox();
    expect(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 300).toBe(true);
    await expect(question).toContainText('before leaving?');
  });
});

// Collapsing Advanced unmounts the Merriam-Webster box, and the key pasted into it (#3456).
test('collapsing Advanced over a pasted key asks, and Cancel keeps the key', async ({ page }) => {
  await pasteKey(page);
  await page.getByRole('button', { name: /Advanced/ }).click();
  await expect(unsaved(page)).toBeVisible();
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveValue('pasted-key-123');
});

// A browser Back across hash-only Settings entries swaps the category under the key (#3456).
test('browser Back over a hash-only Settings entry asks over a pasted key, and Cancel keeps the key and the pane', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Project');
  await page.evaluate(() => {
    window.location.hash = '#category-delivery';
  });
  await page.evaluate(() => {
    window.location.hash = '#category-voice';
  });
  await page.getByRole('button', { name: /Advanced/ }).click();
  await page.getByRole('textbox', { name: 'Merriam-Webster key' }).fill('pasted-key-123');
  const before = page.url();
  await page.goBack();
  await expect(unsaved(page)).toBeVisible();
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  expect(page.url()).toBe(before);
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveValue('pasted-key-123');
});

test('a typed hash change of Settings asks over a pasted key', async ({ page }) => {
  await pasteKey(page);
  await page.evaluate(() => {
    window.location.hash = '#category-appearance';
  });
  await expect(unsaved(page)).toBeVisible();
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveValue('pasted-key-123');
});

// A fragment typed by hand is an entry the router never numbered: a Back from it must still be read as a Back (#3456, qa-breaker on ea2f9c2).
async function typedHashWithKey(page: Page, reloadAfter = false): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Voice & pronunciation');
  await page.evaluate(() => {
    window.location.hash = '#category-voice';
  });
  if (reloadAfter) {
    await page.reload();
    await settlePage(page);
  }
  await page.getByRole('button', { name: /Advanced/ }).click();
  await page.getByRole('textbox', { name: 'Merriam-Webster key' }).fill('pasted-key-123');
}

for (const reloadAfter of [false, true]) {
  test(`browser Back from a typed Settings hash with a pasted key keeps the address, and Cancel then a second Back asks again${reloadAfter ? ' (after a reload)' : ''}`, async ({
    page,
  }) => {
    await typedHashWithKey(page, reloadAfter);
    const before = page.url();
    await page.goBack();
    await expect(unsaved(page)).toBeVisible();
    await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
    expect(page.url()).toBe(before);
    await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveValue('pasted-key-123');
    await page.goBack();
    await expect(unsaved(page)).toBeVisible();
    expect(page.url()).toBe(before);
    await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
    // One Back that is answered with Discard reaches the previous distinct entry and not two.
    await page.goBack();
    await unsaved(page).getByRole('button', { name: 'Discard & continue' }).click();
    await expect(unsaved(page)).toHaveCount(0);
    expect(new URL(page.url()).hash).not.toBe('#category-voice');
  });
}

// A hash typed in the middle of the history truncates what was ahead, so the history does not grow; the entry must still be numbered (#3456, qa-breaker on 10e536f).
test('typed hash from a middle entry with a pasted key: Cancel restores the address and the pane; Discard goes to the typed pane', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Project');
  for (const hash of ['#category-delivery', '#category-recording']) {
    await page.evaluate((next) => {
      window.location.hash = next;
    }, hash);
  }
  await page.goBack();
  await page.evaluate(() => {
    window.location.hash = '#category-voice';
  });
  await page.getByRole('button', { name: /Advanced/ }).click();
  await page.getByRole('textbox', { name: 'Merriam-Webster key' }).fill('pasted-key-123');
  const before = page.url();
  await page.evaluate(() => {
    window.location.hash = '#category-recording';
  });
  await expect(unsaved(page)).toBeVisible();
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  expect(page.url()).toBe(before);
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveValue('pasted-key-123');
  await page.evaluate(() => {
    window.location.hash = '#category-recording';
  });
  await unsaved(page).getByRole('button', { name: 'Discard & continue' }).click();
  await expect(page.getByRole('textbox', { name: 'Merriam-Webster key' })).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('#category-recording');
});

// The Search box and the results stay in step: Discard on a category change empties the box, and Escape then Cancel puts the applied text back (#3456).
test('after Discard on a category change the Search box is empty, and Escape then Cancel leaves box and results in step', async ({ page }) => {
  await pasteKey(page);
  const search = page.getByRole('textbox', { name: 'Search settings' });
  await search.fill('a');
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(search).toHaveValue('');
  // Changed once more over the same held key: the box still reads what the results are for.
  await search.fill('bc');
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(search).toHaveValue('');
  await page
    .getByRole('navigation', { name: 'Settings categories' })
    .getByRole('button', { name: /^Appearance/ })
    .click();
  await unsaved(page).getByRole('button', { name: 'Discard & continue' }).click();
  await expect(search).toHaveValue('');
});

test('Escape in Search over a key among the results, then Cancel, puts the applied text back and Escape works again', async ({ page }) => {
  await page.goto('/');
  await settlePage(page);
  await openSettings(page, 'Voice & pronunciation');
  const search = page.getByRole('textbox', { name: 'Search settings' });
  await search.fill('Merriam');
  await page.getByRole('textbox', { name: 'Merriam-Webster key' }).fill('pasted-key-123');
  await search.focus();
  await page.keyboard.press('Escape');
  await expect(unsaved(page)).toBeVisible();
  await unsaved(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(search).toHaveValue('Merriam');
  await search.focus();
  await page.keyboard.press('Escape');
  await expect(unsaved(page)).toBeVisible();
});
