import { expect, test } from '@playwright/test';

// #3416 items 97 and 98 (qa-breaker on #3481): the project chooser opened from the header's project name, or booted straight into (`?mockNoProject=1`), left focus on <body>, so
// nothing showed where a keyboard user was. The chooser's <main> takes the focus when the chooser appears with focus on nothing.
const focusedTag = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return { tag: active?.tagName, label: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').slice(0, 40) };
  });

test('Project chooser opened from the header name puts focus on the page, not the body', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/');
  await page.getByRole('table', { name: 'Chapter pipeline' }).waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: /, switch project$/ }).click();
  await page.getByRole('button', { name: /^Back/ }).waitFor({ timeout: 10_000 });
  await expect.poll(async () => (await focusedTag(page)).tag, { message: 'focus is on the chooser page' }).toBe('MAIN');
});

test('Project chooser opened from the header name by keyboard puts focus on the page, not the body', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/');
  await page.getByRole('table', { name: 'Chapter pipeline' }).waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: /, switch project$/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^Back/ }).waitFor({ timeout: 10_000 });
  await expect.poll(async () => (await focusedTag(page)).tag, { message: 'focus is on the chooser page' }).toBe('MAIN');
});

test('Project chooser booted into with no project puts focus on the page, not the body', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/?mockNoProject=1');
  await page.locator('main').first().waitFor({ timeout: 20_000 });
  await expect.poll(async () => (await focusedTag(page)).tag, { message: 'focus is on the chooser page' }).toBe('MAIN');
});

// The qa-breaker's pin on #3506: with focus on the chooser's <main> (no ring drawn on a tabIndex -1 page, like the shell's own <main>), the first Tab reaches the first control, not the skip link.
test('Project chooser: the first Tab from its page lands on a control, not the skip link', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/?mockNoProject=1');
  await page.locator('main').first().waitFor({ timeout: 20_000 });
  await expect.poll(async () => (await focusedTag(page)).tag).toBe('MAIN');
  await page.keyboard.press('Tab');
  const next = await focusedTag(page);
  expect(next.tag, `Tab went to ${next.tag} "${next.label}"`).toBe('BUTTON');
  expect(next.label).not.toMatch(/skip to content/i);
});
