// Focus after Escape. Whatever a narrator opens from a control (a chip that expands in place, a header toggle, the drawer, the jump menu) must,
// when Escape closes it, hand focus back to the control that opened it - never to <body> or to the page's first button.
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

const WORDS = '[data-script] [data-kind="w"][data-k]';
const CHIP = '[data-tchip]';

/** `TAG#id` of the focused element, or its accessible name when it has no id: what a failure should print. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'BODY';
    return `${el.tagName}${el.id ? `#${el.id}` : ''}${el.getAttribute('data-tchip') ? '[data-tchip]' : ''}`;
  });

async function openEditing(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editing/chapter-1');
  await settlePage(page);
  await page.locator(WORDS).first().waitFor();
}

test.describe('Editing: Escape keeps focus where the narrator opened something', () => {
  test('the Takes chip collapses and keeps focus', async ({ page }) => {
    await openEditing(page);
    const chip = page.locator(CHIP).first();
    await chip.focus();
    await page.keyboard.press('Enter');
    await expect(chip).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(await focused(page)).toBe('BUTTON[data-tchip]');
  });

  test('Escape from inside the opened takes collapses them and focuses the chip', async ({ page }) => {
    await openEditing(page);
    const chip = page.locator(CHIP).first();
    await chip.focus();
    await page.keyboard.press('Enter');
    const group = page.locator(`#${await chip.getAttribute('aria-controls')}`);
    await group.locator('button').first().focus();
    // The first Escape closes the control's hint (a hint owns Escape while it shows); the next folds the takes.
    await page.keyboard.press('Escape');
    if ((await chip.getAttribute('aria-expanded')) === 'true') await page.keyboard.press('Escape');
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(await focused(page)).toBe('BUTTON[data-tchip]');
  });

  test('the Timeline toggle keeps focus', async ({ page }) => {
    await openEditing(page);
    await page.locator('#striptoggle').focus();
    await page.keyboard.press('Escape');
    expect(await focused(page)).toBe('BUTTON#striptoggle');
  });

  test('the drawer closes on Escape from inside it and focus returns to its toggle', async ({ page }) => {
    await openEditing(page);
    await page.locator('#drawertoggle').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#drawer')).toHaveCount(1);
    await page.locator('#drawer').getByRole('tab').first().focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer')).toHaveCount(0);
    expect(await focused(page)).toBe('BUTTON#drawertoggle');
  });

  test('the drawer closes on Escape from its toggle, which keeps focus', async ({ page }) => {
    await openEditing(page);
    await page.locator('#drawertoggle').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#drawer')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer')).toHaveCount(0);
    expect(await focused(page)).toBe('BUTTON#drawertoggle');
  });

  // Escape lets the selection go and nothing more: blurring the script text would drop the narrator on <body> (#2136), and Tab already leaves it.
  test('Escape in the script text lets the selection go and focus stays on the script text', async ({ page }) => {
    await openEditing(page);
    await page.locator(WORDS).nth(3).click();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-sel]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-script]')).toBeFocused();
  });
});

// The jump menu is the same top-bar layer on every page: it must give focus back to whatever had it, from any page.
const JUMP_FROM: { name: string; path: string; control: string }[] = [
  { name: 'Editing', path: '/editing/chapter-1', control: '#drawertoggle' },
  { name: 'Script', path: '/script', control: 'main button:visible' },
  { name: 'Settings', path: '/settings', control: 'main button:visible' },
];

test.describe('The jump menu returns focus on Escape', () => {
  for (const from of JUMP_FROM) {
    test(`from ${from.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(from.path);
      await settlePage(page);
      const control = page.locator(from.control).first();
      await control.waitFor();
      await control.focus();
      const before = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        el.setAttribute('data-was-focused', '');
        return el.tagName;
      });
      await page.keyboard.press('Control+k');
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('[data-was-focused]')).toBeFocused();
      expect(before).not.toBe('BODY');
    });
  }

  test('after Escape on a header toggle, the menu returns to that toggle and not to the Back button', async ({ page }) => {
    await openEditing(page);
    await page.locator('#striptoggle').focus();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await focused(page)).toBe('BUTTON#striptoggle');
  });

  test('with nothing focused, focus lands inside the page, not on the body element', async ({ page }) => {
    await openEditing(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement))).toBe(true);
  });
});

// Proof: the notes, the Inspector's decisions and the undo history. Whatever the narrator acts on or opens, focus stays on that control
// (or on the equivalent one for the next note), and Escape hands it back to what opened the panel.
const NOTES_FIND = 'section[aria-label="Notes"] button[aria-label="Find in notes"]';
const INSPECTOR = 'aside[aria-label="Note"]';

async function openProof(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/proof?chapter=chapter-1');
  await settlePage(page);
  await page.locator(`${INSPECTOR} [role="group"][aria-label="Resolution"]`).waitFor();
}

/** The accessible name of the focused element, 'BODY' when nothing has focus. */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'BODY';
    return (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim();
  });

