import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

// The public site's copy must ask no host for anything and must open from any sub-path and inside a sandboxed frame with no network, where
// a module script, a stylesheet or a font fetched from a file beside the page needs CORS headers the frame's host may not send. So the
// `site` mode builds one self-contained `index.html`: a single script chunk and the stylesheet inlined, fonts and the icon as data URIs.
// It also removes the Wails runtime's probe of `/wails/custom.js` (a HEAD request that is a 404 on a static host and a stray request to the
// embedding page's origin in a frame). Only the `site` mode loads this plugin.
function sitePlugin(): Plugin {
  const inlineJs = (code: string) => code.replace(/<\/script/gi, '<\\/script');
  return {
    name: 'narration-site',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@wailsio/runtime') || !code.includes("loadOptionalScript('/wails/custom.js')")) return null;
      return code.replace("loadOptionalScript('/wails/custom.js');", '/* the site build has no server-mode script to probe for */');
    },
    // After the bundle is written: Vite fills in its dynamic-import helpers late, so the chunk is read back from disk, not from the bundle.
    writeBundle: {
      order: 'post',
      handler(options) {
        const dir = options.dir;
        if (!dir) return;
        const page = join(dir, 'index.html');
        const take = (file: string): string => {
          const path = join(dir, file);
          const text = readFileSync(path, 'utf8');
          rmSync(path);
          return text;
        };
        const icon = `data:image/png;base64,${readFileSync(new URL('./public/favicon.png', import.meta.url)).toString('base64')}`;
        const html = readFileSync(page, 'utf8')
          .replace(/ crossorigin(?:="[^"]*")?/g, '')
          .replace(
            /<script type="module" src="\.\/(assets\/[^"]+\.js)"><\/script>/g,
            (_all, file: string) => `<script type="module">${inlineJs(take(file))}</script>`,
          )
          .replace(/<link rel="stylesheet" href="\.\/(assets\/[^"]+\.css)">/g, (_all, file: string) => `<style>${take(file)}</style>`)
          .replace('href="./favicon.png"', `href="${icon}"`);
        writeFileSync(page, html);
        rmSync(join(dir, 'favicon.png'), { force: true });
        rmSync(join(dir, 'assets'), { recursive: true, force: true });
      },
    },
  };
}

// The `demo` mode (`.env.demo`, `pnpm build:demo`) publishes the mock build under GitHub Pages'
// `/narration-utils/demo/` subpath; every other mode
// (dev, `mock`, `test`, production) keeps the app at the site root. The `site` mode (`.env.site`, scripts/site/build-demo-site.mjs) is the
// public site's copy: relative asset URLs and hash routes, so the folder opens from any sub-path and from a sandboxed frame.
export default defineConfig(async ({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'site' ? [sitePlugin()] : [])],
  base: mode === 'demo' ? '/narration-utils/demo/' : mode === 'site' ? './' : '/',
  build:
    mode === 'site'
      ? {
          outDir: 'dist',
          emptyOutDir: true,
          // One script and one stylesheet, with the fonts inside them, for sitePlugin to inline into index.html.
          assetsInlineLimit: Number.MAX_SAFE_INTEGER,
          cssCodeSplit: false,
          modulePreload: false,
          chunkSizeWarningLimit: 6_000,
          rolldownOptions: { output: { codeSplitting: false } },
        }
      : { outDir: 'dist', emptyOutDir: true },
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
