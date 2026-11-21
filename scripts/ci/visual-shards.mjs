#!/usr/bin/env node
// Splits the visual suite (src/studio/ui/tests/visual) across CI shards by measured time. Playwright's own `--shard=i/n` cuts the list into
// runs of equal test COUNT, and the tests are far from equal: the shards ran 12 m 14 s to 14 m 22 s, and the longest one carried the
// `aria` step as well. This assigns every test to the shard with the least estimated time so far (longest first), from the mean
// time of tests like it in src/studio/ui/tests/visual/shard-weights.json, and runs the shard with Playwright's `--test-list`.
//
//   node scripts/ci/visual-shards.mjs split --shard 2/3 --out shard.txt [--manifest shard-2.json] [--github-output] [--reserve-first <s>]
//       Lists the suite (a few seconds, no browser), writes shard 2's tests to shard.txt, prints the plan, and with
//       --github-output sets `aria=true|false` for the step that runs the aria suite on exactly one shard. --manifest records how
//       many tests the shard has out of how many there are, which whole-run.check.ts checks across the shards. --reserve-first gives shard 1
//       that many fewer seconds of tests (wall time), for a job that runs other steps there too.
//   node scripts/ci/visual-shards.mjs weights report.json [more.json ...] [--out src/studio/ui/tests/visual/shard-weights.json]
//       Rebuilds the weights from Playwright JSON reports (`--reporter=json`; CI uploads one per shard as ui-visual-timings-<i>).
//
// On a pull request `split` narrows the suite to what the change touches (`scopeOf`, below; docs/research/test-speed-plan-2026-11.md):
// the state matrix always runs whole, and a behaviour spec or an overlay guard row runs when the change reaches its page. Every other
// run (Main health on `main`, a manual run) splits the whole suite, so a test left off a pull request runs on `main` after the merge,
// where a red run ticks HOLD and opens the main-red issue. The shards' manifests count the narrowed list, so the gate still proves
// that the shards ran every test the pull request owed.
//
// Every test is in exactly one shard: the split is a pure function of the listed tests and the weights file, every shard job computes
// the same split, and `split` fails if the lists do not add up. A test the weights have never seen is estimated from its spec file.
// The weights only steer the balance. A stale weight makes a shard slower, never a test unrun.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { changedFiles } from './pr-scope.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..', '..', 'src', 'studio', 'ui');
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

