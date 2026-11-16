// A question opened in a window as small as 400% zoom (275 x 200 CSS px) can still be answered: every action is reachable by Tab and is inside the dialog when it
// has the focus, and the question's text is not squeezed to nothing (#2998).
import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';
import { goToPage } from './drivers/shared';

test.use({ viewport: { width: 1440, height: 900 } });

/** The Story Bible's "Unsaved changes" question: an entry edit typed and not saved, then Production. */
async function openQuestion(page: Page): Promise<void> {
  await page.goto('/');
  await settlePage(page);
  await goToPage(page, 'Story Bible');
  await page.getByRole('table', { name: 'Story Bible entries' }).locator('[data-entry-id]').first().click();
  const unlock = page.getByRole('button', { name: 'Unlock entry' });
  if (await unlock.count()) await unlock.click();
  await page.getByRole('button', { name: 'Edit this entry' }).first().click();
  await page.getByRole('textbox', { name: 'Description' }).fill('A line typed and not saved.');
  await page
    .getByRole('button', { name: /^Production/ })
    .first()
    .click();
  await expect(page.getByRole('alertdialog', { name: 'Unsaved changes' })).toBeVisible();
}

for (const [width, height] of [
  [320, 300],
  [275, 200],
] as const) {
  test(`the unsaved-changes question can be answered at ${width}x${height}`, async ({ page }) => {
    await openQuestion(page);
    await page.setViewportSize({ width, height });
    const dialog = page.getByRole('alertdialog', { name: 'Unsaved changes' });
    // At rest, before any key: the question's text is on screen (not squeezed to nothing behind the actions) and a dialog taller than its room scrolls.
    const rest = await page.evaluate(() => {
      const box = document.querySelector('[role="alertdialog"]')!;
      const text = box.querySelector('p')!;
      const at = text.getBoundingClientRect();
      const hit = document.elementFromPoint(at.left + 4, at.top + 4);
      return { textShown: Boolean(hit && text.contains(hit)), overflowY: getComputedStyle(box).overflowY, overflows: box.scrollHeight > box.clientHeight };
    });
    expect(rest.textShown, 'the question text is on screen').toBe(true);
    if (rest.overflows) expect(rest.overflowY, 'a dialog taller than its room scrolls').toBe('auto');
    const reached = new Set<string>();
    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
      const seen = await page.evaluate(() => {
        const focused = document.activeElement as HTMLElement | null;
        const box = document.querySelector('[role="alertdialog"]')!.getBoundingClientRect();
        const at = focused!.getBoundingClientRect();
        return {
          name: (focused?.textContent ?? '').trim(),
          inside: at.top >= box.top - 1 && at.bottom <= box.bottom + 1 && at.left >= box.left - 1 && at.right <= box.right + 1,
        };
      });
      if (seen.name) {
        expect(seen.inside, `"${seen.name}" is inside the dialog when it has the focus`).toBe(true);
        reached.add(seen.name);
      }
    }
    for (const name of ['Cancel', 'Discard & continue', 'Save & continue']) expect(reached.has(name), `${name} is reachable by Tab`).toBe(true);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });
}
