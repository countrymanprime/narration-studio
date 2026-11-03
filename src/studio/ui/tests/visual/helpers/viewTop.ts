import type { Locator, Page } from '@playwright/test';

/**
 * Moves the Booth's view so `target` (default: the first word of the first body paragraph) is well inside the window, without moving the
 * reading position. The mock's Chapter 1 opens at ¶ 14, where its recording ends (#2633), so its first lines sit above the view; a test
 * that works on them wheels up first. The wheel moves the view by pixels and stops at the top (`useBrowseView`), the column starts 30vh
 * below that stop, and the text eases, so the view is then nudged either way until the target is in the window.
 */
export async function showChapterTop(page: Page, target?: Locator): Promise<void> {
  const word = target ?? page.locator('[data-booth-text] [data-paragraph]:not([data-heading]) [data-word="0"]').first();
  const size = page.viewportSize() ?? { width: 1280, height: 800 };
  await word.waitFor({ state: 'attached' });
  const inWindow = async (): Promise<boolean> => {
    const box = await word.boundingBox();
    return !!box && box.x >= 0 && box.x + box.width <= size.width && box.y > 0 && box.y + box.height < size.height * 0.9;
  };
  await page.locator('[data-booth-text]').hover();
  await page.mouse.wheel(0, -200_000);
  for (let tries = 0; tries < 40; tries++) {
    if (await inWindow()) return;
    const box = await word.boundingBox();
    if (box && box.y >= size.height * 0.6) await page.mouse.wheel(0, 120);
    else if (box && box.y <= 0) await page.mouse.wheel(0, -120);
    await page.waitForTimeout(100);
  }
  if (await inWindow()) return;
  // The wheel did not bring it in: step the reading back to the chapter's start, as the Booth opened any chapter that had nothing recorded.
  // While a take runs the arrow keys leave the reading where it is, so the help is tried and its failure left to the test's own click.
  await readFromStart(page, 3_000).catch(() => undefined);
  for (let tries = 0; tries < 30 && !(await inWindow()); tries++) await page.waitForTimeout(100);
}

/**
 * Puts the reading back on the chapter's first phrase with the keyboard, the place any chapter with nothing recorded opens at. It does not
 * click a word: the first word of Chapter 1 is a Story Bible name, whose reference panel would open over the text at narrow widths.
 */
export async function readFromStart(page: Page, timeout = 30_000): Promise<void> {
  for (let step = 0; step < 200; step++) await page.keyboard.press('ArrowUp');
  await page.locator('[data-state="cur"][data-unit="0"]').waitFor({ timeout });
}

/** The Booth has drawn the chapter's recorded-through chip; attached, not visible, since a setup notice or a narrow bar can hide it. */
export const boothChapterReady = (page: Page): Promise<void> =>
  page
    .getByRole('group', { name: /^Recorded through/, includeHidden: true })
    .first()
    .waitFor({ state: 'attached' });
