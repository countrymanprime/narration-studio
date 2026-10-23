import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = dirname(fileURLToPath(import.meta.url));
const ui = resolve(here, '..', '..', 'studio', 'ui');

// index.html's <title> is the product name, and the `demo` base is the repository's Pages sub-path, both from config/brand.json.
const brand = JSON.parse(readFileSync(resolve(here, '..', '..', '..', 'config', 'brand.json'), 'utf8')) as { name: string; repository: { name: string } };
const brandTitle: Plugin = { name: 'brand-title', transformIndexHtml: (html) => html.replaceAll('%BRAND_NAME%', brand.name) };

// Tailwind scans the files under Vite's root for the classes to emit, and the root is this folder, not src/studio/ui, which holds nearly all of the markup. The app's
// stylesheet is the Tailwind entry (`@import 'tailwindcss/...'`), so this adds the two scan roots to it as `@source` rules while the site builds, which leaves
// src/studio/ui/src/styles.css untouched and the app's own build scanning exactly what it always did.
function tailwindSources(): Plugin {
  const styles = join(ui, 'src', 'styles.css');
  const posix = (path: string) => path.replaceAll('\\', '/');
  return {
    name: 'narration-site-tailwind-sources',
    enforce: 'pre',
    transform(code, id) {
      if (id !== styles) return null;
      return `${code}\n@source "${posix(ui)}";\n@source "${posix(join(here, 'src'))}";\n`;
    },
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
        const icon = `data:image/png;base64,${readFileSync(join(ui, 'public', 'favicon.png')).toString('base64')}`;
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

// The site's app is the real UI (src/studio/ui) in its mock mode, started by this folder's entry (src/entry.ts), which registers the site's extension (src/register.ts)
// before it loads the app. The `demo` mode (`.env.demo`, `pnpm --dir src/web run build:pages-demo`) publishes the mock build under GitHub Pages'
// `/narration-studio/demo/` subpath; the `site` mode (`.env.site`, src/web/build/build-demo-site.mjs) is the public site's copy: relative asset URLs and hash
// routes, so the folder opens from any sub-path and from a sandboxed frame.
export default defineConfig(({ mode }) => ({
  root: here,
  // The favicon and the other files of the app's public folder belong to the app; the site build takes them from there.
  publicDir: join(ui, 'public'),
  resolve: { alias: { '@ui': join(ui, 'src') } },
  plugins: [react(), brandTitle, tailwindSources(), tailwindcss(), ...(mode === 'site' ? [sitePlugin()] : [])],
  base: mode === 'demo' ? `/${brand.repository.name}/demo/` : './',
  build:
    mode === 'site'
      ? {
          outDir: join(here, 'dist', 'site-demo'),
          emptyOutDir: true,
          // One script and one stylesheet, with the fonts inside them, for sitePlugin to inline into index.html.
          assetsInlineLimit: Number.MAX_SAFE_INTEGER,
          cssCodeSplit: false,
          modulePreload: false,
          chunkSizeWarningLimit: 6_000,
          rolldownOptions: { output: { codeSplitting: false } },
        }
      : { outDir: join(here, 'dist', 'demo'), emptyOutDir: true },
  server: { fs: { allow: [resolve(here, '..', '..')] } },
}));
