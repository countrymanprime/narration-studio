// The built public site (scripts/site/build-demo-site.mjs): the landing page, the real UI in its mock mode and Storybook, served from a
// sub-path. What a visitor does first: open the demo, decide a note, see it in Pickups.
import { expect, test, type Page } from '@playwright/test';

// The rail's, Production's and Pickups' counts and lines are read by what the visitor sees, not by a test hook.
const rail = (page: Page, name: RegExp) => page.locator('nav').first().getByRole('button', { name });
const railCount = async (page: Page, name: RegExp): Promise<number> => Number(((await rail(page, name).innerText()).match(/\d+/) ?? ['0'])[0]);

// A load from outside the site's own sub-path is a bug in a page that must open from any sub-path and from a sandboxed frame.
function watchRequests(page: Page): { outside: string[]; failed: string[]; errors: string[] } {
  const seen = { outside: [] as string[], failed: [] as string[], errors: [] as string[] };
  const own = new URL(page.context().browser() ? 'http://localhost' : 'http://localhost').origin;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== own && url.hostname !== 'localhost') seen.outside.push(request.url());
    else if (!url.pathname.startsWith('/narration-utils/')) seen.outside.push(request.url());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) seen.failed.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => seen.failed.push(request.url()));
  page.on('pageerror', (error) => seen.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') seen.errors.push(message.text());
  });
  return seen;
}

test('the landing page links the demo by a relative address and loads nothing from outside the site', async ({ page }) => {
  const seen = watchRequests(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Proof every chapter');
  await expect(page.getByRole('link', { name: 'Try the live demo' })).toHaveAttribute('href', 'demo/index.html');
  expect(seen).toEqual({ outside: [], failed: [], errors: [] });
});

test('the demo is the real app on a sample project, and a note marked Needs pickup reaches the rail, Pickups and Production', async ({ page }) => {
  const seen = watchRequests(page);
  await page.goto('./');
  await page.getByRole('link', { name: 'Try the live demo' }).first().click();
  await expect(page.getByRole('note').filter({ hasText: 'Demo' })).toBeVisible();
  await expect(page.getByText('Alice’s Adventures in Wonderland').first()).toBeVisible();

  await rail(page, /^Proof/i).click();
  await expect(page).toHaveURL(/#\/proof/);
  const pickupsBefore = await railCount(page, /^Pickups/i);
  await page
    .getByRole('button', { name: /^needs pickup/i })
    .first()
    .click();
  // The rail follows the decision at once, with no page move.
  await expect.poll(() => railCount(page, /^Pickups/i)).toBe(pickupsBefore + 1);

  await rail(page, /^Pickups/i).click();
  await expect(page.getByRole('main').getByText('Proof note').first()).toBeVisible();
  await expect(page.getByRole('main').getByText('liceA')).toBeVisible();

  await rail(page, /^Production/i).click();
  await expect(page.getByRole('main').getByText('Open pickups', { exact: false }).first()).toBeVisible();
  await expect(
    page
      .getByRole('main')
      .getByText(String(pickupsBefore + 1), { exact: true })
      .first(),
  ).toBeVisible();
  expect(seen).toEqual({ outside: [], failed: [], errors: [] });
});