test.describe('Proof: focus stays with the control that acted', () => {
  for (const decision of ['Fine as read', 'Defer']) {
    test(`pressing ${decision} keeps focus on ${decision} for the next note`, async ({ page }) => {
      await openProof(page);
      await page
        .locator(`${INSPECTOR}`)
        .getByRole('button', { name: new RegExp(`^${decision}`) })
        .click();
      await page.waitForTimeout(600);
      expect(await focusedName(page)).toMatch(new RegExp(`^${decision}`));
    });
  }

  test('Needs pickup keeps focus in the decision group', async ({ page }) => {
    await openProof(page);
    await page
      .locator(INSPECTOR)
      .getByRole('button', { name: /^Needs pickup/ })
      .click();
    await page.waitForTimeout(600);
    const inGroup = await page.evaluate(() => document.activeElement?.closest('[role="group"][aria-label="Resolution"]') !== null);
    expect(inGroup).toBe(true);
  });

  test('a decision made with the key leaves focus on the notes row', async ({ page }) => {
    await openProof(page);
    await page.locator('section[aria-label="Notes"] tbody tr').first().focus();
    await page.keyboard.press('w');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.activeElement?.closest('section[aria-label="Notes"]') !== null)).toBe(true);
  });

  test('Reopen hands focus to the decision group, not to the body element', async ({ page }) => {
    await openProof(page);
    await page
      .locator(INSPECTOR)
      .getByRole('button', { name: /^Fine as read/ })
      .click();
    await page.waitForTimeout(600);
    await page.locator('section[aria-label="Notes"] tbody tr').first().click();
    const reopen = page.locator(INSPECTOR).getByRole('button', { name: /^Reopen/ });
    await reopen.focus();
    await page.keyboard.press('Enter');
    await expect(reopen).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.closest(`aside[aria-label="Note"]`) !== null)).toBe(true);
  });

  test('Escape in Find in notes closes it and focuses the Find button', async ({ page }) => {
    await openProof(page);
    await page.locator(NOTES_FIND).click();
    await page
      .getByRole('searchbox', { name: 'Find in notes' })
      .or(page.getByRole('textbox', { name: 'Find in notes' }))
      .first()
      .waitFor();
    await page.keyboard.press('Escape');
    await expect(page.locator(NOTES_FIND)).toBeFocused();
  });

  test('Ctrl+F then Escape returns to the control that had focus', async ({ page }) => {
    await openProof(page);
    const row = page.locator('section[aria-label="Notes"] tbody tr').first();
    await row.focus();
    await page.keyboard.press('Control+f');
    await page
      .getByRole('textbox', { name: 'Find in notes' })
      .or(page.getByRole('searchbox', { name: 'Find in notes' }))
      .first()
      .waitFor();
    await page.keyboard.press('Escape');
    await expect(row).toBeFocused();
  });
});

test.describe('The undo history returns focus on Escape to whatever opened it', () => {
  test('opened from the jump menu', async ({ page }) => {
    await openProof(page);
    const control = page.locator('section[aria-label="Notes"] button[aria-label="Find in notes"]');
    await control.focus();
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.type('undo history');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.locator('[data-slide-over]').waitFor();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-slide-over]')).toHaveCount(0);
    await expect(control).toBeFocused();
  });

  test('opened with Ctrl+Shift+H', async ({ page }) => {
    await openProof(page);
    const control = page.locator(NOTES_FIND);
    await control.focus();
    await page.keyboard.press('Control+Shift+H');
    await page.locator('[data-slide-over]').waitFor();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-slide-over]')).toHaveCount(0);
    await expect(control).toBeFocused();
  });

  test('opened with nothing focused, focus lands inside the page', async ({ page }) => {
    await openProof(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Control+Shift+H');
    await page.locator('[data-slide-over]').waitFor();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-slide-over]')).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement))).toBe(true);
  });
});
