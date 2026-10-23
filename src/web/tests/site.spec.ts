// The built public site (src/web/build/build-demo-site.mjs): the landing page, the real UI in its mock mode and Storybook, served from a
// sub-path. What a visitor does first: open the demo, decide a note, see it in Pickups.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The product's display name, from config/brand.json, as the site build writes it.
const NAME: string = JSON.parse(readFileSync(new URL('../../../config/brand.json', import.meta.url), 'utf8')).name;

// The sub-path the site is served from (playwright.config.ts) and the repository its links name (the build's GITHUB_REPOSITORY, as shell.mjs reads it).
const SITE_BASE = process.env.SITE_BASE ?? '/site/';
const REPO_SLUG = /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPOSITORY ?? '') ? process.env.GITHUB_REPOSITORY : 'countrymanprime/narration-studio';

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
    else if (!url.pathname.startsWith(SITE_BASE)) seen.outside.push(request.url());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) seen.failed.push(`${response.status()} ${response.url()}`);
  });
  // A request cut short by the visitor moving on is not a failure.
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') seen.failed.push(request.url());
  });
  page.on('pageerror', (error) => seen.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') seen.errors.push(message.text());
  });
  return seen;
}

test('the landing page carries the free-software tagline in its title, social tags, trust line and stats', async ({ page }) => {
  await page.goto('./');
  const title = `${NAME}: All pro. All free.`;
  await expect(page).toHaveTitle(title);
  for (const key of ['og:title', 'twitter:title']) {
    await expect(page.locator(`meta[property="${key}"], meta[name="${key}"]`)).toHaveAttribute('content', title);
  }
  await expect(page.getByText('No watermark. No trial. No price.')).toBeVisible();
  await expect(page.getByText('$0', { exact: true })).toBeVisible();
  await expect(page.getByText('Studio software that costs nothing but your time.')).toBeVisible();
});

