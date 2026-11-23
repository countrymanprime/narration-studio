import { defineConfig } from '@playwright/test';
import { launchOptions } from './playwright.launch';
export default defineConfig({
  testDir: './tests/visual',
  testMatch: ['zzqa-*.spec.ts'],
  timeout: 90_000,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4201', launchOptions: launchOptions(), viewport: { width: 1440, height: 900 } },
});
