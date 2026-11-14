import { expect, test } from '@playwright/test';

// #3416 item 70 (qa-breaker on #3469): "Switch project…" opens the full-page project chooser; going back (Escape or the Back button) rebuilds the shell and left focus on
// <body>, so the next Tab reached "Skip to content". Focus now lands on the page.
for (const way of ['Escape', 'Back'] as const) {
  test(`Project chooser: ${way} returns focus to the page, not the body`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto('/');
    await page.getByRole('table', { name: 'Chapter pipeline' }).waitFor({ timeout: 20_000 });
    await page.keyboard.press('Control+K');
    await page.getByRole('dialog', { name: /Jump menu/i }).waitFor();
    await page.waitForTimeout(400);
    await page.keyboard.type('Switch project');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    const back = page.getByRole('button', { name: /^Back/ });
    await back.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
    if (way === 'Escape') await page.keyboard.press('Escape');
    else await back.click();
    await page.getByRole('table', { name: 'Chapter pipeline' }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
    const landed = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return { tag: active?.tagName, label: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').slice(0, 40) };
    });
    expect(landed.tag, `focus is on ${landed.tag} "${landed.label}", not on the page's <main>`).toBe('MAIN');
    // Tab goes on through the page, not back to the skip link ahead of it.
    await page.keyboard.press('Tab');
    const next = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.slice(0, 30) ?? '');
    expect(next, 'the next Tab goes to the skip link').not.toMatch(/skip to content/i);
  });
}
