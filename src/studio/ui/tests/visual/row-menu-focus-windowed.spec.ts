import { expect, test } from '@playwright/test';

// #3416 item 52 (qa-breaker on #3467): in a long book the pipeline draws only the rows in view. Open a panel from a row's menu, scroll the board far away while it
// is open, close it: the row was no longer drawn, so focus fell to <main> or the header. The row a panel was opened for now stays drawn.
for (const item of ['Chapter track…', 'Editing check…', 'Check recordings']) {
  test(`Windowed board: closing "${item}" after scrolling the board away returns focus to the row's control`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto('/?mockBooth=many-chapters');
    const table = page.getByRole('table', { name: 'Chapter pipeline' });
    await table.waitFor({ timeout: 30_000 });
    const row = table.locator('tr[data-chapter-id]').nth(5);
    const chapterId = await row.getAttribute('data-chapter-id');
    const control = row.locator('button, a[href]').first();
    await control.focus();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: item }).first().click();
    await page.waitForTimeout(500);
    // Scroll the board's scroller (the nearest ancestor that scrolls) to the end while the panel or dialog is open.
    await page.evaluate(() => {
      const tableElement = document.querySelector('table[aria-label="Chapter pipeline"]') as HTMLElement;
      for (let node: HTMLElement | null = tableElement; node; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)) node.scrollTop = node.scrollHeight;
      }
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    const landed = await page.evaluate((id) => {
      const active = document.activeElement as HTMLElement | null;
      return {
        inRow: Boolean(active?.closest(`tr[data-chapter-id="${id}"]`)),
        tag: active?.tagName,
        label: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').slice(0, 40),
      };
    }, chapterId);
    expect(landed.inRow, `focus landed on ${landed.tag} "${landed.label}", not in the chapter's row`).toBe(true);
  });
}
