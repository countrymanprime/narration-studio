#!/usr/bin/env node
/**
 * The coverage ratchet. Runs a project's tests with coverage on and compares each
 * logic directory with its floor in scripts/ci/coverage-floors.json:
 *
 *   node scripts/ci/coverage-gate.mjs go <projectRoot> [go test args] [--group=<root|race|plain>[,...]]
 *   node scripts/ci/coverage-gate.mjs vitest <projectRoot> [--shard=<i>/<n> | --merge=<n>]
 *   node scripts/ci/coverage-gate.mjs pytest <projectRoot> [pytest args]
 *
 * CI splits the Vitest run into n shards (`--shard`, one job each: the tests and their coverage go to a blob file) and
 * checks the floors once over all of them (`--merge`: reads the n blobs, fails when one is missing, and measures the
 * merged coverage exactly as an unsharded run does). A shard alone never checks a floor: it covers part of the files.
 *
 * A directory below its floor fails the run, and so does one with no coverage data at all (a
 * renamed or deleted directory must be edited out of the floors file on purpose). Floors only go
 * up: `--update` rewrites them to the rounded-down measurement and never lowers one. The floor for
 * a new logic directory is TARGET (80); a lower floor needs a written `reason` in the file.
 *
 * Race scope (M6 of docs/research/test-speed-plan-2026-11.md, #3860). On a pull request `-race` applies to the raced packages the change
 * touches (touchedPackages: a changed file in the package's own folder); the other raced packages still run every test, without the
 * detector. A package that imports a touched one is not touched: a race a change causes in its importers' tests is found on `main`. Every other run (main-health on each push to `main` and every three hours, a push, `pnpm check`) races all of them, and a red
 * main-health run opens the blocking `main-red` issue and ticks HOLD on every open train issue. A change the rule cannot place (go.mod, this script, a workflow, what the desktop tests read)
 * races everything.
 *
 * A raced package can keep a slow test out of the raced run: a `_test.go` file whose first line is `//go:build !race` is not built under `-race`, and
 * `raceSkippedTests` finds its tests so `runGo` runs them once without the detector after the raced run. The tests still run on every main-health run.
 *
 * `--group` (with `-race`) runs only some of the packages, so CI can run them as parallel jobs: `root` is the module's root
 * package, which the race detector slows to 405 s of the 622 s it spent on all the others together, `race` is the other
 * packages with concurrency, `plain` the rest. A job checks the floors of the packages it ran and no others; the jobs
 * together run every package once, and an entry naming no package fails in every job as it does in an unsplit run.
 *
 * Coverage can differ by operating system: a test that stands a file where a folder belongs reaches one more
 * statement on Windows, where a path through a file reads as "not found", than elsewhere, where it fails with ENOTDIR
 * before the write. `floor` is the Windows number (CI runs there, and the test ratchet protects it). An entry may add
 * `nonWindowsFloor`, lower than `floor`, with a `nonWindowsReason`: off Windows that one applies instead, and `--update`
 * raises whichever applies on the host.
 * UI, glue and sidecar-launch code are not listed and so are not gated.
 *
 * Scope (#3149). Two merges that each passed can leave a floor missed on `main`, and then the next unrelated pull request goes red.
 * So on a pull request (GITHUB_EVENT_NAME=pull_request) a directory below its floor fails only when the change touches it: a changed
 * file under the entry's path, or a changed test file anywhere in its project (deleting a test lowers coverage of lines it never edited).
 * Any other directory below its floor is printed as a warning. Every other run (main-health, a push, `pnpm check`) is strict as
 * before, so a floor missed on `main` turns main-health red. A directory with no coverage data always fails: that is a rename, not a drift.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { changedFiles, modeFor, under } from './pr-scope.mjs';

export const TARGET = 80;
/** A floor is only suggested for raising once coverage clears it by this many points. */
export const RAISE_MARGIN = 2;
export const FLOORS_PATH = fileURLToPath(new URL('./coverage-floors.json', import.meta.url));
const TOOLS = new Set(['go', 'vitest', 'pytest']);

