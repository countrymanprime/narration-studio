import { expect, test } from '@playwright/test';

// #3416 items 96 and 75: a dialog opened with focus on <main> or on nothing returned focus to the header's project-switch button (the first tabbable control, which
// the dialog's library picks when handed the landmark) instead of the page. Undo history from the jump menu with focus on <main> (item 96) and the REAPER chip's
// dialog opened with focus on the body (item 75).
test('Undo history from the jump menu with focus on main: Escape does not leave focus in the header', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/script');
  await page.getByRole('main').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector<HTMLElement>('main')?.focus());
  await page.keyboard.press('Control+K');
  await page.getByRole('dialog', { name: /Jump menu/i }).waitFor();
  await page.waitForTimeout(400);
  await page.keyboard.type('undo history');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  const undo = page.getByRole('dialog', { name: /undo history/i });
  await undo.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(undo).toHaveCount(0, { timeout: 5_000 });
  await page.waitForTimeout(500);
  const where = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      inHeader: Boolean(active?.closest('header')),
      tag: active?.tagName,
      label: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').slice(0, 40),
    };
  });
  expect(where.inHeader, `focus is on ${where.tag} "${where.label}", in the header`).toBe(false);
});

test('The REAPER chip’s panel opened with focus on nothing: Escape does not leave focus in the header', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/');
  await page.getByRole('table', { name: 'Chapter pipeline' }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  // A programmatic click opens the panel without giving the chip focus, as a shortcut or a pointer on a non-focusing surface would.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    const chip = [...document.querySelectorAll<HTMLElement>('header button')].find((button) =>
      /^REAPER: /.test(button.getAttribute('aria-label') ?? button.textContent ?? ''),
    );
    chip?.click();
    (document.activeElement as HTMLElement | null)?.blur();
  });
  const panel = page.getByRole('dialog', { name: /Audio engine/ });
  await panel.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0, { timeout: 5_000 });
  await page.waitForTimeout(500);
  const where = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return {
      inHeader: Boolean(active?.closest('header')),
      tag: active?.tagName,
      label: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').slice(0, 40),
    };
  });
  expect(where.inHeader, `focus is on ${where.tag} "${where.label}", in the header`).toBe(false);
});
