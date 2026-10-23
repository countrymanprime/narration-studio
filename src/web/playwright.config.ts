import { defineConfig } from '@playwright/test';
import { chromiumExecutablePath } from '../studio/ui/playwright.launch';

// Smoke test of the built public site (src/web/tests): builds `dist-site/` with src/web/build/build-demo-site.mjs and serves it from a
// sub-path, the way GitHub Pages serves a project site, so a page that reaches for `/assets/x.js` fails here as it would there.
// `pnpm --dir src/web run test:site`. SITE_SKIP_BUILD=1 serves the folder as it is. SITE_BASE is the sub-path it is served from ('/site/' unless set):
// the site is relative-URL only, so any base works, and the repository's name is not one of them.
const PORT = Number(process.env.UI_SITE_PORT ?? 4180);
const BASE = `/${(process.env.SITE_BASE ?? '/site/').replace(/^\/+|\/+$/g, '')}/`;
// The spec reads the base from the environment the workers inherit.
process.env.SITE_BASE = BASE;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
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
    command: `${process.env.SITE_SKIP_BUILD ? '' : 'node build/build-demo-site.mjs && '}node build/serve.mjs ../../dist-site --base ${BASE} --port ${PORT}`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: false,
    timeout: 600_000,
  },
});
