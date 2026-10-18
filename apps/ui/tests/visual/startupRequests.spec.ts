import { expect, test } from '@playwright/test';
import { startupRequestProblems } from './lib/startupRequests';

// "No automatic outbound call but the update check" (threat model, row 3 and "No listener"): startup_offline_test.go counts
// the Go host's requests; this counts the webview's. It loads the production build the visual suite serves and fails on a
// request to another origin, on a path outside lib/startupRequests.ts, and on any failed or 4xx/5xx response.
test('the webview requests nothing but its own bundle at start-up', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requested: string[] = [];
  const broken: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') broken.push(`request failed: ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) broken.push(`HTTP ${response.status()}: ${response.url()}`);
  });

  await page.goto('/');
  await page.locator('#root > *').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');

  // The headless shell the suite runs in never asks for a tab icon, a desktop Chromium and the WebView2 shell do.
  // Fetch what the page declares so a missing or mistyped icon fails here, not only in a desktop browser.
  const icon = await page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? null);
  expect(icon, 'index.html declares a tab icon, so the browser does not fall back to /favicon.ico').not.toBeNull();
  const iconResponse = await page.request.get(icon!);
  expect(iconResponse.status()).toBe(200);
  expect(iconResponse.headers()['content-type']).toMatch(/^image\//);

  expect(requested.length, 'the page loaded something').toBeGreaterThan(1);
  expect(startupRequestProblems(requested, origin)).toEqual([]);
  expect(broken).toEqual([]);
});
