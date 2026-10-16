import { expect, test, type Page } from '@playwright/test';
import { settlePage } from './helpers/settle';

// The cross-page seams in the real app (docs/reference/cross-page-handoffs.md), in a real browser with the browser's own history,
// reload and keys: where a hand-off lands the narrator, what a bad or stale address says, and the way out. The logic of each row is
// in src/crossPage.matrix.test.tsx; this is the part jsdom cannot drive. A page owner adds a row here for a seam whose control or
// history behaviour only a browser shows. It writes no capture records, so the visual run's whole-run checks do not see it.

const BAD = 'This link could not be opened';

async function open(page: Page, address: string): Promise<void> {
  await page.goto(address);
  await settlePage(page);
}

const here = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search + url.hash;
};
const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true });
const blocked = (page: Page) => page.getByRole('heading', { level: 2, name: BAD });

test.describe('cross-page hand-offs', () => {
  test('Production Start session lands on the Booth at a chapter', async ({ page }) => {
    // The record capability on: the mock's DAW keeps Start session disabled by default, which is its own refusal row.
    await open(page, '/?mockRecordCapabilityOn=1');
    await h1(page, 'Production').waitFor();
    await page
      .getByRole('button', { name: /Start session/ })
      .and(page.locator(':visible'))
      .first()
      .click();
    await h1(page, 'Booth').waitFor();
    expect(here(page)).toMatch(/^\/booth(\?chapter=.+)?$/);
  });

  for (const [what, address, page_] of [
    ['a chapter the manuscript does not have', '/booth?chapter=nope', 'Booth'],
    ['a chapter named twice', '/booth?chapter=chapter-1&chapter=chapter-2', 'Booth'],
    ['an offset that is not a number', '/booth?chapter=chapter-1&para=p1&at=NaN', 'Booth'],
    ['a name longer than any id', `/booth?chapter=${'x'.repeat(600)}`, 'Booth'],
    ['a chapter named in emoji and right-to-left text', `/booth?chapter=${encodeURIComponent('🦎 مرحبا')}`, 'Booth'],
    ['an Editing chapter that does not exist', '/editing/nope', 'Editing'],
    ['an Editing time that is not a number', '/editing/chapter-1?t=abc', 'Editing'],
    ['a malformed escape in a Script link', '/script#c%E0%A4%A', 'Script'],
    ['a malformed escape in a Story Bible link', '/story-bible#%', 'Story Bible'],
  ] as const) {
    test(`a bad address (${what}) says so and offers a way out`, async ({ page }) => {
      await open(page, address);
      await blocked(page).waitFor();
      await expect(page.getByRole('alert').filter({ hasText: new RegExp(`^This ${page_} link`) })).toBeVisible();
      await page.getByRole('button', { name: `Open ${page_}` }).click();
      await h1(page, page_).waitFor();
      await expect(blocked(page)).toHaveCount(0);
    });
  }

  test('the way out of a bad address replaces it, so Back does not return to it', async ({ page }) => {
    await open(page, '/');
    await h1(page, 'Production').waitFor();
    await page.evaluate(() => {
      window.history.pushState(null, '', '/booth?chapter=nope');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await blocked(page).waitFor();
    await page.getByRole('button', { name: 'Go to Production' }).click();
    await h1(page, 'Production').waitFor();
    await page.goBack();
    await expect(blocked(page)).toHaveCount(0);
  });

  test('Escape on the message leaves it and the address where they are', async ({ page }) => {
    await open(page, '/editing/nope');
    await blocked(page).waitFor();
    await page.keyboard.press('Escape');
    await expect(blocked(page)).toBeVisible();
    expect(here(page)).toBe('/editing/nope');
  });

  test('a reload in the middle of a hand-off lands on the same page, good address or bad', async ({ page }) => {
    await open(page, '/booth?chapter=chapter-2');
    await h1(page, 'Booth').waitFor();
    await page.reload();
    await settlePage(page);
    await h1(page, 'Booth').waitFor();
    expect(here(page)).toBe('/booth?chapter=chapter-2');
    await open(page, '/booth?chapter=nope');
    await blocked(page).waitFor();
    await page.reload();
    await settlePage(page);
    await blocked(page).waitFor();
  });

  test('a Script link to a chapter the manuscript lacks says so and leaves the Script page open', async ({ page }) => {
    await open(page, '/script#cnope');
    await h1(page, 'Script').waitFor();
    await expect(page.getByText("That link points to a chapter or line that isn't in this manuscript.")).toBeVisible();
    expect(here(page)).toBe('/script');
  });

  test('Back and Forward between a hand-off destination and its source keep both pages whole', async ({ page }) => {
    await open(page, '/');
    await h1(page, 'Production').waitFor();
    await page.evaluate(() => {
      window.history.pushState(null, '', '/script#p5');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await h1(page, 'Script').waitFor();
    await page.goBack();
    await h1(page, 'Production').waitFor();
    await page.goForward();
    await h1(page, 'Script').waitFor();
    await expect(blocked(page)).toHaveCount(0);
  });
});
