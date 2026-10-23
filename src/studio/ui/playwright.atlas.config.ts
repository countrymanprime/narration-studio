import { defineConfig } from '@playwright/test';
import { launchOptions } from './playwright.launch';

// Component atlas: every Storybook story x theme x viewport, captured and
// checked (a11y, play(), overflow, console errors). Run through the `atlas` script,
// which builds Storybook first - the spec enumerates storybook-static/index.json.
// UI_ATLAS_PORT moves the static server (default 6106) when several repos run at once.
const port = Number(process.env.UI_ATLAS_PORT ?? 6106);
// Launch args and the optional PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH live in playwright.launch.ts.
const LAUNCH = launchOptions();

export default defineConfig({
  testDir: './tests/atlas',
  globalSetup: './tests/atlas/global-setup.ts',
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, reducedMotion: 'reduce', launchOptions: LAUNCH, trace: 'off', video: 'off', screenshot: 'off' },
  webServer: {
    // npx --no-install runs the repo's own vite whichever package manager installed it.
    command: `npx --no-install vite preview --outDir storybook-static --port ${port} --strictPort`,
    url: `http://localhost:${port}/index.json`,
    // Attaching to whatever already listens on the port could be another repo's Storybook; opt in with UI_REUSE_SERVER=1.
    reuseExistingServer: Boolean(process.env.UI_REUSE_SERVER),
    timeout: 30_000,
  },
});
