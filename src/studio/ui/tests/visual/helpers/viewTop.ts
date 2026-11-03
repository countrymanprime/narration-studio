import type { Page } from '@playwright/test';

/**
 * Moves the Booth's view to the top of the chapter without moving the reading position. The mock's Chapter 1 opens at ¶ 14, where its
 * recording ends (#2633), so its first lines sit above the view; a test that works on them wheels up first. The wheel moves the view
 * by pixels and stops at the top (`useBrowseView`); the text eases there, so the first paragraph is waited for inside the window.
 */
export async function showChapterTop(page: Page): Promise<void> {
  await page.locator('[data-booth-text]').hover();
  await page.mouse.wheel(0, -200_000);
  const first = page.locator('[data-booth-text] [data-paragraph]').first();
  const height = page.viewportSize()?.height ?? 800;
  await first.waitFor();
  for (let tries = 0; tries < 40; tries++) {
    const box = await first.boundingBox();
    if (box && box.y > 0 && box.y < height) return;
    await page.waitForTimeout(100);
  }
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