export function assign(items, shards, ariaSeconds = ARIA_SECONDS, reserveFirst = 0) {
  // `reserveFirst`: test-seconds kept off shard 1, which is given that much less (its size and reason are at _quality.yml's `split` step).
  const loads = Array.from({ length: shards }, (_, index) => ({ seconds: index === 0 ? reserveFirst : 0, tests: [], aria: false }));
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

const UI_ROOT = 'src/studio/ui/';
const COMPONENTS = `${UI_ROOT}src/components/`;
const SPECS = `${UI_ROOT}tests/visual/`;
/** The state matrix: every catalogued page and state at every viewport. It draws every page, so it runs on every pull request. */
const MATRIX_SPEC = 'app.spec.ts';
const OVERLAY_GUARD = 'helpers/overlayGuardFor.ts';

/**
 * A page: its folders under src/components, the first word of its behaviour specs' file names (`booth-keys.spec.ts`), and its name in
 * the overlay guard's titles. A component folder that is not listed here (primitives, layout, tracks) is shared code. So is `engine`: it is
 * a panel that other pages draw, and its specs (`engine-link-closes-overlay`) drive Proof and Production.
 */
export const PAGES = [
  { folders: ['booth'], spec: 'booth' },
  { folders: ['delivery'], spec: 'delivery', overlay: 'Delivery' },
  { folders: ['editing'], spec: 'editing', overlay: 'Editing' },
  { folders: ['master', 'masterqc'], spec: 'master', overlay: 'Master & QC' },
  { folders: ['pickups'], spec: 'pickups', overlay: 'Pickups' },
  { folders: ['production'], spec: 'production', overlay: 'Production' },
  { folders: ['project'], spec: 'project' },
  { folders: ['proof'], spec: 'proof', overlay: 'Proof' },
  { folders: ['schedule'], spec: 'schedule', overlay: 'Schedule' },
  { folders: ['script'], spec: 'script', overlay: 'Script' },
  { folders: ['settings'], spec: 'settings', overlay: 'Settings' },
  { folders: ['storybible'], spec: 'storybible', overlay: 'Story Bible' },
];
/** The overlay primitives and the shell that draws overlays over every page: a change here runs every overlay guard row. */
const OVERLAY_CODE = new RegExp(
  `^${UI_ROOT}src/(overlay/|components/layout/|components/primitives/(ConfirmDialog|ContextMenu|Dialog|Menu|NavDrawer|Popover|Tooltip|WorkDialog|dialog|overlay|inputModality)[^/]*$)`,
);
/** A unit test or a story draws nothing in the app. */
const NOT_THE_APP = /\.(test|stories)\.[cm]?[jt]sx?$/;

/**
 * The pages a spec's text names, by any of a page's words (its spec word, its folders, its name in the overlay guard). A spec named for one
 * page often drives another (a Booth spec that opens Pickups or reads a Settings card), so a spec is owed by every page it names, not only
 * by the page in its file name. A word in a comment counts too: naming a page too often runs a spec more, never less.
 */
export function pagesNamedIn(text) {
  return PAGES.filter((page) =>
    [page.spec, ...page.folders, page.overlay ?? page.spec].some((word) => new RegExp(`\\b${word.replace(/[^a-z]+/gi, '\\W*')}`, 'i').test(text)),
  ).map((page) => page.spec);
}

const pageOfFolder = (file) => PAGES.find((page) => page.folders.some((folder) => file.startsWith(`${COMPONENTS}${folder}/`)));
const isDoc = (file) => file.startsWith('docs/') || file.endsWith('.md');

/**
 * What a change reaches in the visual suite. `changed` is the pull request's files (pr-scope.mjs), or null when the run is not a pull
 * request or its base cannot be read: then, and whenever a file could change the suite itself or the build (anything that is not app
 * source, one spec file or a doc), the answer is everything. That is the strict direction: a file this does not recognise runs the
 * whole suite.
 */
export function scopeOf(changed) {
  if (changed === null) return { everything: true, reason: 'not a pull request, or its base cannot be read' };
  const scope = { everything: false, pages: new Set(), specs: new Set(), shared: false, overlays: false };
  for (const file of changed) {
    if (isDoc(file)) continue;
    if (file.startsWith(SPECS) && file.endsWith('.spec.ts') && !file.slice(SPECS.length).includes('/')) {
      scope.specs.add(file.slice(SPECS.length));
      continue;
    }
    if (!file.startsWith(`${UI_ROOT}src/`)) return { everything: true, reason: `${file} is outside the app's source` };
    if (NOT_THE_APP.test(file)) continue;
    if (OVERLAY_CODE.test(file)) scope.overlays = true;
    const page = pageOfFolder(file);
    if (page) scope.pages.add(page.spec);
    else scope.shared = true;
  }
  return scope;
}

/** Whether a pull request with this scope owes this test. Everything it does not owe runs on `main`. */
export function inScope(test, scope) {
  if (scope.everything || test.loadFile === MATRIX_SPEC || scope.specs.has(test.loadFile)) return true;
  if (test.file === OVERLAY_GUARD) {
    const page = PAGES.find((candidate) => candidate.overlay === test.titlePath[0]?.split(' / ')[0]);
    return scope.overlays || (page ? scope.pages.has(page.spec) : scope.shared);
  }
  const first = test.loadFile.split(/[-.]/)[0];
  // `names`: the pages the spec's text names (split reads the file); without it, the page in the file name.
  if ((test.names ?? []).some((name) => scope.pages.has(name))) return true;
  // A spec named for no page (dialog-*, toast-*, crossPage, colour-field, reader-*) exercises shared code, and some drive one page under
  // another name, so any change to the app's source owes it: shared code or a page's folder.
  return PAGES.some((page) => page.spec === first) ? scope.pages.has(first) : scope.shared || scope.pages.size > 0;
}

/** One line for the log and the job summary: what the pull request runs and what it leaves to `main`. */
export function describeScope(scope, kept, all) {
  if (scope.everything) return `visual scope: the whole suite (${scope.reason})`;
  const left = all.filter((test) => !kept.includes(test));
  const files = [...new Set(left.map((test) => test.loadFile))].sort();
  const touched = [...scope.pages].sort().join(', ') || 'no page';
  return `visual scope: ${kept.length} of ${all.length} tests (the state matrix; pages touched: ${touched}; shared code: ${scope.shared ? 'yes' : 'no'}). ${left.length} tests of ${files.length} spec files run on main after the merge.`;
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
  const listed = planTests(testsOfReport(listSuite()), weights);
  if (listed.length === 0) throw new Error('Playwright listed no tests');
  const scope = scopeOf(changedFiles());
  const namesOf = new Map();
  for (const file of new Set(listed.map((test) => test.loadFile))) namesOf.set(file, pagesNamedIn(readFileSync(join(UI, 'tests', 'visual', file), 'utf8')));
  const items = listed.filter((test) => inScope({ ...test, names: namesOf.get(test.loadFile) }, scope));
  const said = describeScope(scope, items, listed);
  console.log(said);
  // Shard 1 alone writes the line into the run's summary; every shard computes the same scope.
  if (current === 1 && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${said}\n`);
  // --reserve-first <seconds>: wall seconds shard 1's job spends on other steps; every shard job passes the same value, so all derive one split.
  const reserve = Number(option(argv, '--reserve-first') ?? 0);
  if (!(reserve >= 0)) throw new Error('--reserve-first takes a number of seconds');
  const loads = assign(items, of, ARIA_SECONDS, reserve * WORKERS);
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
