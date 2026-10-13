#!/usr/bin/env node
/* global console, process */
// Targeted run of the real-app visual suite (tests/visual/app.spec.ts): only the state-catalog rows of the named pages, at
// every viewport the catalog declares for each row, in the light and the dark theme. The PNGs land in
//   apps/ui/screenshots/targeted/<theme>/<page>/<state>/<viewport>.png
// and a PASS/FAIL/SKIP line per state is printed. Usage: pnpm --dir apps/ui visual:page <page>... [--themes light,dark] [--out <dir>]
//
// Whole-run checks (duplicate screenshots, blank pages) are deferred as for a CI shard (UI_VISUAL_SHARDED=1), because a few
// pages are not the whole run; CI judges the full catalog. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is filled in from the browsers
// installed under PLAYWRIGHT_BROWSERS_PATH when the pinned build is missing (scripts/targeted-runs.mjs).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { browserEnv, parseArgs, parseThemes, visualGrep } from './targeted-runs.mjs';

const { names: pages, options } = parseArgs(process.argv.slice(2), ['themes', 'out']);
const themes = parseThemes(options.themes);
const out = options.out ?? 'screenshots/targeted';
const grep = visualGrep(pages);
const env = { ...process.env, ...browserEnv(process.env, existsSync(chromium.executablePath())) };
if (env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
  console.log('browser: an installed Chromium (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or the headless shell under PLAYWRIGHT_BROWSERS_PATH)');

function statesOf(report) {
  const rows = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const status = spec.tests.every((t) => t.status === 'skipped') ? 'SKIP' : spec.ok ? 'PASS' : 'FAIL';
      rows.push({ title: spec.title, status });
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return rows;
}

let failed = false;
for (const theme of themes) {
  for (const page of pages) rmSync(join('screenshots/app', page), { recursive: true, force: true });
  const reportFile = join('test-results', `visual-page-${theme}.json`);
  mkdirSync('test-results', { recursive: true });
  console.log(`\n== ${pages.join(', ')} / ${theme} ==`);
  const run = spawnSync('pnpm', ['exec', 'playwright', 'test', 'tests/visual/app.spec.ts', '-g', grep, '--reporter=list,json'], {
    stdio: 'inherit',
    env: { ...env, UI_THEME: theme, UI_VISUAL_SHARDED: '1', PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile },
  });
  if (run.status !== 0) failed = true;
  if (existsSync(reportFile)) {
    const rows = statesOf(JSON.parse(readFileSync(reportFile, 'utf8')));
    for (const row of rows) console.log(`${row.status.padEnd(4)} ${row.title}`);
    console.log(
      `${theme}: ${rows.filter((r) => r.status === 'PASS').length} passed, ${rows.filter((r) => r.status === 'FAIL').length} failed, ${rows.filter((r) => r.status === 'SKIP').length} skipped`,
    );
  }
  for (const page of pages) {
    const from = join('screenshots/app', page);
    if (!existsSync(from)) {
      console.error(`no screenshots for page "${page}": is it a page in tests/visual/state-catalog.ts?`);
      failed = true;
      continue;
    }
    const to = join(out, theme, page);
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
    const count = readdirSync(to, { recursive: true }).filter((f) => f.endsWith('.png')).length;
    console.log(`${count} PNGs -> apps/ui/${to}`);
  }
}
process.exit(failed ? 1 : 0);
