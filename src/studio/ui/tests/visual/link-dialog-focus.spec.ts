import { expect, test, type Page } from '@playwright/test';

// #3416 item 27: after a link or a created track the Link a track dialog goes away with the notice that opened it; keyboard focus must land inside
// the page (its <main>), not fall to <body> where the next Tab starts from "Skip to content". Booth and Editing, by keyboard only.
const focusInPage = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    return active !== null && active !== document.body && Boolean(active.closest('main'));
  });

const PAGES: [string, string][] = [
  ['Booth', '/booth?mockReaperState=no_link'],
  ['Editing', '/editing?mockChapterLink=none'],
];

for (const [name, url] of PAGES) {
  for (const action of ['Link track', 'Create a new track']) {
    test(`${name}: focus stays in the page after "${action}" by keyboard`, async ({ page }) => {
      await page.goto(url);
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 20_000 });
      const button = dialog.getByRole('button', { name: action });
      await button.focus();
      await page.keyboard.press('Enter');
      await dialog.waitFor({ state: 'detached', timeout: 10_000 });
      await expect.poll(() => focusInPage(page), { timeout: 5_000, message: 'focus is inside main, not on body' }).toBe(true);
    });
  }
}
