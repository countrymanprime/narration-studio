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
    // At rest, before any key: the whole question text is on screen (its first and last line), every action is inside the popup, and the control that has the focus
    // is fully shown, so nothing is hidden below an edge with no sign that it is there.
    const rest = await page.evaluate(() => {
      const box = document.querySelector('[role="alertdialog"]')!;
      const frame = box.getBoundingClientRect();
      const text = box.querySelector('p')!;
      const at = text.getBoundingClientRect();
      const shown = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit && text.contains(hit));
      };
      const inside = (element: Element) => {
        const r = element.getBoundingClientRect();
        return r.top >= frame.top - 1 && r.bottom <= frame.bottom + 1 && r.left >= frame.left - 1 && r.right <= frame.right + 1;
      };
      const focused = document.activeElement;
      return {
        firstLine: shown(at.left + 4, at.top + 4),
        lastLine: shown(at.left + 4, at.bottom - 4),
        actions: [...box.querySelectorAll('button')].filter((b) => b.textContent!.trim()).map((b) => [b.textContent!.trim(), inside(b)] as const),
        focusedShown: !focused || focused === document.body || !box.contains(focused) || inside(focused),
      };
    });
    expect(rest.firstLine && rest.lastLine, 'the whole question text is on screen').toBe(true);
    expect(
      rest.actions.filter(([, shown]) => !shown).map(([name]) => name),
      'every action is inside the popup at rest',
    ).toEqual([]);
    expect(rest.focusedShown, 'the control that has the focus is fully shown').toBe(true);
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
