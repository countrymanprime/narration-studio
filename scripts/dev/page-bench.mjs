#!/usr/bin/env node
/* global console, process, window, document, performance, MutationObserver, requestAnimationFrame */
// Page-load benchmark (#3254): opens the mock-backed app with a synthetic book of N hours (`?mockBookHours=N`, fixtures/bookSize.ts) and
// times every page in the navigation, cold (a fresh browser context loading the page's URL) and warm (a click on the navigation from
// another page in a loaded app, the narrator's flow). Per page it reports:
//   first    ms from the start until the page's main region first changes (route render began)
//   usable   ms until no host call is in flight and the page's DOM has been still for 200 ms (the quiet window itself is not counted)
//   calls    host calls made, with the slowest one's name and ms, and the answers' total JSON size in KB
//   heap     JS heap in MB after a forced GC
//   nodes    DOM nodes in the page
// Each cell is the median of --runs runs (default 5). Usage:
//   node scripts/dev/page-bench.mjs [--hours 1,5,17,40] [--runs 5] [--pages Production,Script] [--out table.md] [--json out.json]
// Build first: `pnpm --dir src/studio/ui run build:mock`. Serves node_modules/.cache/mock-build on UI_APP_PORT (default 4391).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ui = join(import.meta.dirname, '../../src/studio/ui');
const { chromium } = createRequire(join(ui, 'package.json'))('@playwright/test');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const HOURS = (args.hours ?? '1,5,17,40').split(',').map(Number);
const RUNS = Number(args.runs ?? 5);
const PAGES = [
  ['Production', '/'], ['Schedule', '/schedule'], ['Script', '/script'], ['Story Bible', '/story-bible'], ['Booth', '/booth'],
  ['Editing', '/editing'], ['Proof', '/proof'], ['Pickups', '/pickups'], ['Master & QC', '/master'], ['Delivery', '/delivery'], ['Settings', '/settings'],
].filter(([name]) => !args.pages || args.pages.split(',').includes(name));
const PORT = Number(process.env.UI_APP_PORT ?? 4391);
const ORIGIN = `http://localhost:${PORT}`;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// In the page: resolves once nothing is in flight and the DOM has been still for 200 ms. `t0` is the performance.now() of the start.
const MEASURE = (t0) =>
  new Promise((resolve) => {
    const root = () => document.getElementById('root');
    let first = null;
    let lastChange = performance.now();
    const observer = new MutationObserver(() => {
      lastChange = performance.now();
      first ??= lastChange - t0;
    });
    observer.observe(root(), { subtree: true, childList: true, attributes: true, characterData: true });
    const tick = () => {
      const now = performance.now();
      const pending = window.__hostPending ?? 0;
      const busy = document.querySelector('[aria-busy="true"]');
      if (pending === 0 && !busy && now - lastChange >= 200 && now - t0 > 250) {
        observer.disconnect();
        resolve({ first: first ?? 0, usable: lastChange - t0 });
      } else setTimeout(tick, 25);
    };
    tick();
  });

async function stats(page, cdp, t0, sinceCalls) {
  const timing = await page.evaluate(MEASURE, t0);
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const heap = metrics.find((m) => m.name === 'JSHeapUsedSize').value / 1048576;
  const nodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  const calls = (await page.evaluate(() => window.__hostCalls)).slice(sinceCalls);
  const slow = calls.reduce((a, c) => (c.ms > a.ms ? c : a), { name: '-', ms: 0 });
  return { ...timing, heap, nodes, calls: calls.length, slow: `${slow.name} ${slow.ms.toFixed(0)}ms`, slowMs: slow.ms, kb: calls.reduce((n, c) => n + c.bytes, 0) / 1024, list: calls };
}

async function measureCold(browser, hours, path) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.addInitScript(() => { window.__t0 = performance.now(); });
  await page.goto(`${ORIGIN}${path}?mockBookHours=${hours}&mockCallLog=1`, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.getElementById('root')?.childElementCount);
  const result = await stats(page, cdp, 0, 0);
  await context.close();
  return result;
}

async function measureWarm(browser, hours, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const from = name === 'Settings' ? '/script' : '/settings';
  await page.goto(`${ORIGIN}${from}?mockBookHours=${hours}&mockCallLog=1`);
  await page.getByRole('navigation').first().waitFor();
  await page.evaluate(MEASURE, await page.evaluate(() => performance.now())); // settle the first page
  const sinceCalls = await page.evaluate(() => window.__hostCalls.length);
  const link = page.getByRole('navigation').getByText(name, { exact: true }).first();
  const t0 = await page.evaluate(() => performance.now());
  await link.click();
  const result = await stats(page, cdp, t0, sinceCalls);
  await context.close();
  return result;
}

const server = spawn('pnpm', ['exec', 'vite', 'preview', '--outDir', 'node_modules/.cache/mock-build', '--port', String(PORT), '--strictPort'], { cwd: ui, stdio: 'ignore' });
try {
  for (let i = 0; i < 100; i++) {
    if (await fetch(ORIGIN).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const browser = await chromium.launch({ args: ['--no-sandbox', '--js-flags=--expose-gc'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const rows = [];
  for (const hours of HOURS) {
    for (const [name, path] of PAGES) {
      for (const mode of ['cold', 'warm']) {
        const runs = [];
        for (let r = 0; r < RUNS; r++) runs.push(mode === 'cold' ? await measureCold(browser, hours, path) : await measureWarm(browser, hours, name));
        const pick = (key) => median(runs.map((x) => x[key]));
        const row = { hours, page: name, mode, first: pick('first'), usable: pick('usable'), calls: pick('calls'), kb: pick('kb'), heap: pick('heap'), nodes: pick('nodes'), slow: runs[Math.floor(runs.length / 2)].slow, perCall: runs[0].list.map(({ name: n, ms, bytes }) => ({ n, ms: Math.round(ms), kb: Math.round(bytes / 1024) })) };
        rows.push(row);
        console.log(`${hours}h ${name} ${mode}: first ${row.first.toFixed(0)} usable ${row.usable.toFixed(0)} calls ${row.calls} ${row.kb.toFixed(0)}KB heap ${row.heap.toFixed(0)}MB nodes ${row.nodes} slowest ${row.slow}`);
      }
    }
  }
  await browser.close();
  const lines = ['| Page | Mode | ' + HOURS.map((h) => `${h} h usable ms`).join(' | ') + ' | ' + HOURS.map((h) => `${h} h nodes`).join(' | ') + ' | ' + HOURS.map((h) => `${h} h calls / KB`).join(' | ') + ' |', '|' + '---|'.repeat(2 + 3 * HOURS.length)];
  for (const [name] of PAGES)
    for (const mode of ['cold', 'warm']) {
      const at = (h) => rows.find((r) => r.hours === h && r.page === name && r.mode === mode);
      lines.push(`| ${name} | ${mode} | ${HOURS.map((h) => at(h).usable.toFixed(0)).join(' | ')} | ${HOURS.map((h) => at(h).nodes).join(' | ')} | ${HOURS.map((h) => `${at(h).calls} / ${at(h).kb.toFixed(0)}`).join(' | ')} |`);
    }
  if (args.out) writeFileSync(args.out, lines.join('\n') + '\n');
  if (args.json) writeFileSync(args.json, JSON.stringify(rows, null, 1));
  console.log('\n' + lines.join('\n'));
} finally {
  server.kill();
}
