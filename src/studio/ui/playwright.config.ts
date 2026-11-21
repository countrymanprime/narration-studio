import { defineConfig } from '@playwright/test';
import { launchOptions } from './playwright.launch';

// Screenshot-capture config for the app's visual test suite
// (src/studio/ui/tests/visual). Not a pixel-diff regression gate: it fails on
// pages that error, overflow sideways, render blank, or render identically to
// another state - see tests/visual/lib/validators.ts and global-setup.ts.
// Launch args and the optional PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH live in playwright.launch.ts.
const LAUNCH = launchOptions();

// The suite screenshots the production build (mock backend, see .env.mock), served by `vite preview`,
// not the dev server: what ships is what gets captured, and a fresh browser context per test loads a
// handful of bundled files instead of the whole unbundled module graph. A port of its own means a
// developer's running `dev:mock` (5173) is never mistaken for it. UI_APP_PORT moves it (default 4173,
// vite preview's own default) when another project's preview is already listening there.
const PORT = Number(process.env.UI_APP_PORT ?? 4173);
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/visual',
  // The pixel-match tool's spec has a config of its own (playwright.mock-match.config.ts): it measures, it is not this gate.
  testIgnore: ['mock-match/**', '**/*.test.ts'],
  globalSetup: './tests/visual/global-setup.ts',
  fullyParallel: true,
  // One shared static server, and Chromium is CPU-bound: 4 workers matches a CI runner's 4 vCPUs.
  workers: 4,
  // No retries: a capture that only passes on the second try is a flaky
  // capture, and a retry would hide exactly that.
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: ORIGIN,
    launchOptions: LAUNCH,
    // No trace on the first pass: recording one for every test, to keep it for the few that fail, took 19% of the suite's test time
    // (99 tests: 534 s with `retain-on-failure`, 431 s without; docs/research/test-speed-plan-2026-11.md). For the trace of a failing
    // test (DOM snapshots, network and console for every action) run it again with `--last-failed --trace on`, which leaves
    // test-results/<test>/trace.zip: `pnpm exec playwright show-trace <zip>`. CI does that in the step after a red `visual` step
    // and uploads the result. That second run only records: the first pass alone decides the step (no retries, docs/design/design-system.md#what-the-suites-do-not-prove).
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: `pnpm run build:mock && pnpm exec vite preview --outDir node_modules/.cache/mock-build --port ${PORT} --strictPort`,
    url: ORIGIN,
    // Always build fresh: attaching to an old preview would screenshot an old bundle.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
