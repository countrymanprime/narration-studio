// Assembles the public site into one folder, `dist-site/` by default:
//   index.html          the landing page (scripts/site/landing/)
//   demo/index.html     the real UI, built in its `site` mode as one self-contained page: mock host, hash routes, script, styles and fonts inline (apps/ui/.env.site)
//   guides/             the how-to guides (docs/guides/using-the-app/), one static page each with their screenshots (scripts/site/guides.mjs)
//   storybook/          the component Storybook (`pnpm --dir apps/ui run build-storybook`), unless --skip-storybook
// The landing page and the demo are each one file with nothing fetched from another host, and every link between the pieces is relative, so the
// folder opens from any sub-path, from a file server and, page by page, from a sandboxed frame with no network. Nothing here deploys it: see docs/operations/public-demo-site.md.
//   node scripts/site/build-demo-site.mjs [--out dist-site] [--skip-storybook] [--skip-ui]
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGuides } from './guides.mjs';
import { findOutwardLoads, withIcon } from './siteFiles.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const out = resolve(root, option('--out', 'dist-site'));
const withStorybook = !args.includes('--skip-storybook');

function run(command, commandArgs) {
  console.log(`$ ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed (${result.status})`);
}

const ui = join(root, 'apps', 'ui');
if (!args.includes('--skip-ui')) run('pnpm', ['--dir', 'apps/ui', 'run', 'build:site']);
if (withStorybook) run('pnpm', ['--dir', 'apps/ui', 'run', 'build-storybook']);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(ui, 'dist', 'site-demo'), join(out, 'demo'), { recursive: true });
// The demo is one self-contained page (its icon is inline), so the public-folder copy of the icon is dead weight.
rmSync(join(out, 'demo', 'favicon.png'), { force: true });
if (withStorybook) {
  cpSync(join(ui, 'storybook-static'), join(out, 'storybook'), { recursive: true });
  // Storybook's preview page names no icon, so a browser would ask the host's root for /favicon.ico.
  for (const page of ['iframe.html', 'index.html']) {
    const file = join(out, 'storybook', page);
    writeFileSync(file, withIcon(readFileSync(file, 'utf8')));
  }
}

// The landing page carries its fonts and icon as data URIs, as the demo does: a font fetched from a file beside the page needs CORS headers a
// sandboxed frame's host may not send.
const dataUri = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`;
const fontFile = (pkg, file) => join(ui, 'node_modules', '@fontsource', pkg, 'files', file);
const fonts = Object.fromEntries(
  [
    ['barlow-condensed', [500, 600, 700]],
    ['ibm-plex-mono', [400, 500]],
    ['ibm-plex-sans', [400, 500, 600, 700]],
  ].flatMap(([pkg, weights]) => weights.map((weight) => [`${pkg}-${weight}`, fontFile(pkg, `${pkg}-latin-${weight}-normal.woff2`)])),
);

// The landing page names Storybook only when this build holds it, so a --skip-storybook folder has no dead link.
let landing = readFileSync(join(root, 'scripts', 'site', 'landing', 'index.html'), 'utf8');
for (const [name, file] of Object.entries(fonts)) landing = landing.replaceAll(`./assets/fonts/${name}.woff2`, dataUri(file, 'font/woff2'));
landing = landing.replace('./assets/favicon.png', dataUri(join(ui, 'public', 'favicon.png'), 'image/png'));
const storybook = {
  STORYBOOK_NAV: '<a href="storybook/index.html">Storybook</a>',
  STORYBOOK_CTA: '<a class="btn" href="storybook/index.html">Storybook</a>',
  STORYBOOK_CARD: `<a class="card" href="storybook/index.html">
              <h3>Storybook</h3>
              <p>Every component of the app with its states, controls and an accessibility check, in both themes.</p>
              <span class="go">Browse components →</span>
            </a>`,
};
for (const [marker, html] of Object.entries(storybook)) landing = landing.replace(`<!--${marker}-->`, withStorybook ? html : '');
writeFileSync(join(out, 'index.html'), landing);
const guides = buildGuides({
  root,
  out,
  withStorybook,
  icon: dataUri(join(ui, 'public', 'favicon.png'), 'image/png'),
});
console.log(`site: ${guides.pages.length} guide pages, ${guides.images.length} screenshots`);
writeFileSync(join(out, '.nojekyll'), '');

const outward = findOutwardLoads(out);
if (outward.length > 0) {
  for (const { file, url } of outward) console.error(`${file}: loads ${url} by an absolute path or from another host`);
  throw new Error('the built site is not self-contained');
}
if (!existsSync(join(out, 'demo', 'index.html'))) throw new Error('the demo has no index.html');
console.log(`site: ${out}`);
