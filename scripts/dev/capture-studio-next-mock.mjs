// Writes one Studio Next mock page to a PNG, offline, so a UI slice's PR can compare its screenshot with the mock.
//
// The mock (docs/research/mockups/studio-next) is a standalone npm project. After `npm ci` in that folder this script builds it
// into a temp dir (the mock's own `dist-single` is not gitignored), opens the single-file build in Chromium, clicks the rail item
// for --page and screenshots it. Nothing is written in the mock folder or the repo tree unless --out points there.
//
//   node scripts/dev/capture-studio-next-mock.mjs --page Production
//   node scripts/dev/capture-studio-next-mock.mjs --page Booth --theme dark --viewport 1280x720 --out /tmp/shots
//   node scripts/dev/capture-studio-next-mock.mjs --page Booth --mock setup=builtin    a #mockbtn radio, as e2e/lib.mjs mockState
//
// The file is <page slug>[-<mock name>-<mock value>]-<W>x<H>.png. The theme is the colour scheme the page is drawn in; it is not forced.
// Chromium: $CHROMIUM_PATH when set, else the one Playwright installed. Playwright resolves from $PLAYWRIGHT_FROM (a package.json),
// else apps/ui. Tested by scripts/ci/capture-studio-next-mock.test.mjs (repo-scripts:test-node).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
export const MOCK_DIR = join(REPO_ROOT, 'docs', 'research', 'mockups', 'studio-next');
const MOCK_REL = 'docs/research/mockups/studio-next';

// The `.rail .nav[aria-label]` items, from NAV and the Settings button in the mock's src/app/Shell.tsx. Update with that file.
export const RAIL_LABELS = ['Production', 'Schedule', 'Script', 'Story Bible', 'Booth', 'Editing', 'Proof', 'Pickups', 'Master & QC', 'Delivery', 'Settings'];

// The families e2e/lib.mjs loads from node_modules/@fontsource, so text widths match without Google Fonts.
const FONTS = [
  ['IBM Plex Sans', 'ibm-plex-sans', [400, 500, 600], 'normal'],
  ['IBM Plex Sans', 'ibm-plex-sans', [400], 'italic'],
  ['Barlow Condensed', 'barlow-condensed', [500, 600, 700], 'normal'],
  ['IBM Plex Mono', 'ibm-plex-mono', [400, 500], 'normal'],
  ['IBM Plex Serif', 'ibm-plex-serif', [400, 500], 'normal'],
  ['IBM Plex Serif', 'ibm-plex-serif', [400], 'italic'],
];

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Parses the command line. Throws a message naming the flag when a value is missing or malformed. */
export function parseArgs(argv) {
  const opts = { page: undefined, viewport: { width: 1440, height: 900 }, theme: 'light', out: undefined, mock: undefined };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[++i];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    if (flag === '--page') opts.page = value;
    else if (flag === '--viewport') {
      const m = /^(\d+)x(\d+)$/.exec(value);
      if (!m) throw new Error(`--viewport must be WxH, e.g. 1440x900 (got "${value}")`);
      opts.viewport = { width: Number(m[1]), height: Number(m[2]) };
    } else if (flag === '--theme') {
      if (value !== 'light' && value !== 'dark') throw new Error(`--theme must be light or dark (got "${value}")`);
      opts.theme = value;
    } else if (flag === '--out') opts.out = value;
    else if (flag === '--mock') {
      const m = /^([^=]+)=(.+)$/.exec(value);
      if (!m) throw new Error(`--mock must be name=value, e.g. setup=builtin (got "${value}")`);
      opts.mock = { name: m[1], value: m[2] };
    } else throw new Error(`unknown flag ${flag}`);
  }
  if (!opts.page) throw new Error(`--page is required; one of: ${RAIL_LABELS.join(', ')}`);
  if (!RAIL_LABELS.includes(opts.page)) throw new Error(`"${opts.page}" is not a rail label of the mock; one of: ${RAIL_LABELS.join(', ')}`);
  return opts;
}

