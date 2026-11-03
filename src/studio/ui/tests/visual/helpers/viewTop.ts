import type { Page } from '@playwright/test';

/**
 * Moves the Booth's view to the top of the chapter without moving the reading position. The mock's Chapter 1 opens at ¶ 14, where its
 * recording ends (#2633), so its first lines sit above the view; a test that works on them wheels up first. The wheel moves the view
 * by pixels and stops at the top (`useBrowseView`); the text eases there, so the first paragraph is waited for inside the window.
 */
export async function showChapterTop(page: Page): Promise<void> {
  const word = page.locator('[data-booth-text] [data-paragraph]:not([data-heading]) [data-word="0"]').first();
  const size = page.viewportSize() ?? { width: 1280, height: 800 };
  await word.waitFor({ state: 'attached' });
  const inWindow = async (): Promise<boolean> => {
    const box = await word.boundingBox();
    return !!box && box.x >= 0 && box.x + box.width <= size.width && box.y > 0 && box.y + box.height < size.height * 0.8;
  };
  await page.locator('[data-booth-text]').hover();
  await page.mouse.wheel(0, -200_000);
  // The column starts 30vh below the top of the view's range, so on a tall narrow window the first paragraph sits below the fold until the
  // view is moved down a little; it is nudged until the word is well inside the window.
  for (let tries = 0; tries < 30; tries++) {
    if (await inWindow()) return;
    const box = await word.boundingBox();
    if (box && box.y >= size.height * 0.6) await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
  }
  // The wheel did not bring it in: step the reading back to the chapter's start, as the Booth opened any chapter that had nothing recorded.
  for (let step = 0; step < 200; step++) await page.keyboard.press('ArrowUp');
  await page.locator('[data-state="cur"][data-unit="0"]').waitFor();
  for (let tries = 0; tries < 30 && !(await inWindow()); tries++) await page.waitForTimeout(100);
}

/** Puts the reading on the chapter's first paragraph, as a narrator would who clicks its first word, and leaves the view following it. */
export async function readFromTop(page: Page): Promise<void> {
  await showChapterTop(page);
  await page.locator('[data-booth-text] [data-paragraph]:not([data-heading]) [data-word="0"]').first().click();
}

/** The Booth has drawn the chapter's recorded-through chip; attached, not visible, since a setup notice or a narrow bar can hide it. */
export const boothChapterReady = (page: Page): Promise<void> =>
  page
    .getByRole('group', { name: /^Recorded through/, includeHidden: true })
    .first()
    .waitFor({ state: 'attached' });
