#!/usr/bin/env node
// Splits the visual suite (apps/ui/tests/visual) across CI shards by measured time. Playwright's own `--shard=i/n` cuts the list into
// runs of equal test COUNT, and the tests are far from equal: the shards ran 12 m 14 s to 14 m 22 s, and the longest one carried the
// `aria` step as well. This assigns every test to the shard with the least estimated time so far (longest first), from the mean
// time of tests like it in apps/ui/tests/visual/shard-weights.json, and runs the shard with Playwright's `--test-list`.
//
//   node scripts/ci/visual-shards.mjs split --shard 2/3 --out shard.txt [--manifest shard-2.json] [--github-output]
//       Lists the suite (a few seconds, no browser), writes shard 2's tests to shard.txt, prints the plan, and with
//       --github-output sets `aria=true|false` for the step that runs the aria suite on exactly one shard. --manifest records how
//       many tests the shard has out of how many there are, which whole-run.check.ts checks across the shards.
//   node scripts/ci/visual-shards.mjs weights report.json [more.json ...] [--out apps/ui/tests/visual/shard-weights.json]
//       Rebuilds the weights from Playwright JSON reports (`--reporter=json`; CI uploads one per shard as ui-visual-timings-<i>).
//
// Every test is in exactly one shard: the split is a pure function of the listed tests and the weights file, every shard job computes
// the same split, and `split` fails if the lists do not add up. A test the weights have never seen is estimated from its spec file.
// The weights only steer the balance. A stale weight makes a shard slower, never a test unrun.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..', '..', 'apps', 'ui');
const WEIGHTS_FILE = join(UI, 'tests', 'visual', 'shard-weights.json');

/** Measured on the `aria` step of a CI shard (2026-10-18): 49 s. It is placed like a test, so the shard that runs it gets fewer. */
const ARIA_SECONDS = 49;
/** The estimate for a test whose spec file has no weight at all. */
const FALLBACK_SECONDS = 10;
/** playwright.config.ts `workers`: the estimate is test time, a shard's wall time is that divided by the workers. */
const WORKERS = 4;

/**
 * Every test of a Playwright `--list --reporter=json` (or a run's) report: the file it is declared in, the spec file that loads it (they differ
 * for the overlay guard, whose tests are declared in a helper), its title path and, for a run, the time it took.
 */
export function testsOfReport(report) {
  const found = [];
  const walk = (suite, path, loadFile) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const seconds = (test.results ?? []).reduce((sum, result) => sum + (result.duration ?? 0), 0) / 1000;
        found.push({ file: spec.file, loadFile, titlePath: [...path, spec.title], seconds });
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title], loadFile);
  };
  for (const file of report.suites ?? []) walk(file, [], file.file);
  return found;
}

/** The title Playwright prints and `--test-list` matches, per spec file. Throws on a title the list format cannot carry. */
export function describeTest(test) {
  const title = test.titlePath.join(' › ');
  for (const part of test.titlePath) {
    if (/[>›]/.test(part) || part !== part.trim() || part.startsWith('[')) {
      throw new Error(
        `${test.file}: the title "${part}" cannot be written in a --test-list file (no ">", "›", surrounding spaces or leading "["); rename the test`,
      );
    }
  }
  return { ...test, title, line: `${test.file} › ${test.titlePath.join(' › ')}` };
}

/** The group a test's weight is kept under: its spec file and the first two " / " parts of its title (page and state, or page and overlay). */
export function groupKey(file, titlePath) {
  return `${file}|${titlePath.join(' › ').split(' / ').slice(0, 2).join(' / ')}`;
}

/** One entry per distinct test (a repeated title would otherwise be written twice and could land in two shards), with its estimated seconds. */
export function planTests(tests, weights) {
  const byLine = new Map();
  for (const test of tests.map(describeTest)) {
    const known = byLine.get(test.line);
    if (known) known.copies += 1;
    else byLine.set(test.line, { ...test, copies: 1 });
  }
  const perFile = weights.files ?? {};
  return [...byLine.values()].map((test) => {
    const each = weights.groups?.[groupKey(test.file, test.titlePath)] ?? perFile[test.file] ?? weights.fallback ?? FALLBACK_SECONDS;
    return { ...test, estimate: each * test.copies };
  });
}

/**
 * Longest-processing-time-first: tests in descending estimated time, each to the shard with the least so far. The aria suite is one more
 * item. Ties break on the title, so every shard job derives the same split.
 */
/**
 * The lines a test list needs besides the tests: `--test-list` loads only the files it names, and a test declared in a helper is named by
 * the helper, so the spec file that loads it gets a line of its own (it selects no test, since none is declared in it). Throws if a test is
 * declared in such a file, because that line would select all of them in every shard.
 */
export function loaderLines(items) {
  const loaders = new Set(items.filter((item) => item.loadFile !== item.file).map((item) => item.loadFile));
  const clash = items.find((item) => loaders.has(item.file));
  if (clash) throw new Error(`${clash.file} declares tests and also loads tests declared elsewhere; a test list cannot tell them apart`);
  return [...loaders].sort();
}

