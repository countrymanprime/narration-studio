#!/usr/bin/env node
// Builds the screenshot evidence of a UI PR: runs the targeted real-app run (apps/ui `visual:page`) and the targeted Storybook
// run (`atlas:page`) for the pages named, copies every PNG - every catalogued state, not a pick - to
//   pr-screenshots/<slice>/<page>-<state>-<viewport>-<theme>.png          (real app)
//   pr-screenshots/<slice>/storybook-<title>-<story>-<viewport>-<theme>.png   (Storybook)
// and prints the Markdown for the PR body: per page a collapsed table, one row per state and viewport, light beside dark, each
// image embedded by commit SHA. Usage:
//   node scripts/dev/pr-screenshots.mjs <slice> <page>... [--stories Title,...] [--sha <sha>] [--skip-run] [--no-stories]
// --stories names the Storybook titles when they differ from the pages (default: the pages' names); --skip-run only collects what
// the last runs left in apps/ui/screenshots/. Replace <SHA> with the commit that holds the images (the placeholder stays until
// `--sha` is given). The rules stay: commit the PNGs, embed by SHA, make the LAST commit delete pr-screenshots/, and leave
// docs/images/ui to the guide-refresh worker. See .claude/rules/ui-spec-and-screenshots.md.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const UI = 'apps/ui';

export const prImageName = ({ page, state, viewport, theme }) => `${page}-${state}-${viewport}-${theme}.png`;

const dirs = (path) => (existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
const pngs = (path) => (existsSync(path) ? readdirSync(path).filter((f) => f.endsWith('.png')) : []);

// `root` is apps/ui/screenshots/targeted: <theme>/<page>/<state>/<viewport>.png.
export function collectVisual(root, pages) {
  const rows = [];
  for (const theme of dirs(root)) {
    for (const page of dirs(join(root, theme)).filter((p) => pages.includes(p))) {
      for (const state of dirs(join(root, theme, page))) {
        for (const file of pngs(join(root, theme, page, state))) {
          rows.push({ page, state, viewport: basename(file, '.png'), theme, file: join(root, theme, page, state, file) });
        }
      }
    }
  }
  return rows;
}

// `root` is apps/ui/screenshots/atlas: <title-slug>/<story>--<theme>-<viewport>.png.
export function collectAtlas(root) {
  const rows = [];
  for (const title of dirs(root)) {
    for (const file of pngs(join(root, title))) {
      const match = /^(.+)--(light|dark)-(.+)\.png$/.exec(file);
      if (match) rows.push({ page: `storybook-${title}`, state: match[1], viewport: match[3], theme: match[2], file: join(root, title, file) });
    }
  }
  return rows;
}

export function stageImages(rows, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const row of rows) cpSync(row.file, join(dest, prImageName(row)));
}

export function markdownFor(rows, { repo, slice, sha }) {
  const image = (row) => (row ? `![](https://raw.githubusercontent.com/${repo}/${sha}/pr-screenshots/${slice}/${prImageName(row)})` : '—');
  const pages = [...new Set(rows.map((r) => r.page))];
  const lines = [];
  for (const page of pages) {
    const mine = rows.filter((r) => r.page === page);
    const states = [...new Set(mine.map((r) => r.state))];
    lines.push(`<details><summary>${page} (${states.length} states, ${mine.length} images)</summary>`, '', '| Page | State | Viewport | Light | Dark |', '| - | - | - | - | - |');
    for (const state of states) {
      for (const viewport of [...new Set(mine.filter((r) => r.state === state).map((r) => r.viewport))]) {
        const pick = (theme) => mine.find((r) => r.state === state && r.viewport === viewport && r.theme === theme);
        lines.push(`| ${page} | ${state} | ${viewport} | ${image(pick('light'))} | ${image(pick('dark'))} |`);
      }
    }
    lines.push('', '</details>', '');
  }
  return lines.join('\n');
}

function main(argv) {
  const flags = new Set(['stories', 'sha']);
  const names = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) names.push(arg);
    else if (flags.has(arg.slice(2))) options[arg.slice(2)] = argv[++i];
    else options[arg.slice(2)] = true;
  }
  const [slice, ...pages] = names;
  if (!slice || pages.length === 0) {
    console.error('usage: node scripts/dev/pr-screenshots.mjs <slice> <page>... [--stories Title,...] [--sha <sha>] [--skip-run] [--no-stories]');
    process.exit(2);
  }
  const root = resolve(import.meta.dirname, '../..');
  const run = (script, args) => {
    const result = spawnSync('pnpm', ['--dir', UI, script, ...args], { cwd: root, stdio: ['ignore', 2, 2] });
    if (result.status !== 0) console.error(`pnpm --dir ${UI} ${script} exited ${result.status}: the images below are what it left, and the PR must state this failure`);
  };
  if (!options['skip-run']) {
    run('visual:page', pages);
    if (!options['no-stories']) run('atlas:page', (options.stories ?? pages.join(',')).split(','));
  }
  const rows = [...collectVisual(join(root, UI, 'screenshots/targeted'), pages), ...(options['no-stories'] ? [] : collectAtlas(join(root, UI, 'screenshots/atlas')))];
  if (rows.length === 0) {
    console.error('no screenshots found; nothing staged');
    process.exit(1);
  }
  stageImages(rows, join(root, 'pr-screenshots', slice));
  let repo = 'countrymanprime/narration-utils';
  try {
    repo = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim().replace(/\.git$/, '').replace(/^.*github\.com[:/]/, '');
  } catch {
    // keep the default
  }
  console.error(`${rows.length} images -> pr-screenshots/${slice}/`);
  console.log(markdownFor(rows, { repo, slice, sha: options.sha ?? '<SHA>' }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