test('the landing page links the demo by a relative address and loads nothing from outside the site', async ({ page }) => {
  const seen = watchRequests(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Studio-grade. Not studio-priced.');
  await expect(page.getByRole('link', { name: 'Try the live demo' })).toHaveAttribute('href', 'demo/index.html');
  expect(seen).toEqual({ outside: [], failed: [], errors: [] });
});

test('the demo is the real app on a sample project, and a note marked Needs pickup reaches the rail, Pickups and Production', async ({ page }) => {
  const seen = watchRequests(page);
  await page.goto('./');
  await page.getByRole('link', { name: 'Try the live demo' }).first().click();
  await expect(page).toHaveURL(/demo\/index\.html/);
  // The demo page is the site's: its header stays, and the app is in the window's frame.
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Live demo' })).toHaveAttribute('aria-current', 'page');
  const app = page.frameLocator('#app');
  await expect(app.getByText('Alice’s Adventures in Wonderland').first()).toBeVisible();
  await page.goto('demo/app.html');
  await expect(page.getByRole('note').filter({ hasText: 'Demo' })).toBeVisible();

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
  await page.goto('demo/app.html#/proof');
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
  await page.goto('demo/app.html?mockDaw=live&mockDawChoice=found#/settings');
  await expect(page.getByText('REAPER not linked')).toBeVisible();
  await page.getByRole('button', { name: 'Link Alice.rpp' }).click();
  await expect(page.getByText(/Linked to Alice\.rpp/)).toBeVisible();
  // The panel is the DAW's side of the same fact.
  await dawBadge(page).click();
  await expect(dawPanel(page)).toContainText('Project file linked');
});

test('the panel switches the simulated DAW to Audacity, which has no take markers', async ({ page }) => {
  await page.goto('demo/app.html#/proof');
  await dawBadge(page).click();
  await dawPanel(page).getByRole('button', { name: 'Switch to Audacity' }).click();
  await expect(dawBadge(page)).toContainText('Audacity');
  await expect(page.getByRole('button', { name: 'Add marker in REAPER' })).toHaveCount(0);
});

test('recording in the Booth starts and stops a take in the simulated DAW', async ({ page }) => {
  await page.goto('demo/app.html#/booth');
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
  await page.goto('demo/app.html#/proof');
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

test('Storybook opens from the landing page and from the demo, and renders a story', async ({ page }) => {
  const seen = watchRequests(page);
  await page.goto('./');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Storybook' }).click();
  await expect(page).toHaveURL(/storybook\/index\.html/);
  // A story's own page (the manager's iframe) renders a component, with no request outside the site.
  await page.goto('storybook/sb/iframe.html?id=primitives-button--primary&viewMode=story');
  await expect(page.locator('#storybook-root button').first()).toBeVisible();

  await page.goto('demo/app.html#/proof');
  await expect(page.getByRole('link', { name: 'Storybook' })).toHaveAttribute('href', '../storybook/index.html');
  await page.getByRole('link', { name: 'Storybook' }).click();
  await expect(page).toHaveURL(/storybook\/index\.html/);
  await expect(page.frameLocator('#storybook').locator('#storybook-explorer-tree')).toBeVisible();
  await page.goto('demo/app.html#/proof');
  await page.getByRole('link', { name: 'Site' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Studio-grade. Not studio-priced.');
  expect(seen).toEqual({ outside: [], failed: [], errors: [] });
});

test('the landing page follows the app theme the demo stored, and the toggle changes both', async ({ page }) => {
  await page.goto('demo/app.html#/proof');
  await page.evaluate(() => localStorage.setItem('narration-ui-theme', 'dark'));
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch colour theme' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('narration-ui-theme'))).toBe('light');
});

test('the demo and the landing page each run from one file inside a sandboxed frame, with no request but their own page', async ({ page }) => {
  for (const path of ['demo/app.html', 'index.html']) {
    await page.goto('./');
    const own = new URL(path, page.url()).href;
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    // `sandbox="allow-scripts"` alone gives the frame an opaque origin: no storage, no cookies, and a module script or a font fetched from a file
    // beside the page would need CORS headers. What the page carries inline is all it has.
    await page.setContent(`<iframe id="f" title="site" sandbox="allow-scripts" src="${own}" style="width:1440px;height:900px;border:0"></iframe>`);
    const frame = page.frameLocator('#f');
    if (path === 'demo/app.html') {
      await expect(frame.getByText('Alice’s Adventures in Wonderland').first()).toBeVisible();
      await frame
        .locator('nav')
        .first()
        .getByRole('button', { name: /^Proof/i })
        .click();
      await expect(frame.getByRole('button', { name: /^needs pickup/i }).first()).toBeVisible();
      await expect(frame.getByRole('button', { name: /^Simulated DAW/ })).toBeVisible();
    } else {
      await expect(frame.getByRole('heading', { level: 1 })).toHaveText('Studio-grade. Not studio-priced.');
    }
    expect(requests.filter((url) => url !== own && !url.startsWith('data:'))).toEqual([]);
    expect(errors).toEqual([]);
    page.removeAllListeners('request');
    page.removeAllListeners('pageerror');
  }
});

// The Docs section: the condensed guides (src/web/docs/) rendered by src/web/build/guides.mjs.
const DOCS = [
  'index',
  'getting-started',
  'navigation',
  'production',
  'schedule',
  'script',
  'story-bible',
  'booth',
  'editing',
  'proof',
  'pickups',
  'master-and-qc',
  'delivery',
  'settings',
];

test('the landing page links the docs, every docs page exists and its screenshots load', async ({ page, request }) => {
  const seen = watchRequests(page);
  await page.goto('./');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Docs' }).click();
  await expect(page).toHaveURL(/docs\/index\.html$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Using the app');
  for (const name of DOCS) {
    const response = await request.get(`docs/${name}.html`);
    expect(response.status(), name).toBe(200);
  }
  // Every screenshot of a page loads (they are lazy, so ask for them all).
  await page.goto('docs/proof.html');
  await page.evaluate(() => document.querySelectorAll('img').forEach((image) => (image.loading = 'eager')));
  const images = page.locator('article img');
  expect(await images.count()).toBeGreaterThan(0);
  await expect
    .poll(() => images.evaluateAll((all) => all.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
  // A link between docs pages keeps its heading.
  await page.goto('docs/pickups.html');
  await page
    .locator('article')
    .getByRole('link', { name: /recording check/i })
    .first()
    .click();
  await expect(page).toHaveURL(/docs\/proof\.html#one-chapter$/);
  expect(seen).toEqual({ outside: [], failed: [], errors: [] });
});

test('the docs follow the mock: a grouped sidebar, On this page, previous and next, and the full guide on GitHub', async ({ page }) => {
  await page.goto('docs/proof.html');
  const side = page.getByRole('navigation', { name: 'Documentation' });
  await expect(side.getByRole('link', { name: 'Proof' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('complementary', { name: 'On this page' }).getByRole('link', { name: 'One chapter' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Full guide on GitHub/ })).toHaveAttribute(
    'href',
    `https://github.com/${REPO_SLUG}/blob/main/docs/guides/using-the-app/proof.md`,
  );
  await page.getByRole('link', { name: /Next\s*Pickups/ }).click();
  await expect(page).toHaveURL(/docs\/pickups\.html$/);
});

test('each demo page links the docs page that explains it, and the docs page links back to the page', async ({ page }) => {
  await page.goto('demo/index.html#/pickups');
  await page.getByRole('link', { name: 'How to use this page' }).click();
  await expect(page).toHaveURL(/docs\/pickups\.html$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pickups');
  await page.locator('article').getByRole('link', { name: 'live demo' }).click();
  await expect(page).toHaveURL(/demo\/index\.html#\/pickups$/);
  await page.getByRole('link', { name: 'How to use this page' }).waitFor();
  await page.goto('demo/index.html#/proof');
  await expect(page.getByRole('link', { name: 'How to use this page' })).toHaveAttribute('href', '../docs/proof.html');
  await page.goto('demo/app.html#/proof');
  await expect(page.getByRole('link', { name: 'How to use this page' })).toHaveAttribute('href', '../docs/proof.html');
});

test('a docs page runs from one file inside a sandboxed frame, with no request but its own page and its screenshots', async ({ page }) => {
  await page.goto('./');
  const own = new URL('docs/pickups.html', page.url()).href;
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setContent(`<iframe id="f" title="docs" sandbox="allow-scripts" src="${own}" style="width:1000px;height:800px;border:0"></iframe>`);
  const frame = page.frameLocator('#f');
  await expect(frame.getByRole('heading', { level: 1 })).toHaveText('Pickups');
  const image = frame.locator('article img').first();
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
  const docsFolder = new URL('docs/', page.url()).href;
  expect(requests.filter((url) => url !== own && !url.startsWith('data:') && !url.startsWith(`${docsFolder}images/`))).toEqual([]);
  expect(errors).toEqual([]);
});

// The demo's Play animations switch: a device that asks for reduced motion shows the demo none of the app's transitions until the visitor says so.
const transitionOf = (page: Page) => page.getByRole('switch', { name: 'Play animations' }).evaluate((element) => getComputedStyle(element).transitionDuration);
const motionFast = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion-fast').trim());

test("Play animations turns the demo's transitions on under reduced motion, can be switched back, and is remembered", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('demo/app.html#/proof');
  const toggle = page.getByRole('switch', { name: 'Play animations' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(await transitionOf(page)).toBe('0s');
  expect(await motionFast(page)).toMatch(/^0m?s$/);

  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'play');
  expect(await transitionOf(page)).toBe('0.12s');
  expect(await motionFast(page)).toMatch(/^(120ms|0?\.12s)$/);

  await page.reload();
  await expect(page.getByRole('switch', { name: 'Play animations' })).toHaveAttribute('aria-checked', 'true');
  expect(await transitionOf(page)).toBe('0.12s');

  await page.getByRole('switch', { name: 'Play animations' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-motion', 'play');
  expect(await transitionOf(page)).toBe('0s');
  expect(await motionFast(page)).toMatch(/^0m?s$/);
});

test('without a request for reduced motion the demo animates and the switch starts off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('demo/app.html#/proof');
  await expect(page.getByRole('switch', { name: 'Play animations' })).toHaveAttribute('aria-checked', 'false');
  expect(await transitionOf(page)).toBe('0.12s');
  await expect(page.locator('html')).not.toHaveAttribute('data-motion', /.+/);
});

// The demo page (src/web/build/windowPages.mjs): the site's header and footer around a window whose frame is the one-file app.
const appFrame = (page: Page) => page.frameLocator('#app');
const box = async (locator: ReturnType<Page['locator']>) => {
  const found = await locator.boundingBox();
  if (!found) throw new Error('not on screen');
  return found;
};
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('the demo page keeps the site header and shows the app in a sandboxed window, its Simulated DAW badge in the title bar', async ({ page }) => {
  const seen = watchRequests(page);
  await page.goto('demo/index.html#/');
  const main = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Product', 'Docs', 'Live demo', 'Storybook']) await expect(main.getByRole('link', { name })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search the site' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch colour theme' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('sandbox', 'allow-scripts');

  const app = appFrame(page);
  await expect(app.getByRole('heading', { name: 'Production', level: 1 })).toBeVisible();
  await expect(page.locator('#win-title')).toHaveText(`${NAME} · Production`);
  // The app draws no banner and no floating badge in the window: the title bar says it.
  await expect(app.getByRole('note').filter({ hasText: 'Demo' })).toHaveCount(0);
  await expect(app.locator('[data-simulated-daw]')).toHaveCount(0);
  const badge = page.getByRole('button', { name: /^Simulated DAW · REAPER/ });
  await expect(badge).toBeVisible();
  expect(overlaps(await box(badge), await box(page.locator('#app')))).toBe(false);
  // At 1440 px the window is the widest content column: 1280 x 800, not scaled.
  expect(await page.locator('#app').evaluate((frame) => [frame.clientWidth, frame.clientHeight])).toEqual([1280, 800]);
  await expect(page.locator('#win-note')).toBeHidden();

  // The badge opens the panel inside the window, under the title bar, and says so; Close shuts it.
  await badge.click();
  await expect(app.getByRole('region', { name: 'Simulated DAW' })).toContainText('Answering');
  await expect(badge).toHaveAttribute('aria-expanded', 'true');
  await app.getByRole('button', { name: 'Close' }).click();
  await expect(badge).toHaveAttribute('aria-expanded', 'false');
  await expect(app.locator('[data-simulated-daw]')).toHaveCount(0);
  expect(seen).toEqual({ outside: [], failed: [], errors: [] });
});

test('the window follows the app route both ways and links the guide of the page on screen', async ({ page }) => {
  await page.goto('demo/index.html#/proof');
  const app = appFrame(page);
  await expect(page.locator('#win-title')).toHaveText(`${NAME} · Proof`);
  await expect(page.getByRole('link', { name: 'How to use this page' })).toHaveAttribute('href', '../docs/proof.html');
  await expect(page.getByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', 'app.html#/proof');
  // A route the app opens is the page's address, and an address the visitor types opens in the app.
  await app
    .locator('nav')
    .first()
    .getByRole('button', { name: /^Pickups/i })
    .click();
  await expect(page).toHaveURL(/demo\/index\.html#\/pickups$/);
  await expect(page.getByRole('link', { name: 'How to use this page' })).toHaveAttribute('href', '../docs/pickups.html');
  await page.evaluate(() => (window.location.hash = '/delivery'));
  await expect(app.getByRole('heading', { name: 'Delivery', level: 1 })).toBeVisible();
  await expect(page.locator('#win-title')).toHaveText(`${NAME} · Delivery`);
});

test("the app's keys work in the window once the pointer is over it or the title bar was used, and Ctrl+K elsewhere is the site search", async ({ page }) => {
  await page.goto('demo/index.html#/proof');
  const app = appFrame(page);
  await expect(app.getByRole('heading', { name: 'Proof', level: 1 })).toBeVisible();
  const box = await page.locator('#win-body').boundingBox();
  if (!box) throw new Error('the window has no box');

  // Focus on the page, pointer outside the window: Ctrl+K is the site's search, and the app hears nothing.
  await page.mouse.move(5, 5);
  await page.keyboard.press('Control+,');
  await expect(page).toHaveURL(/demo\/index\.html#\/proof$/);
  await page.keyboard.press('Control+k');
  await expect(page.locator('#pal-scrim')).toHaveClass(/\bon\b/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pal-scrim')).not.toHaveClass(/\bon\b/);

  // With the pointer over the window and no click, a real key reaches the app: Ctrl+, opens Settings.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('Control+,');
  await expect(page).toHaveURL(/demo\/index\.html#\/settings$/);

  // After the title bar's own switch (focus on the page's button), the keys are the app's again: Alt+Left goes back.
  await page.getByRole('switch', { name: 'Play animations' }).click();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page).toHaveURL(/demo\/index\.html#\/proof$/);
});

test("the site's theme switch and Play animations reach the app in the window", async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('demo/index.html#/proof');
  const app = appFrame(page);
  await expect(app.getByRole('heading', { name: 'Proof', level: 1 })).toBeVisible();
  await expect(app.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch colour theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(app.locator('html')).toHaveAttribute('data-theme', 'dark');
  // A reload opens the app in the stored site theme from its first paint.
  await page.reload();
  await expect(appFrame(page).locator('html')).toHaveAttribute('data-theme', 'dark');

  const play = page.getByRole('switch', { name: 'Play animations' });
  await expect(play).toHaveAttribute('aria-checked', 'false');
  await play.click();
  await expect(appFrame(page).locator('html')).toHaveAttribute('data-motion', 'play');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Play animations' })).toHaveAttribute('aria-checked', 'true');
  await expect(appFrame(page).locator('html')).toHaveAttribute('data-motion', 'play');
  await page.getByRole('switch', { name: 'Play animations' }).click();
  await expect(appFrame(page).locator('html')).not.toHaveAttribute('data-motion', 'play');
});

test('on a phone the window keeps the desktop layout, drawn smaller, and says the app is best on a larger screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('demo/index.html#/');
  await expect(appFrame(page).getByRole('heading', { name: 'Production', level: 1 })).toBeVisible();
  expect(await page.locator('#app').evaluate((frame) => frame.clientWidth)).toBe(960);
  const window = await box(page.locator('#win-body'));
  expect(window.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('#win-note')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
});

test('in the demo on a tab of its own, the Simulated DAW badge sits in the banner and covers nothing on Production', async ({ page }) => {
  await page.goto('demo/app.html#/');
  const banner = page.getByRole('note').filter({ hasText: 'Demo' });
  const badge = banner.getByRole('button', { name: /^Simulated DAW/ });
  await expect(badge).toBeVisible();
  const nextUp = page.getByRole('main').getByText('Next up', { exact: true });
  await nextUp.scrollIntoViewIfNeeded();
  expect(overlaps(await box(badge), await box(page.getByRole('main')))).toBe(false);
  await expect(page.locator('[data-simulated-daw]')).toHaveCount(1);
});

test('the Storybook page shows a story in a window in the site theme, and the Theme control switches it', async ({ page }) => {
  const seen = watchRequests(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('storybook/index.html');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Storybook' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#storybook')).toHaveAttribute('src', /globals=theme:dark/);
  const manager = page.frameLocator('#storybook');
  const story = manager.frameLocator('#storybook-preview-iframe');
  await expect(story.locator('#storybook-root button').first()).toBeVisible();
  await expect(story.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', /^sb\/index\.html\?path=\/story\/primitives-button--primary/);

  // The toolbar's Theme control switches the story.
  await manager.getByRole('button', { name: /^App colour theme/ }).click();
  await manager.getByRole('option', { name: 'Light' }).click();
  await expect(story.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  // The Controls and Accessibility panels are there.
  await expect(manager.getByRole('tab', { name: /Controls/ })).toBeVisible();
  await manager.getByRole('tab', { name: /Accessibility/ }).click();
  await expect(manager.getByText(/Violations|Passes/).first()).toBeVisible();

  // The site's theme switch reopens the Storybook on the same story in the other theme.
  await page.getByRole('button', { name: 'Switch colour theme' }).click();
  await expect(page.locator('#storybook')).toHaveAttribute('src', /primitives-button--primary.*globals=theme:light/);
  expect(seen).toEqual({ outside: [], failed: [], errors: [] });
});
