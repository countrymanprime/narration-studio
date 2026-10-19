import { defineConfig } from '@playwright/test';
import { chromiumExecutablePath } from './playwright.launch';

// Smoke test of the built public site (tests/site): builds `dist-site/` with scripts/site/build-demo-site.mjs and serves it from a
// sub-path, the way GitHub Pages serves a project site, so a page that reaches for `/assets/x.js` fails here as it would there.
// `pnpm --dir apps/ui run test:site`. SITE_SKIP_BUILD=1 serves the folder as it is.
const PORT = Number(process.env.UI_SITE_PORT ?? 4180);
const BASE = '/narration-utils/';

export default defineConfig({
  testDir: './tests/site',
  outputDir: './test-results/site',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    // Wide enough for the full rail with its count badges: below 1360 px the rail is icons only.
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: chromiumExecutablePath() },
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: `${process.env.SITE_SKIP_BUILD ? '' : 'node ../../scripts/site/build-demo-site.mjs && '}node ../../scripts/site/serve.mjs ../../dist-site --base ${BASE} --port ${PORT}`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: false,
    timeout: 600_000,
  },
});
