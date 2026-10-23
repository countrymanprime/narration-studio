#!/usr/bin/env node
/* global console, process */
// Targeted run of the component atlas: builds Storybook, then runs only the stories of the named pages or components
// (a Storybook title, its first segment or any segment: `Editing`, `Ribbon`, `Master & QC/Page`), light and dark at the atlas's
// wide and narrow canvases. The PNGs are written by the atlas to
//   apps/ui/screenshots/atlas/<title-slug>/<story>--<theme>-<viewport>.png
// Usage: pnpm --dir apps/ui atlas:page <name>... [--no-build]   (--no-build reuses storybook-static/)
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { browserEnv } from './targeted-runs.mjs';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const noBuild = args.includes('--no-build');
const names = args.filter((arg) => !arg.startsWith('--'));
if (names.length === 0) {
  console.error('name at least one page or component, e.g. pnpm --dir apps/ui atlas:page Settings Editing');
  process.exit(2);
}
const env = { ...process.env, ...browserEnv(process.env, existsSync(chromium.executablePath())) };
if (env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
  console.log('browser: an installed Chromium (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or the headless shell under PLAYWRIGHT_BROWSERS_PATH)');

if (!noBuild || !existsSync('storybook-static/index.json')) {
  const build = spawnSync('pnpm', ['run', 'build-storybook'], { stdio: 'inherit', env });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
// Images of earlier runs would otherwise be mistaken for this run's.
rmSync('screenshots/atlas', { recursive: true, force: true });
const run = spawnSync('pnpm', ['exec', 'playwright', 'test', '-c', 'playwright.atlas.config.ts'], {
  stdio: 'inherit',
  env: { ...env, UI_ATLAS_FILTER: names.join(',') },
});
if (existsSync('screenshots/atlas')) {
  const count = readdirSync('screenshots/atlas', { recursive: true }).filter((f) => f.endsWith('.png')).length;
  console.log(`${count} PNGs -> apps/ui/screenshots/atlas`);
}
process.exit(run.status ?? 1);
