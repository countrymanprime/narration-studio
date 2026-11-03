import type { Page } from '@playwright/test';

/**
 * Moves the Booth's view to the top of the chapter without moving the reading position. The mock's Chapter 1 opens at ¶ 14, where its
 * recording ends (#2633), so its first lines sit above the view; a test that works on them wheels up first. The wheel moves the view
 * by pixels and stops at the top (`useBrowseView`).
 */
export async function showChapterTop(page: Page): Promise<void> {
  await page.locator('[data-booth-text]').hover();
  await page.mouse.wheel(0, -200_000);
  await page.locator('[data-booth-text] [data-paragraph]').first().waitFor();
}