export function assign(items, shards, ariaSeconds = ARIA_SECONDS) {
  const loads = Array.from({ length: shards }, () => ({ seconds: 0, tests: [], aria: false }));
  const ordered = [{ aria: true, estimate: ariaSeconds, line: '' }, ...items].sort((a, b) => b.estimate - a.estimate || a.line.localeCompare(b.line));
  for (const item of ordered) {
    const lightest = loads.reduce((best, load, index) => (load.seconds < loads[best].seconds ? index : best), 0);
    loads[lightest].seconds += item.estimate;
    if (item.aria) loads[lightest].aria = true;
    else loads[lightest].tests.push(item);
  }
  return loads;
}

/** Throws unless the shards hold every item exactly once. */
export function assertPartition(items, loads) {
  const seen = new Map();
  for (const load of loads) for (const test of load.tests) seen.set(test.line, (seen.get(test.line) ?? 0) + 1);
  const wrong = items.filter((item) => seen.get(item.line) !== 1).map((item) => item.line);
  if (wrong.length > 0 || seen.size !== items.length) throw new Error(`the shards do not hold every test exactly once: ${wrong.slice(0, 5).join('; ')}`);
}

/** Weights from run reports: the mean seconds of a test per group, and per spec file for a test not seen before. */
export function weightsOf(reports) {
  const groups = new Map();
  const files = new Map();
  const add = (map, key, seconds) => {
    const entry = map.get(key) ?? { total: 0, count: 0 };
    entry.total += seconds;
    entry.count += 1;
    map.set(key, entry);
  };
  for (const test of reports.flatMap(testsOfReport)) {
    if (test.seconds <= 0) continue;
    add(groups, groupKey(test.file, test.titlePath), test.seconds);
    add(files, test.file, test.seconds);
  }
  const mean = (map) =>
    Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b)).map(([key, { total, count }]) => [key, Math.round((total / count) * 10) / 10]));
  const allSeconds = [...files.values()].reduce((sum, entry) => sum + entry.total, 0);
  const allCount = [...files.values()].reduce((sum, entry) => sum + entry.count, 0);
  return { fallback: Math.round((allSeconds / Math.max(allCount, 1)) * 10) / 10, files: mean(files), groups: mean(groups) };
}

const digestOf = (items) =>
  createHash('sha256')
    .update(
      items
        .map((item) => item.line)
        .sort()
        .join('\n'),
    )
    .digest('hex')
    .slice(0, 16);

function listSuite() {
  const out = execFileSync('pnpm', ['--dir', UI, 'exec', 'playwright', 'test', 'tests/visual', '--list', '--reporter=json'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
  });
  return JSON.parse(out);
}

function option(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

function split(argv) {
  const [current, of] = (option(argv, '--shard') ?? '').split('/').map(Number);
  if (!(current >= 1 && of >= current)) throw new Error('usage: visual-shards.mjs split --shard i/n --out file');
  const out = option(argv, '--out');
  const weights = JSON.parse(readFileSync(WEIGHTS_FILE, 'utf8'));
  const items = planTests(testsOfReport(listSuite()), weights);
  if (items.length === 0) throw new Error('Playwright listed no tests');
  const loads = assign(items, of);
  assertPartition(items, loads);
  const mine = loads[current - 1];
  const lines = [...loaderLines(mine.tests), ...mine.tests.map((test) => test.line).sort()];
  if (out) writeFileSync(out, `${lines.join('\n')}\n`);
  const manifest = { shard: current, of, total: items.length, count: mine.tests.length, digest: digestOf(items) };
  const manifestPath = option(argv, '--manifest');
  if (manifestPath) writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  loads.forEach((load, index) =>
    console.log(
      `shard ${index + 1}/${of}: ${load.tests.length} tests, about ${Math.round((load.seconds / 60 / WORKERS) * 10) / 10} min${load.aria ? ' (+ aria)' : ''}${index + 1 === current ? ' <- this job' : ''}`,
    ),
  );
  if (argv.includes('--github-output') && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `aria=${mine.aria}\n`);
}

function weights(argv) {
  const out = option(argv, '--out') ?? WEIGHTS_FILE;
  const inputs = argv.filter((arg, index) => !arg.startsWith('--') && argv[index - 1] !== '--out');
  if (inputs.length === 0) throw new Error('usage: visual-shards.mjs weights report.json [...] [--out file]');
  const reports = inputs.map((file) => JSON.parse(readFileSync(file, 'utf8')));
  writeFileSync(out, `${JSON.stringify({ ...weightsOf(reports), measuredFrom: inputs.length === 1 ? '1 report' : `${inputs.length} reports` }, null, 1)}\n`);
  console.log(`wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'split') split(rest);
  else if (command === 'weights') weights(rest);
  else {
    console.error('usage: visual-shards.mjs split|weights ...');
    process.exit(2);
  }
}
