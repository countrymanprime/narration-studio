// Shared by visual-page.mjs and atlas-page.mjs: the pure parts of a targeted visual run (which tests to select, which
// installed browser to use), so node --test can pin them without a browser.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const THEMES = ['light', 'dark'];

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Playwright's -g pattern for the visual suite: every test titled `<page> / ...` (tests/visual/app.spec.ts), for each page.
// The leading (^|\s) keeps `script` from also taking `proof-chapter` rows or a file path that merely contains it.
export function visualGrep(pages) {
  if (pages.length === 0) throw new Error('name at least one page (a `page` value of tests/visual/state-catalog.ts, e.g. settings)');
  for (const page of pages) {
    if (!/^[a-z0-9-]+$/.test(page)) throw new Error(`"${page}" is not a page name (lowercase letters, digits and dashes, as in state-catalog.ts)`);
  }
  return `(^|\\s)(${pages.map(escapeRegExp).join('|')}) / `;
}

// A cloud worker container ships a Chromium whose build is older than the one the pinned @playwright/test wants and forbids
// `playwright install`. When PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is unset and the pinned build is missing, use the headless
// shell found under PLAYWRIGHT_BROWSERS_PATH: it is what the suite launches in CI, so captures match (the full Chromium
// requests /favicon.ico and fails the suite's 404 check).
export function findInstalledHeadlessShell(browsersPath, exists = existsSync, list = (dir) => readdirSync(dir)) {
  if (!browsersPath || !exists(browsersPath)) return undefined;
  const shells = list(browsersPath)
    .filter((name) => /^chromium_headless_shell-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
  for (const dir of shells) {
    const base = join(browsersPath, dir);
    for (const sub of list(base).filter((name) => name.startsWith('chrome-'))) {
      const executable = ['headless_shell', 'chrome-headless-shell'].map((name) => join(base, sub, name)).find((candidate) => exists(candidate));
      if (executable) return executable;
    }
  }
  return undefined;
}

// The environment a targeted run hands Playwright: the caller's own PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH wins; otherwise the
// installed shell is used only when the pinned build (`pinnedExists`) is absent, so a developer machine keeps Playwright's own.
export function browserEnv(env, pinnedExists, find = findInstalledHeadlessShell) {
  if (env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || pinnedExists) return {};
  const found = find(env.PLAYWRIGHT_BROWSERS_PATH);
  return found ? { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: found } : {};
}

export function parseThemes(value) {
  const themes = (value ?? THEMES.join(','))
    .split(',')
    .map((theme) => theme.trim())
    .filter(Boolean);
  for (const theme of themes) if (!THEMES.includes(theme)) throw new Error(`--themes takes light and/or dark, got "${theme}"`);
  return themes;
}

// Splits `argv` into positional names and `--flag value` / `--flag=value` options.
export function parseArgs(argv, flags) {
  const names = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (!arg.startsWith('--')) {
      names.push(arg);
      continue;
    }
    const [flag, inline] = arg.slice(2).split(/=(.*)/s);
    if (!flags.includes(flag)) throw new Error(`unknown option --${flag}`);
    options[flag] = inline ?? argv[++i] ?? '';
  }
  return { names, options };
}