const slash = (value) => value.split('\\').join('/');
const label = (entry) => `${entry.tool} ${entry.project} ${entry.path}`;

/** The floor that applies on `platform`: an entry's `nonWindowsFloor` off Windows, its `floor` on Windows. */
export function floorFor(entry, platform = process.platform) {
  return platform !== 'win32' && entry.nonWindowsFloor !== undefined ? entry.nonWindowsFloor : entry.floor;
}

/** Per-package statement coverage from `go test -cover` output, as module-relative directories. */
export function parseGoCover(output, modulePath) {
  const packages = [];
  for (const line of output.split(/\r?\n/)) {
    const coverage = /coverage:\s*([\d.]+)% of statements/.exec(line);
    const pkg = line.split(/\s+/).find((token) => token === modulePath || token.startsWith(`${modulePath}/`));
    if (!coverage || !pkg) continue;
    packages.push({ path: pkg === modulePath ? '.' : pkg.slice(modulePath.length + 1), pct: Number(coverage[1]) });
  }
  return packages;
}

const SYNC_IMPORTS = new Set(['sync', 'sync/atomic', 'golang.org/x/sync/errgroup', 'golang.org/x/sync/semaphore', 'golang.org/x/sync/singleflight']);
// Comments are not stripped: a `//` inside a string would hide the code after it, and a goroutine-shaped comment
// only costs a raced package that did not need it.
const GOROUTINE = /(^|[^\w.])go\s+(func\b|[\w.]+\s*[([])/m;
const CHANNEL = /\bchan\b/;

/**
 * Splits `go list -json` packages into those the race detector can find something in and those it
 * cannot. A package is raced when its source takes a lock, uses an atomic, starts a goroutine or
 * makes a channel, or when its tests start goroutines or synchronise (a stress test of an
 * otherwise plain package). `t.Parallel` alone does not count: parallel subtests racing on their
 * own fixtures is not a product bug. The detector costs 10 to 100 times on tight numeric loops
 * (internal/measure took 454 s under it and 4 s without), so the rest run without it.
 */
export function splitRacePackages(packages, readFile = (path) => readFileSync(path, 'utf8')) {
  const text = (pkg, files) => (files ?? []).map((file) => readFile(join(pkg.Dir, file))).join('\n');
  const race = [];
  const plain = [];
  for (const pkg of packages) {
    const source = text(pkg, pkg.GoFiles);
    const tests = text(pkg, [...(pkg.TestGoFiles ?? []), ...(pkg.XTestGoFiles ?? [])]);
    const imports = [...(pkg.Imports ?? []), ...(pkg.TestImports ?? []), ...(pkg.XTestImports ?? [])];
    const concurrent = imports.some((path) => SYNC_IMPORTS.has(path)) || GOROUTINE.test(source) || CHANNEL.test(source) || GOROUTINE.test(tests) || CHANNEL.test(tests);
    (concurrent ? race : plain).push(pkg.ImportPath);
  }
  return { race, plain };
}

/** Changed files outside any one package that put every raced package under the detector: the module, the toolchain, this gate and the workflows. */
const RACE_EVERYTHING = [
  /(^|\/)go\.(mod|sum|work)$/,
  /^\.github\//,
  /^scripts\/ci\//,
  /^scripts\/toolchain\.json$/,
  /^scripts\/quality\.mjs$/,
  // What the desktop project declares it depends on (implicitDependencies in its project.json) and its test commands: the Go tests read them.
  /^src\/studio\/desktop\/project\.json$/,
  /^config\//,
  /^tests\/fixtures\//,
  /^src\/studio\/integrations\/reaper\//,
  /^src\/studio\/libs\/python\//,
  /^src\/studio\/sidecars\/(manuscript-guide|manuscript-teleprompter|transcript-compare)\//,
];

/**
 * Files outside the Go module that no Go test reads to drive concurrent code (`internal/boothreplay` compares one UI fixture after its run), so changing them races nothing: the UI, the site, the docs tooling, the pages of
 * `docs/` that are prose, and the top-level documents. A file outside the module that is not here (a script, a fixture, a file of `docs/reference/` or
 * `docs/architecture/` that a test reads, a manifest) may be read by a test, and races everything: the direction of every unsure case.
 */
const GO_FREE = [
  /^src\/studio\/ui\//,
  /^src\/web\//,
  /^tools\//,
  /^docs\/(adr|design|guides|images|operations|prds|research|ui|utilities|workflows)\//,
  /^docs\/[^/]+\.md$/,
  // These two folders hold the files below, which Go tests read (the guard in coverage-gate.test.mjs fails when another is read), so only they race everything.
  /^docs\/reference\/(?!daw(\/|$)|storybible-import-format\.md$)/,
  /^docs\/architecture\/(?!provider-ports\.md$)/,
  /^[^/]+\.md$/,
  /^LICENSE$/,
];

/**
 * The import paths of the packages a pull request touches, or null for "all of them" (`changed` is null: not a pull request, or its base
 * could not be read; or a changed file is one of RACE_EVERYTHING). A file belongs to the package whose folder is its nearest ancestor,
 * so a fixture under `testdata/` counts for its package; `dirs` maps each package's folder, relative to the repository root with
 * forward slashes, to its import path. A changed file outside the module touches no Go package only when it is in GO_FREE; any other races everything.
 */
export function touchedPackages(dirs, changed) {
  if (changed === null) return null;
  const touched = new Set();
  for (const file of changed.map(slash)) {
    if (RACE_EVERYTHING.some((pattern) => pattern.test(file))) return null;
    let nearest = null;
    for (const dir of Object.keys(dirs)) {
      if ((dir === '' || file.startsWith(`${dir}/`)) && (nearest === null || dir.length > nearest.length)) nearest = dir;
    }
    if (nearest !== null) touched.add(dirs[nearest]);
    else if (!GO_FREE.some((pattern) => pattern.test(file))) return null;
  }
  return touched;
}

/**
 * Which of the `wanted` groups' packages run under the detector and which without: `raced` are the concurrent ones `touched` holds
 * (all of them when it is null), `later` the concurrent ones it does not, which this run tests without the detector and a run on
 * `main` races, and `plain` the ones with no concurrency.
 */
export function raceScope(byGroup, wanted, touched) {
  const concurrent = wanted.filter((name) => name !== 'plain').flatMap((name) => byGroup[name]);
  const raced = touched === null ? concurrent : concurrent.filter((pkg) => touched.has(pkg));
  return { raced, later: concurrent.filter((pkg) => !raced.includes(pkg)), plain: wanted.includes('plain') ? byGroup.plain : [] };
}

/** A package's folder from the repository root, spelled from its import path: the changed files are repository-relative, with forward slashes. */
export function packageFolder(projectRoot, modulePath, pkg) {
  const root = slash(projectRoot).replace(/^\.\//, '').replace(/\/+$/, '');
  const inside = pkg.slice(modulePath.length + 1);
  return root === '' || root === '.' ? inside : [root, inside].filter(Boolean).join('/');
}

/**
 * The tests a raced package leaves out of its raced run: every `Test` in a `_test.go` file whose first line is `//go:build !race`. They
 * are too slow under the detector and start no goroutine (internal/guide's sidecar parity tests took 95 s and 58 s raced against 14 s and
 * 0.7 s without, #3860), so runGo runs them once without it. A file with no `Test` (scripttrack's race_off_test.go holds a constant) adds none.
 */
export function raceSkippedTests(folder, list = (dir) => readdirSync(dir), read = (path) => readFileSync(path, 'utf8')) {
  const names = [];
  for (const file of list(folder).filter((name) => name.endsWith('_test.go')).sort()) {
    const text = read(join(folder, file));
    if (!/^\/\/go:build !race\s*$/m.test(text.split('\n', 1)[0])) continue;
    for (const match of text.matchAll(/^func (Test\w+)\(\w+ \*testing\.T\)/gm)) names.push(match[1]);
  }
  return names;
}

/**
 * The extra `go test` runs after the raced ones: for each raced package, its `!race` tests (raceSkippedTests) with the arguments of the raced
 * run minus `-race`, and no `-cover`, which would measure only those tests. A package that ran without the detector is not in `raced` and gets none:
 * its `!race` files were built into its plain run.
 */
export function raceSkippedRuns(raced, projectRoot, modulePath, extra, list, read) {
  const runs = [];
  for (const pkg of raced) {
    const names = raceSkippedTests(packageFolder(projectRoot, modulePath, pkg), list, read);
    if (names.length) runs.push({ pkg, names, args: [...extra.filter((arg) => arg !== '-race'), '-run', `^(${names.join('|')})$`, pkg] });
  }
  return runs;
}

const GROUPS = ['root', 'race', 'plain'];

/** `root,race` as ['root', 'race']; null when a name is not a group. */
export function parseGroups(argument) {
  const names = argument.split(',');
  return names.every((name) => GROUPS.includes(name)) && new Set(names).size === names.length ? names : null;
}

/**
 * The packages of each `--group`: `root` is the module's root package when the race detector applies to it, `race` the other
 * raced packages, `plain` the ones run without it. Together they are the whole `split` and no package is in two.
 */
export function groupPackages(split, modulePath) {
  return {
    root: split.race.filter((pkg) => pkg === modulePath),
    race: split.race.filter((pkg) => pkg !== modulePath),
    plain: split.plain,
  };
}

/** The entries a job that ran `ran` (import paths) is answerable for: its packages', and any naming a package that does not exist. */
export function entriesForPackages(entries, modulePath, ran, all) {
  const importPath = (entry) => (entry.path === '.' ? modulePath : `${modulePath}/${entry.path}`);
  return entries.filter((entry) => ran.includes(importPath(entry)) || !all.includes(importPath(entry)));
}

function relativeTo(root, file) {
  const base = slash(root).replace(/\/+$/, '');
  const path = slash(file);
  return path.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? path.slice(base.length + 1) : path;
}

/** Vitest `json-summary` (absolute file paths, line coverage) as project-relative files. */
export function normalizeVitestSummary(summary, projectRoot) {
  return Object.entries(summary)
    .filter(([file]) => file !== 'total')
    .map(([file, data]) => ({ path: relativeTo(projectRoot, file), covered: data.lines.covered, total: data.lines.total }));
}

/** A coverage.py `json` report as repository-relative files with forward slashes. */
export function normalizePytestReport(report) {
  return Object.entries(report.files).map(([file, data]) => ({ path: slash(file), covered: data.summary.covered_lines, total: data.summary.num_statements }));
}

/** Line coverage of a file or of every file under a directory; null when nothing matches. */
export function aggregateFiles(files, path) {
  const matched = files.filter((file) => file.path === path || file.path.startsWith(`${path}/`));
  if (matched.length === 0) return null;
  const total = matched.reduce((sum, file) => sum + file.total, 0);
  const covered = matched.reduce((sum, file) => sum + file.covered, 0);
  return total === 0 ? 100 : (100 * covered) / total;
}

/** A Go package is measured whole; there is no roll-up of its children. */
export function aggregatePackages(packages, path) {
  return packages.find((entry) => entry.path === path)?.pct ?? null;
}

export function validateFloors(doc) {
  const problems = [];
  const seen = new Set();
  for (const entry of doc.entries ?? []) {
    const id = label(entry);
    if (!TOOLS.has(entry.tool)) problems.push(`${id}: unknown tool "${entry.tool}"`);
    if (!entry.project || !entry.path) problems.push(`${id}: needs a project and path`);
    if (seen.has(id)) problems.push(`${id}: duplicate entry`);
    seen.add(id);
    if (!Number.isInteger(entry.floor)) problems.push(`${id}: floor must be a whole number`);
    else if (entry.floor < 0 || entry.floor > 100) problems.push(`${id}: floor must be between 0 and 100`);
    else if (entry.floor < TARGET && !entry.reason) problems.push(`${id}: floor ${entry.floor}% is below the ${TARGET}% target and has no reason`);
    if (entry.nonWindowsFloor !== undefined) {
      if (!Number.isInteger(entry.nonWindowsFloor) || entry.nonWindowsFloor < 0) problems.push(`${id}: nonWindowsFloor must be a whole number from 0`);
      else if (Number.isInteger(entry.floor) && entry.nonWindowsFloor >= entry.floor) problems.push(`${id}: nonWindowsFloor ${entry.nonWindowsFloor}% must be below the floor ${entry.floor}%; drop it when the platforms agree`);
      if (!entry.nonWindowsReason) problems.push(`${id}: nonWindowsFloor needs a nonWindowsReason`);
    } else if (entry.nonWindowsReason !== undefined) {
      problems.push(`${id}: nonWindowsReason without a nonWindowsFloor`);
    }
  }
  return problems;
}

const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.go$|(^|\/)(test_[^/]*|conftest)\.py$/;

/** Whether the changed files reach `entry`: a file under its path, or a test file under its project. */
export function touches(entry, files) {
  const location = entry.tool === 'pytest' ? entry.path : [entry.project, entry.path].filter((part) => part !== '.').join('/');
  return files.some((file) => under(file, location) || (under(file, entry.project) && TEST_FILE.test(file)));
}

/** `measure(entry)` returns the current percentage or null when there is no data. */
export function evaluate(entries, measure, platform = process.platform, { mode = 'strict', files = null } = {}) {
  const failures = [];
  const notes = [];
  const warnings = [];
  for (const entry of entries) {
    const pct = measure(entry);
    const floor = floorFor(entry, platform);
    const which = floor === entry.floor ? '' : 'non-Windows ';
    if (pct === null || pct === undefined) {
      failures.push(`${label(entry)}: no coverage data. If it was renamed or removed, edit scripts/ci/coverage-floors.json in the same change.`);
    } else if (pct + 1e-9 < floor) {
      const message = `${label(entry)}: ${pct.toFixed(1)}% is below the ${which}floor ${floor}%. Add tests; do not lower the floor to pass.`;
      const gated = mode === 'strict' || (mode === 'scoped' && (files === null || touches(entry, files)));
      if (gated) failures.push(message);
      else warnings.push(`${message} (not gated here: this pull request does not touch it)`);
    } else if (pct >= floor + RAISE_MARGIN) {
      notes.push(`${label(entry)}: ${pct.toFixed(1)}% clears the ${floor}% ${which}floor; raise it to ${Math.floor(pct)} (run with --update).`);
    }
  }
  return { failures, notes, warnings };
}

/**
 * A copy of the floors with each one raised to the rounded-down measurement; never lowered. Off Windows an entry's
 * `nonWindowsFloor` is the one raised (kept below `floor`), and on Windows `floor` is.
 */
export function raiseFloors(doc, measure, platform = process.platform) {
  return {
    ...doc,
    entries: doc.entries.map((entry) => {
      const measured = Math.floor(measure(entry) ?? 0);
      if (floorFor(entry, platform) !== entry.floor) return { ...entry, nonWindowsFloor: Math.min(entry.floor - 1, Math.max(entry.nonWindowsFloor, measured)) };
      return { ...entry, floor: Math.max(entry.floor, measured) };
    }),
  };
}

/** The floors file as it is checked in: the comment, then one entry per line so a raised floor is a one-line diff. */
export function formatFloors(doc) {
  const entries = doc.entries.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n');
  const comment = doc.$comment === undefined ? '' : `  "$comment": ${JSON.stringify(doc.$comment)},\n`;
  return `{\n${comment}  "entries": [\n${entries}\n  ]\n}\n`;
}

function readFloors() {
  const doc = JSON.parse(readFileSync(FLOORS_PATH, 'utf8'));
  const problems = validateFloors(doc);
  if (problems.length) {
    console.error(`scripts/ci/coverage-floors.json is invalid:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    process.exit(2);
  }
  return doc;
}

/** Prints the verdict and returns the exit code; writes raised floors to `floorsPath` when `update` is set. */
export function report(doc, entries, measure, { update = false, floorsPath = FLOORS_PATH, log = console.log, error = console.error, platform = process.platform, mode = modeFor(), files = mode === 'scoped' ? changedFiles() : null } = {}) {
  const { failures, notes, warnings } = evaluate(entries, measure, platform, { mode, files });
  for (const warning of warnings) log(`::warning::coverage: ${warning}`);
  for (const note of notes) log(`coverage: ${note}`);
  if (update) {
    const next = raiseFloors(doc, (entry) => (entries.includes(entry) ? measure(entry) : floorFor(entry, platform)), platform);
    writeFileSync(floorsPath, formatFloors(next));
    log('coverage: floors raised where coverage had risen.');
  }
  if (failures.length) {
    error(`\nCoverage gate failed:\n${failures.map((failure) => `  ${failure}`).join('\n')}`);
    return 1;
  }
  log(`coverage: ${entries.length} logic ${entries.length === 1 ? 'entry' : 'entries'} at or above their floors.`);
  return 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' && command === 'pnpm', maxBuffer: 256 * 1024 * 1024, ...options });
  if (result.error) {
    console.error(`coverage: could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  return result;
}

function listGoPackages(projectRoot) {
  const fields = 'ImportPath,Dir,GoFiles,TestGoFiles,XTestGoFiles,Imports,TestImports,XTestImports';
  const result = run('go', ['-C', projectRoot, 'list', `-json=${fields}`, './...'], { stdio: ['inherit', 'pipe', 'inherit'] });
  if (result.status !== 0) process.exit(result.status ?? 1);
  // One indented object per package, each opening with `{` at the start of a line.
  return result.stdout.split(/\r?\n(?=\{)/).filter((chunk) => chunk.trim()).map((chunk) => JSON.parse(chunk));
}

/**
 * `-race` runs only on the packages splitRacePackages picks; every package is still tested and measured. With `groups`
 * only those groups' packages run, and `ran` names them (all of them when there are none).
 */
function goTestRuns(projectRoot, modulePath, extra, groups, changed = changedFiles()) {
  if (!extra.includes('-race')) {
    if (groups) {
      console.error('coverage: --group needs -race, which is what divides the packages.');
      process.exit(2);
    }
    return { runs: [{ args: extra, packages: ['./...'] }], ran: null, raced: [], all: [] };
  }
  const listed = listGoPackages(projectRoot);
  const split = splitRacePackages(listed);
  const all = [...split.race, ...split.plain];
  const byGroup = groupPackages(split, modulePath);
  const wanted = groups ?? GROUPS;
  const folders = Object.fromEntries(all.map((pkg) => [packageFolder(projectRoot, modulePath, pkg), pkg]));
  let touched = touchedPackages(folders, changed);
  // The rule reads folders as the changed files spell them. If the module is not where the spelling says, nothing would match and
  // nothing would be raced, so race everything and say so.
  if (touched !== null && !existsSync(join(packageFolder(projectRoot, modulePath, modulePath) || '.', 'go.mod'))) {
    console.log(`::warning::coverage: no go.mod at ${packageFolder(projectRoot, modulePath, modulePath) || '.'} from ${process.cwd()}; racing every package`);
    touched = null;
  }
  const { raced, later, plain: quiet } = raceScope(byGroup, wanted, touched);
  const plain = [...quiet, ...later];
  if (later.length) console.log(`coverage: ${later.length} packages with concurrency that this pull request does not touch run without -race here and with it on main: ${later.join(', ')}`);
  if (quiet.length) console.log(`coverage: ${quiet.length} packages with no concurrency run without -race: ${quiet.join(', ')}`);
  if (groups) console.log(`coverage: group ${groups.join(',')}: ${raced.length} packages with -race, ${plain.length} without; the rest run in other jobs.`);
  return {
    runs: [
      { args: extra, packages: raced },
      { args: extra.filter((arg) => arg !== '-race'), packages: plain },
    ].filter((group) => group.packages.length > 0),
    ran: [...raced, ...plain],
    raced,
    all,
  };
}

function runGo(projectRoot, extra, groups) {
  const goMod = readFileSync(join(projectRoot, 'go.mod'), 'utf8');
  const modulePath = /^module\s+(\S+)/m.exec(goMod)?.[1];
  let output = '';
  let failed = 0;
  const { runs, ran, raced, all } = goTestRuns(projectRoot, modulePath, extra, groups);
  // Every run happens even when an earlier one fails, so one failure does not hide another.
  for (const { args, packages } of runs) {
    const result = run('go', ['-C', projectRoot, 'test', '-cover', ...args, ...packages], { stdio: ['inherit', 'pipe', 'inherit'] });
    process.stdout.write(result.stdout ?? '');
    output += result.stdout ?? '';
    if (result.status !== 0) failed = result.status ?? 1;
  }
  // The tests a raced package's `!race` files hold run here once, without the detector and without -cover (the raced run measured the
  // package; this pass would only lower it). They run after the others so a failure there is one more, not the first.
  for (const { pkg, names, args } of raceSkippedRuns(raced, projectRoot, modulePath, extra)) {
    console.log(`coverage: ${pkg}: ${names.length} tests are out of the raced run and run here without -race: ${names.join(', ')}`);
    const result = run('go', ['-C', projectRoot, 'test', ...args], { stdio: ['inherit', 'inherit', 'inherit'] });
    if (result.status !== 0) failed = result.status ?? 1;
  }
  if (failed) process.exit(failed);
  const packages = parseGoCover(output, modulePath);
  return { measure: (entry) => aggregatePackages(packages, entry.path), modulePath, ran, all };
}

function reportsDir(name) {
  const dir = resolve('.cache', 'coverage', name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** `--shard=2/3` as {index: 2, count: 3}; null for anything else. */
export function parseShard(argument) {
  const match = /^--shard=(\d+)\/(\d+)$/.exec(argument ?? '');
  const shard = match && { index: Number(match[1]), count: Number(match[2]) };
  return shard && shard.index >= 1 && shard.index <= shard.count ? shard : null;
}

/** The blob file shard `index` of `count` writes and `--merge` expects. */
export const blobName = (index, count) => `blob-${index}-${count}.json`;

/** What is wrong with the blob files a `count`-way merge finds: a shard's missing, or one of another split left behind. */
export function blobProblems(present, count) {
  const expected = Array.from({ length: count }, (_, i) => blobName(i + 1, count));
  const missing = expected.filter((name) => !present.includes(name));
  const extra = present.filter((name) => !expected.includes(name));
  return [
    ...missing.map((name) => `${name} is missing: a shard did not report, so its tests and coverage are not in this run`),
    ...extra.map((name) => `${name} is not part of a ${count}-way split`),
  ];
}

/** Where `--shard` writes its blob and `--merge` reads them: beside the reports dir of the same project. */
function blobsDir(projectRoot) {
  const dir = resolve('.cache', 'coverage', `vitest-${projectRoot.replaceAll('/', '-')}-blobs`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Vitest options of every Vitest mode: only the listed logic files are instrumented, components and glue are not gated. */
function vitestCoverageArgs(entries, dir) {
  const includes = entries.map((entry) => (/\.[a-z]+$/i.test(entry.path) ? entry.path : `${entry.path}/**`));
  return [
    '--coverage.enabled',
    '--coverage.provider=v8',
    '--coverage.reporter=json-summary',
    `--coverage.reportsDirectory=${dir}`,
    ...includes.map((include) => `--coverage.include=${include}`),
  ];
}

function runVitest(projectRoot, entries, { shard = null, merge = 0 } = {}) {
  const dir = reportsDir(`vitest-${projectRoot.replaceAll('/', '-')}`);
  const args = ['--dir', projectRoot, 'exec', 'vitest', 'run', ...vitestCoverageArgs(entries, dir)];
  if (shard) {
    // The report goes to the console as usual and, with the coverage, to the blob `--merge` reads. No floor is checked here.
    const blobs = blobsDir(projectRoot);
    // Blobs of an earlier split would be merged with this one's.
    for (const name of readdirSync(blobs)) if (name.startsWith('blob-') && !name.endsWith(`-${shard.count}.json`)) rmSync(join(blobs, name));
    const blob = join(blobs, blobName(shard.index, shard.count));
    const result = run('pnpm', [...args, `--shard=${shard.index}/${shard.count}`, '--reporter=default', '--reporter=blob', `--outputFile.blob=${blob}`], { stdio: 'inherit' });
    process.exit(result.status ?? 1);
  }
  if (merge) {
    const blobs = blobsDir(projectRoot);
    const problems = blobProblems(readdirSync(blobs), merge);
    if (problems.length) {
      console.error(`coverage: cannot merge the blobs in ${blobs}:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
      process.exit(1);
    }
    const result = run('pnpm', [...args, `--merge-reports=${blobs}`, '--reporter=default'], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  } else {
    const result = run('pnpm', args, { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  const files = normalizeVitestSummary(JSON.parse(readFileSync(join(dir, 'coverage-summary.json'), 'utf8')), resolve(projectRoot));
  return (entry) => aggregateFiles(files, entry.path);
}

function runPytest(projectRoot, extra) {
  const dir = reportsDir(`pytest-${projectRoot.replaceAll('/', '-')}`);
  const json = join(dir, 'coverage.json');
  const quality = fileURLToPath(new URL('../quality.mjs', import.meta.url));
  // quality.mjs picks the repository's Python and isolates pytest's temp directory.
  const result = run('node', [quality, 'pytest', ...extra, `--cov=${projectRoot}`, `--cov-report=json:${json}`], { stdio: 'inherit', env: { ...process.env, COVERAGE_FILE: join(dir, '.coverage') } });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const files = normalizePytestReport(JSON.parse(readFileSync(json, 'utf8')));
  return (entry) => aggregateFiles(files, entry.path);
}

/** `--shard=i/n` or `--merge=n` after `vitest <projectRoot>`; nothing is an unsharded run, anything else is refused. */
function vitestMode(rest) {
  if (rest.length === 0) return {};
  const merge = /^--merge=(\d+)$/.exec(rest[0] ?? '');
  const shard = parseShard(rest[0]);
  if (rest.length === 1 && shard) return { shard };
  if (rest.length === 1 && merge && Number(merge[1]) >= 1) return { merge: Number(merge[1]) };
  console.error('Usage: coverage-gate.mjs vitest <projectRoot> [--shard=<i>/<n> | --merge=<n>]');
  process.exit(2);
}

function main(argv) {
  const update = argv.includes('--update');
  const [tool, projectRoot, ...rest] = argv.filter((argument) => argument !== '--update');
  if (!TOOLS.has(tool) || !projectRoot) {
    console.error('Usage: coverage-gate.mjs <go|vitest|pytest> <projectRoot> [tool args] [--update]');
    process.exit(2);
  }
  const doc = readFloors();
  const entries = doc.entries.filter((entry) => entry.tool === tool && entry.project === projectRoot);
  if (entries.length === 0) {
    console.error(`No coverage floors are listed for ${tool} ${projectRoot} in scripts/ci/coverage-floors.json.`);
    process.exit(2);
  }
  if (tool === 'go') {
    const groupArgs = rest.filter((argument) => argument.startsWith('--group='));
    const groups = groupArgs.length ? parseGroups(groupArgs[0].slice('--group='.length)) : undefined;
    if (groupArgs.length > 1 || groups === null) {
      console.error('Usage: coverage-gate.mjs go <projectRoot> -race --group=<root|race|plain>[,...]');
      process.exit(2);
    }
    const goTest = runGo(projectRoot, rest.filter((argument) => !argument.startsWith('--group=')), groups);
    // A job answers for the packages it ran: the others' floors are checked by the jobs that ran them.
    const owned = goTest.ran ? entriesForPackages(entries, goTest.modulePath, goTest.ran, goTest.all) : entries;
    process.exit(report(doc, owned, goTest.measure, { update }));
  }
  const measure = tool === 'vitest' ? runVitest(projectRoot, entries, vitestMode(rest)) : runPytest(projectRoot, rest);
  process.exit(report(doc, entries, measure, { update }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
