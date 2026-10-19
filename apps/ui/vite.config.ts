import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { assignShard, relativeSpec } from './scripts/vitest-shards.mjs';

// `vitest --shard=i/N` (the `js-test` CI jobs) splits the files by cost instead of by a hash of their paths: see
// scripts/vitest-shards.mjs. Only a Vitest run loads Vitest; dev, build and Storybook do not.
async function costBalancedSequencer() {
  const { BaseSequencer } = await import('vitest/node');
  return class CostBalancedSequencer extends BaseSequencer {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vitest's TestSpecification, which `vite` alone does not type
    async shard(files: any[]) {
      const { index, count } = this.ctx.config.shard;
      const root = this.ctx.config.root;
      const byPath = new Map(files.map((spec) => [relativeSpec(root, spec.moduleId), spec]));
      return assignShard([...byPath.keys()], index, count).map((path) => byPath.get(path));
    }
  };
}

// The public site's copy must ask no host for anything: the Wails runtime probes `/wails/custom.js` with a HEAD request (a 404 on a static
// host, a stray request to the embedding page's origin in a frame) and Vite marks its assets `crossorigin`, which a sandboxed frame without
// CORS headers refuses. Only the `site` mode loads this plugin.
function sitePlugin(): Plugin {
  return {
    name: 'narration-site',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@wailsio/runtime') || !code.includes("loadOptionalScript('/wails/custom.js')")) return null;
      return code.replace("loadOptionalScript('/wails/custom.js');", '/* the site build has no server-mode script to probe for */');
    },
    transformIndexHtml: { order: 'post', handler: (html) => html.replace(/ crossorigin(?:="[^"]*")?/g, '') },
  };
}

// The `demo` mode (`.env.demo`, `pnpm build:demo`) publishes the mock build under GitHub Pages'
// `/narration-utils/demo/` subpath; every other mode
// (dev, `mock`, `test`, production) keeps the app at the site root. The `site` mode (`.env.site`, scripts/site/build-demo-site.mjs) is the
// public site's copy: relative asset URLs and hash routes, so the folder opens from any sub-path and from a sandboxed frame.
export default defineConfig(async ({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'site' ? [sitePlugin()] : [])],
  base: mode === 'demo' ? '/narration-utils/demo/' : mode === 'site' ? './' : '/',
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    // tests/visual/**/*.spec.ts and tests/aria/**/*.spec.ts are Playwright specs (run via `pnpm run
    // screenshots` and `pnpm run aria`), not Vitest tests - Vitest's default include pattern
    // matches *.spec.ts too, so they must be excluded explicitly. tests/visual/*.test.ts are Vitest tests on the suite's own data. scripts/*.test.mjs are node:test suites (the
    // `test-node` target).
    exclude: ['node_modules/**', 'tests/visual/**/*.spec.ts', 'tests/aria/**', 'tests/atlas/**', 'tests/site/**', 'scripts/**'],
    setupFiles: ['./src/test-setup.ts'],
    // Vitest's 5 s default is a unit-test value. App.test.tsx mounts the whole app (Story Bible included) in jsdom: about a
    // second on a developer machine, three to five times that on a busy CI runner. 15 s still fails a genuine hang, and
    // `slowTestThreshold` is left at its default so a test that gets slow stays visible in the report. One uniform value
    // beats per-test overrides, which would hide the next test that gets slow.
    testTimeout: 15_000,
    // Coverage runs through scripts/ci/coverage-gate.mjs (the `test` target), which lists the logic files
    // to instrument and compares them with scripts/ci/coverage-floors.json. `vitest --coverage` works by hand too.
    coverage: { provider: 'v8' },
    sequence: process.env.VITEST ? { sequencer: await costBalancedSequencer() } : {},
  },
}));