/** `<state>-<W>x<H>.png`: the state is the page slug, then the mock state when one is given. */
export function outputName(page, { width, height }, mock) {
  const state = [slug(page), ...(mock ? [slug(mock.name), slug(mock.value)] : [])].join('-');
  return `${state}-${width}x${height}.png`;
}

const fontCss = () =>
  FONTS.flatMap(([family, pkg, weights, style]) =>
    weights.map((w) => {
      const file = join(MOCK_DIR, 'node_modules', '@fontsource', pkg, 'files', `${pkg}-latin-${w}-${style}.woff2`);
      return `@font-face{font-family:'${family}';font-weight:${w};font-style:${style};src:url('file://${file}') format('woff2')}`;
    }),
  ).join('\n');

function build(outDir) {
  const vite = join(MOCK_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
  const run = spawnSync(process.execPath, [vite, 'build'], { cwd: MOCK_DIR, env: { ...process.env, SINGLE: '1', OUT_DIR: outDir }, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`the mock did not build (exit ${run.status ?? run.error?.message}):\n${run.stdout}${run.stderr}`);
  return join(outDir, 'index.html');
}

async function launch() {
  const from = process.env.PLAYWRIGHT_FROM || join(REPO_ROOT, 'apps', 'ui', 'package.json');
  let chromium;
  try {
    ({ chromium } = createRequire(from)('@playwright/test'));
  } catch {
    throw new Error(`cannot load @playwright/test from ${from}; run pnpm install, or set PLAYWRIGHT_FROM to a package.json that resolves it`);
  }
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  try {
    return await chromium.launch({ executablePath, args: ['--no-sandbox'], ignoreDefaultArgs: ['--hide-scrollbars'] });
  } catch (err) {
    const which = executablePath ? `$CHROMIUM_PATH (${executablePath})` : "Playwright's own Chromium (set CHROMIUM_PATH to use another)";
    throw new Error(`cannot start ${which}: ${err.message.split('\n')[0]}`);
  }
}

const DEFAULTS = {
  hasMockModules: () => existsSync(join(MOCK_DIR, 'node_modules', 'vite')),
  build,
  makeTempDir: (prefix) => mkdtempSync(join(tmpdir(), prefix)),
  ensureDir: (dir) => mkdirSync(dir, { recursive: true }),
  removeDir: (dir) => rmSync(dir, { recursive: true, force: true }),
  fontCss,
  launch,
  log: console.log,
};

/** Captures the page for parsed options and returns the PNG path. `deps` replaces the filesystem, build and browser in tests. */
export async function capture(opts, deps = {}) {
  const d = { ...DEFAULTS, ...deps };
  if (!d.hasMockModules()) {
    throw new Error(`the mock's dependencies are not installed; run: (cd ${MOCK_REL} && npm ci)`);
  }
  const buildDir = d.makeTempDir('studio-next-mock-build-');
  const outDir = opts.out ? resolve(opts.out) : d.makeTempDir('studio-next-mock-shots-');
  try {
    const html = d.build(buildDir);
    d.ensureDir(outDir);
    const file = join(outDir, outputName(opts.page, opts.viewport, opts.mock));
    const browser = await d.launch();
    try {
      const context = await browser.newContext({ viewport: opts.viewport, colorScheme: opts.theme, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto(`file://${html}`);
      await page.waitForSelector('.app');
      await page.addStyleTag({ content: d.fontCss() });
      await page.evaluate(() => document.fonts.ready);
      await page.click(`.rail .nav[aria-label="${opts.page}"]`);
      if (opts.mock) {
        await page.click('#mockbtn');
        await page.check(`input[name="${opts.mock.name}"][value="${opts.mock.value}"]`);
        await page.keyboard.press('Escape');
        await page.mouse.click(700, 5);
      }
      await page.waitForTimeout(300);
      await page.screenshot({ path: file });
    } finally {
      await browser.close();
    }
    d.log(file);
    return file;
  } finally {
    d.removeDir(buildDir);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await capture(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
