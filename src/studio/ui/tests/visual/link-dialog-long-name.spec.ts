import { expect, test } from '@playwright/test';

// #3416 item 14: a very long chapter name took the whole Link a track dialog in a 320x300 window (body 0 px: the picker and Create button out of reach).
// The name is clipped in the title and the title takes two lines in a short window, so the body keeps room to scroll and both actions stay in view.
// The odd-titles book's third chapter has a 630-character title; Editing opens its link dialog by itself with the chapter unlinked.
const SIZES = [
  { width: 320, height: 300 },
  { width: 360, height: 500 },
];

for (const size of SIZES) {
  test(`the Link a track dialog keeps its body and actions in view at ${size.width}x${size.height} with a very long chapter name`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/editing/chapter-3?mockBooth=odd-titles&mockChapterLink=none');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 20_000 });
    await expect(dialog.getByRole('button', { name: 'Link track' })).toBeVisible();
    const measured = await page.evaluate(() => {
      const popup = document.querySelector('[role=dialog]') as HTMLElement;
      const body = popup.querySelector('[data-dialog-content]')?.parentElement as HTMLElement;
      const bounds = popup.getBoundingClientRect();
      const close = popup.querySelector('button[aria-label="Close"]')?.getBoundingClientRect();
      const link = [...popup.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Link track')?.getBoundingClientRect();
      return {
        bodyHeight: body.getBoundingClientRect().height,
        overflowX: popup.scrollWidth - popup.clientWidth,
        top: bounds.top,
        bottom: bounds.bottom,
        closeBottom: close?.bottom ?? Infinity,
        linkBottom: link?.bottom ?? Infinity,
        innerHeight: window.innerHeight,
      };
    });
    expect(measured.bodyHeight, 'the body has room for the picker to scroll into view').toBeGreaterThanOrEqual(50);
    expect(measured.overflowX).toBeLessThanOrEqual(0);
    expect(measured.closeBottom).toBeLessThanOrEqual(measured.innerHeight);
    expect(measured.linkBottom).toBeLessThanOrEqual(measured.innerHeight);
    expect(measured.bottom).toBeLessThanOrEqual(measured.innerHeight);
  });
}
