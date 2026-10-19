// Assembles the public site into one folder, `dist-site/` by default:
//   index.html          the landing page (scripts/site/landing/), in the site shell (scripts/site/shell.mjs)
//   demo/index.html     the live demo page: the site shell around a window that holds demo/app.html (scripts/site/windowPages.mjs)
//   demo/app.html       the real UI, built in its `site` mode as one self-contained page: mock host, hash routes, script, styles and fonts inline (apps/ui/.env.site)
//   docs/               the Docs section: the condensed guides (scripts/site/docs/), one static page each with their screenshots (scripts/site/guides.mjs)
//   storybook/index.html  the Storybook page: the same window around storybook/sb/, unless --skip-storybook
//   storybook/sb/       the component Storybook (`pnpm --dir apps/ui run build-storybook`), unless --skip-storybook
// The landing page and the demo are each one file with nothing fetched from another host, and every link between the pieces is relative, so the
// folder opens from any sub-path, from a file server and, page by page, from a sandboxed frame with no network. Nothing here deploys it: see docs/operations/public-demo-site.md.
//   node scripts/site/build-demo-site.mjs [--out dist-site] [--skip-storybook] [--skip-ui]
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGuides, DEMO_PAGES } from './guides.mjs';
import { fillShell, searchItems } from './shell.mjs';
import { findOutwardLoads, withIcon } from './siteFiles.mjs';
import { demoPage, storybookPage } from './windowPages.mjs';

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
// The app is `demo/app.html`, beside the demo page that shows it in a window; both sit in `demo/`, so the app's own relative links still resolve.
renameSync(join(out, 'demo', 'index.html'), join(out, 'demo', 'app.html'));
// The demo is one self-contained page (its icon is inline), so the public-folder copy of the icon is dead weight.
rmSync(join(out, 'demo', 'favicon.png'), { force: true });
if (withStorybook) {
  cpSync(join(ui, 'storybook-static'), join(out, 'storybook', 'sb'), { recursive: true });
  // Storybook's preview page names no icon, so a browser would ask the host's root for /favicon.ico.
  for (const page of ['iframe.html', 'index.html']) {
    const file = join(out, 'storybook', 'sb', page);
    writeFileSync(file, withIcon(readFileSync(file, 'utf8')));
  }
}

const docs = buildGuides({ root, out, withStorybook });
console.log(`site: ${docs.pages.length} docs pages, ${docs.images.length} screenshots`);

// The landing page names Storybook only when this build holds it, so a --skip-storybook folder has no dead link.
const landing = fillShell(readFileSync(join(root, 'scripts', 'site', 'landing', 'index.html'), 'utf8'), {
  base: '',
  current: 'home',
  withStorybook,
  search: searchItems({ base: '', docs: docs.pages, demoPages: DEMO_PAGES, withStorybook }),
});
writeFileSync(join(out, 'index.html'), withStorybook ? landing : landing.replace(/<a class="card reveal" href="storybook\/index\.html">[\s\S]*?<\/a>\n/, ''));
// The demo and Storybook pages: the site shell around a window.
writeFileSync(join(out, 'demo', 'index.html'), demoPage({ withStorybook, docs: docs.pages }));
if (withStorybook) writeFileSync(join(out, 'storybook', 'index.html'), storybookPage({ docs: docs.pages }));
writeFileSync(join(out, '.nojekyll'), '');

const outward = findOutwardLoads(out);
if (outward.length > 0) {
  for (const { file, url } of outward) console.error(`${file}: loads ${url} by an absolute path or from another host`);
  throw new Error('the built site is not self-contained');
}
if (!existsSync(join(out, 'demo', 'app.html'))) throw new Error('the demo has no app.html');
console.log(`site: ${out}`);
