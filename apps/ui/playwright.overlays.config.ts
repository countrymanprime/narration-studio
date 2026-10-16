import { defineConfig } from '@playwright/test';
import { launchOptions } from './playwright.launch';

// The real-browser overlay guard (tests/overlays, definition of done rule 1). Same mock build as the visual suite, on a port of
// its own. UI_OVERLAYS_URL points it at a server that is already running (for example `pnpm dev:mock`) instead of building one.
const URL_OVERRIDE = process.env.UI_OVERLAYS_URL;
const PORT = Number(process.env.UI_OVERLAYS_PORT ?? 4174);
const ORIGIN = URL_OVERRIDE ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/overlays',
  globalSetup: './tests/overlays/global-setup.ts',
  globalTeardown: './tests/overlays/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: ORIGIN, launchOptions: launchOptions(), trace: 'off', video: 'off', screenshot: 'off' },
  webServer: URL_OVERRIDE
    ? undefined
    : {
        command: `pnpm run build:mock && pnpm exec vite preview --outDir node_modules/.cache/mock-build --port ${PORT} --strictPort`,
        url: ORIGIN,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
