// Assembles the public site into one folder, `dist-site/` by default:
//   index.html          the landing page (scripts/site/landing/)
//   demo/               the real UI, built in its `site` mode: mock host, hash routes, relative URLs (apps/ui/.env.site)
//   storybook/          the component Storybook (`pnpm --dir apps/ui run build-storybook`), unless --skip-storybook
//   assets/             the landing page's fonts and icon, copied from the app's own bundle
// Every URL in it is relative and nothing is fetched from another host, so the folder opens from any sub-path, from a file server and
// from a sandboxed frame with no network. Nothing here deploys it: see docs/operations/public-demo-site.md.
//   node scripts/site/build-demo-site.mjs [--out dist-site] [--skip-storybook] [--skip-ui]
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOutwardLoads } from './siteFiles.mjs';

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
mkdirSync(join(out, 'assets', 'fonts'), { recursive: true });
cpSync(join(ui, 'dist', 'site-demo'), join(out, 'demo'), { recursive: true });
if (withStorybook) cpSync(join(ui, 'storybook-static'), join(out, 'storybook'), { recursive: true });

const fonts = {
  'barlow-condensed-600.woff2': ['barlow-condensed', 'barlow-condensed-latin-600-normal.woff2'],
  'barlow-condensed-700.woff2': ['barlow-condensed', 'barlow-condensed-latin-700-normal.woff2'],
  'ibm-plex-sans-400.woff2': ['ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff2'],
  'ibm-plex-sans-600.woff2': ['ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2'],
};
for (const [name, [pkg, file]] of Object.entries(fonts)) {
  cpSync(join(ui, 'node_modules', '@fontsource', pkg, 'files', file), join(out, 'assets', 'fonts', name));
}

// The landing page names Storybook only when this build holds it, so a --skip-storybook folder has no dead link.
let landing = readFileSync(join(root, 'scripts', 'site', 'landing', 'index.html'), 'utf8');
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
cpSync(join(ui, 'public', 'favicon.png'), join(out, 'assets', 'favicon.png'));
writeFileSync(join(out, 'index.html'), landing);
writeFileSync(join(out, '.nojekyll'), '');

const outward = findOutwardLoads(out);
if (outward.length > 0) {
  for (const { file, url } of outward) console.error(`${file}: loads ${url} by an absolute path or from another host`);
  throw new Error('the built site is not self-contained');
}
if (!existsSync(join(out, 'demo', 'index.html'))) throw new Error('the demo has no index.html');
console.log(`site: ${out}`);
