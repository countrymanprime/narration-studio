import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

// The unit tests of the site's extension code (demo/src). The app's own tests stay in src/studio/ui; these import the app only through the `@ui` alias, as
// the site's build does.
export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: { alias: { '@ui': resolve(here, '..', 'studio', 'ui', 'src') } },
  test: {
    include: ['demo/src/**/*.test.{ts,tsx}'],
    setupFiles: ['./demo/src/test-setup.ts'],
    testTimeout: 15_000,
  },
});
