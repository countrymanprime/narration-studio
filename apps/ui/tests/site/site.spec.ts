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

const dawBadge = (page: Page) => page.getByRole('button', { name: /^Simulated DAW/ });
const dawPanel = (page: Page) => page.getByRole('region', { name: 'Simulated DAW' });

test('Show in REAPER and Add marker in REAPER act on the simulated DAW, and its panel shows the cursor and the marker', async ({ page }) => {
  const seen = watchRequests(page);
  await page.goto('demo/index.html#/proof');
  await expect(dawBadge(page)).toContainText('REAPER');
  // The panel sits over the corner of the page, so it is opened to read and shut to use the app, as a visitor would.
  await dawBadge(page).click();
  await expect(dawPanel(page)).toContainText('Answering');
  await expect(dawPanel(page)).toContainText('No take markers yet');
  await dawBadge(page).click();

  await page.getByRole('button', { name: 'Show in REAPER' }).click();
  await page.getByRole('button', { name: 'Add marker in REAPER' }).click();
  await expect(page.getByText(/Marker added in REAPER/)).toBeVisible();
  await dawBadge(page).click();
  await expect(dawPanel(page)).toContainText('Cursor moved to Chapter 1');
  await expect(dawPanel(page)).toContainText('Take marker dropped at');
  await expect(dawPanel(page)).toContainText('1 take marker');
  expect(seen).toEqual({ outside: [], failed: [], errors: [] });
});

test('linking the simulated DAW: an unlinked project offers its .rpp, linking it makes the DAW answer', async ({ page }) => {
  await page.goto('demo/index.html?mockDaw=live&mockDawChoice=found#/settings');
  await expect(page.getByText('REAPER not linked')).toBeVisible();
  await page.getByRole('button', { name: 'Link Alice.rpp' }).click();
  await expect(page.getByText(/Linked to Alice\.rpp/)).toBeVisible();
  // The panel is the DAW's side of the same fact.
  await dawBadge(page).click();
  await expect(dawPanel(page)).toContainText('Project file linked');
});

test('the panel switches the simulated DAW to Audacity, which has no take markers', async ({ page }) => {
  await page.goto('demo/index.html#/proof');
  await dawBadge(page).click();
  await dawPanel(page).getByRole('button', { name: 'Switch to Audacity' }).click();
  await expect(dawBadge(page)).toContainText('Audacity');
  await expect(page.getByRole('button', { name: 'Add marker in REAPER' })).toHaveCount(0);
});

test('recording in the Booth starts and stops a take in the simulated DAW', async ({ page }) => {
  await page.goto('demo/index.html#/booth');
  await page.getByRole('button', { name: /^Record$/i }).click();
  await expect(dawBadge(page)).toContainText('recording');
  await page.getByRole('button', { name: /^Stop$/i }).click();
  await expect(dawBadge(page)).not.toContainText('recording');
  await dawBadge(page).click();
  await expect(dawPanel(page)).toContainText('Recording started on Chapter 1');
  await expect(dawPanel(page)).toContainText('Recording stopped: take 1 added to the track');
  await expect(dawPanel(page)).toContainText('1 added this visit');
});

test('the render setup and a cleanup tool the app opens in REAPER show up as what the DAW was asked to do', async ({ page }) => {
  await page.goto('demo/index.html#/proof');
  await page
    .getByRole('button', { name: /^REAPER/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Prepare chapter render/i }).click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: /^Configure render$/i })
    .click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: /^Close$/i })
    .click();
  await page.getByRole('button', { name: /^Cleanup tools/i }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: /open/i }).first().click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: /^Close$/i })
    .click();
  await page.keyboard.press('Escape');
  await dawBadge(page).click();
  await expect(dawPanel(page)).toContainText('Render set to all regions');
  await expect(dawPanel(page)).toContainText('Cleanup tool');
});
