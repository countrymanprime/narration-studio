import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  aggregateFiles,
  aggregatePackages,
  evaluate,
  FLOORS_PATH,
  floorFor,
  formatFloors,
  normalizePytestReport,
  normalizeVitestSummary,
  parseGoCover,
  raiseFloors,
  RAISE_MARGIN,
  report,
  splitRacePackages,
  TARGET,
  validateFloors,
} from './coverage-gate.mjs';

const entry = (over = {}) => ({ tool: 'go', project: 'apps/desktop', path: 'internal/importer', floor: 85, ...over });

test('parses per-package statement coverage from `go test -cover` output', () => {
  const output = [
    'ok  \texample.com/app\t3.2s\tcoverage: 56.5% of statements',
    '\texample.com/app/cmd/tool\t\tcoverage: 0.0% of statements',
    'ok  \texample.com/app/internal/importer\t(cached)\tcoverage: 85.1% of statements',
    '?   \texample.com/app/internal/empty\t[no test files]',
    'ok  \texample.com/app/internal/types\t0.2s\tcoverage: [no statements]',
    'FAIL\texample.com/app/internal/broken\t0.1s',
  ].join('\n');
  assert.deepEqual(parseGoCover(output, 'example.com/app'), [
    { path: '.', pct: 56.5 },
    { path: 'cmd/tool', pct: 0 },
    { path: 'internal/importer', pct: 85.1 },
  ]);
});

// A `go list -json` package, with its files' text in `files` instead of on disk.
const goPackage = (name, { imports = [], testImports = [], source = 'package p\n', tests = null } = {}) => ({
  ImportPath: `example.com/app/${name}`,
  Dir: `/app/${name}`,
  GoFiles: ['p.go'],
  TestGoFiles: tests === null ? [] : ['p_test.go'],
  Imports: imports,
  TestImports: testImports,
  files: { [`/app/${name}/p.go`]: source, [`/app/${name}/p_test.go`]: tests ?? '' },
});
const split = (packages) => splitRacePackages(packages, (path) => packages.flatMap((pkg) => Object.entries(pkg.files)).find(([file]) => file === path.replaceAll('\\', '/'))[1]);

test('races a package whose source takes a lock, uses an atomic, starts a goroutine or makes a channel', () => {
  const { race, plain } = split([
    goPackage('mutex', { imports: ['sync'] }),
    goPackage('atomic', { imports: ['sync/atomic'] }),
    goPackage('goroutine', { source: 'package p\nfunc f() { go s.run(ctx) }\n' }),
    goPackage('closure', { source: 'package p\nfunc f() {\n\tgo func() {}()\n}\n' }),
    goPackage('channel', { source: 'package p\nvar done = make(chan struct{})\n' }),
    goPackage('math', { imports: ['math'], source: 'package p\nfunc gain(x float64) float64 { return x * 2 }\n' }),
  ]);
  assert.deepEqual(race, ['example.com/app/mutex', 'example.com/app/atomic', 'example.com/app/goroutine', 'example.com/app/closure', 'example.com/app/channel']);
  assert.deepEqual(plain, ['example.com/app/math']);
});

test('races a package whose tests start goroutines or synchronise, but not one whose tests only call t.Parallel', () => {
  const { race, plain } = split([
    goPackage('stress', { tests: 'package p\nfunc TestX(t *testing.T) { go read() }\n' }),
    goPackage('waitgroup', { testImports: ['sync', 'testing'], tests: 'package p\n' }),
    goPackage('parallel', { testImports: ['testing'], tests: 'package p\nfunc TestX(t *testing.T) { t.Parallel() }\n' }),
  ]);
  assert.deepEqual(race, ['example.com/app/stress', 'example.com/app/waitgroup']);
  assert.deepEqual(plain, ['example.com/app/parallel']);
});

test('races a package that starts goroutines through errgroup or behind a string holding //', () => {
  const { race } = split([
    goPackage('errgroup', { imports: ['golang.org/x/sync/errgroup'], source: 'package p\nfunc f() { g.Go(work) }\n' }),
    goPackage('url', { source: 'package p\nfunc f() { client := "https://example.com"; go worker.run(client) }\n' }),
  ]);
  assert.deepEqual(race, ['example.com/app/errgroup', 'example.com/app/url']);
});

test('does not mistake the word go in a comment or a go test command line for a goroutine', () => {
  const { plain } = split([goPackage('docs', { source: 'package p\n// Run go test ./... to go over it; go\n' })]);
  assert.deepEqual(plain, ['example.com/app/docs']);
});

test('aggregates files under a directory or a single file, never a sibling with the same prefix', () => {
  const files = [
    { path: 'src/hooks/a.ts', covered: 9, total: 10 },
    { path: 'src/hooks/b.ts', covered: 1, total: 10 },
    { path: 'src/hooks-extra/c.ts', covered: 0, total: 100 },
    { path: 'src/state.ts', covered: 49, total: 49 },
  ];
  assert.equal(aggregateFiles(files, 'src/hooks'), 50);
  assert.equal(aggregateFiles(files, 'src/state.ts'), 100);
  assert.equal(aggregateFiles(files, 'src/missing'), null);
  assert.equal(aggregateFiles([{ path: 'src/types/t.ts', covered: 0, total: 0 }], 'src/types'), 100, 'a directory with nothing to cover is fully covered');
});

test('finds a Go package by its module-relative directory only', () => {
  const packages = [{ path: 'internal/importer', pct: 85.1 }];
  assert.equal(aggregatePackages(packages, 'internal/importer'), 85.1);
  assert.equal(aggregatePackages(packages, 'internal'), null);
});

test('passes a value at its floor and fails one below it, naming the entry and both numbers', () => {
  const atFloor = evaluate([entry()], () => 85);
  assert.deepEqual(atFloor.failures, []);
  const below = evaluate([entry()], () => 84.9);
  assert.equal(below.failures.length, 1);
  assert.match(below.failures[0], /go apps\/desktop internal\/importer/);
  assert.match(below.failures[0], /84\.9%/);
  assert.match(below.failures[0], /floor 85%/);
});

test('fails an entry with no coverage data instead of skipping it', () => {
  const result = evaluate([entry()], () => null);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /no coverage data/);
});

test('reports a ratchet note when coverage has risen well past the floor', () => {
  assert.equal(evaluate([entry({ floor: 85 })], () => 85 + RAISE_MARGIN - 0.5).notes.length, 0);
  const risen = evaluate([entry({ floor: 85 })], () => 90.4);
  assert.equal(risen.failures.length, 0);
  assert.equal(risen.notes.length, 1);
  assert.match(risen.notes[0], /raise .* to 90/);
});

test('raises floors to the rounded-down measurement and never lowers one', () => {
  const doc = { entries: [entry({ floor: 85 }), entry({ path: 'internal/recents', floor: 85 })] };
  const measure = (e) => ({ 'internal/importer': 91.9, 'internal/recents': 80 })[e.path];
  const next = raiseFloors(doc, measure);
  assert.deepEqual(
    next.entries.map((e) => e.floor),
    [91, 85],
  );
  assert.notEqual(next, doc, 'the input is not mutated');
  assert.equal(doc.entries[0].floor, 85);
});

test('the floor for a new logic directory is the target; a lower floor needs a written reason', () => {
  assert.equal(TARGET, 80);
  assert.deepEqual(validateFloors({ entries: [entry({ floor: 80 })] }), []);
  assert.match(validateFloors({ entries: [entry({ floor: 79 })] }).join('\n'), /below the 80% target and has no reason/);
  assert.deepEqual(validateFloors({ entries: [entry({ floor: 79, reason: 'baseline of 2026-09-20; properties raise it' })] }), []);
});

test('rejects malformed, duplicate and out-of-range entries', () => {
  const problems = (entries) => validateFloors({ entries }).join('\n');
  assert.match(problems([entry({ tool: 'jest' })]), /unknown tool/);
  assert.match(problems([entry({ floor: 101 })]), /between 0 and 100/);
  assert.match(problems([entry({ floor: 84.5 })]), /whole number/);
  assert.match(problems([entry(), entry()]), /duplicate/);
  assert.match(problems([entry({ path: '' })]), /project and path/);
});

test('normalizes Vitest json-summary paths to project-relative forward slashes', () => {
  const summary = {
    total: { lines: { total: 1, covered: 1 } },
    'C:\\repo\\apps\\ui\\src\\state.ts': { lines: { total: 49, covered: 49 } },
    '/repo/apps/ui/src/hooks/useThing.ts': { lines: { total: 4, covered: 2 } },
  };
  assert.deepEqual(normalizeVitestSummary(summary, 'c:\\repo\\apps\\ui'), [
    { path: 'src/state.ts', covered: 49, total: 49 },
    { path: '/repo/apps/ui/src/hooks/useThing.ts', covered: 2, total: 4 },
  ]);
  assert.deepEqual(normalizeVitestSummary({ '/repo/apps/ui/src/hooks/useThing.ts': { lines: { total: 4, covered: 2 } } }, '/repo/apps/ui'), [
    { path: 'src/hooks/useThing.ts', covered: 2, total: 4 },
  ]);
});

test('normalizes a coverage.py json report', () => {
  const report = {
    files: {
      'libs\\python\\narration_common\\manuscript.py': { summary: { covered_lines: 13, num_statements: 35 } },
      'sidecars/manuscript-teleprompter/core/script_tracker.py': { summary: { covered_lines: 146, num_statements: 147 } },
    },
  };
  assert.deepEqual(normalizePytestReport(report), [
    { path: 'libs/python/narration_common/manuscript.py', covered: 13, total: 35 },
    { path: 'sidecars/manuscript-teleprompter/core/script_tracker.py', covered: 146, total: 147 },
  ]);
});

test('the checked-in floors file is valid and is exactly what --update would write', () => {
  const text = readFileSync(FLOORS_PATH, 'utf8');
  const doc = JSON.parse(text);
  assert.deepEqual(validateFloors(doc), []);
  assert.ok(doc.entries.length > 0);
  assert.equal(formatFloors(doc), text.replaceAll('\r\n', '\n'), 'run the gate with --update, or format the file the same way, so raising a floor stays a one-line diff');
});

const quiet = { log: () => {}, error: () => {} };

test('the report exits 1 when any entry fails and 0 when all pass', () => {
  const doc = { entries: [entry()] };
  assert.equal(report(doc, doc.entries, () => 85, quiet), 0);
  assert.equal(report(doc, doc.entries, () => 84, quiet), 1);
  assert.equal(report(doc, doc.entries, () => null, quiet), 1);
});

test('--update writes raised floors to the file, and a failing run still reports 1 after writing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-gate-'));
  const floorsPath = join(dir, 'floors.json');
  const doc = { entries: [entry({ floor: 80 }), entry({ path: 'internal/recents', floor: 90 })] };
  const measure = (e) => (e.path === 'internal/importer' ? 88.6 : 85);
  assert.equal(report(doc, doc.entries, measure, { ...quiet, update: true, floorsPath }), 1, 'recents is below its floor');
  const written = JSON.parse(readFileSync(floorsPath, 'utf8'));
  assert.deepEqual(
    written.entries.map((e) => e.floor),
    [88, 90],
    'importer raised, recents never lowered',
  );
});

test('the command line rejects an unknown tool and a project with no floors without running anything', () => {
  const cli = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('./coverage-gate.mjs', import.meta.url)), ...args], { encoding: 'utf8' });
  const unknownTool = cli('jest', 'apps/ui');
  assert.equal(unknownTool.status, 2);
  assert.match(unknownTool.stderr, /Usage/);
  const unlisted = cli('go', 'apps/not-a-project');
  assert.equal(unlisted.status, 2);
  assert.match(unlisted.stderr, /No coverage floors are listed/);
});

// --- Floors that differ by operating system (a `nonWindowsFloor` beside the Windows `floor`) ---

const osEntry = (over = {}) => entry({ floor: 96, nonWindowsFloor: 95, nonWindowsReason: 'a file where a folder belongs fails earlier off Windows', ...over });

test('an entry has one floor on Windows and its nonWindowsFloor everywhere else', () => {
  assert.equal(floorFor(osEntry(), 'win32'), 96);
  assert.equal(floorFor(osEntry(), 'linux'), 95);
  assert.equal(floorFor(osEntry(), 'darwin'), 95);
  assert.equal(floorFor(entry({ floor: 90 }), 'linux'), 90, 'an entry with no nonWindowsFloor has the same floor everywhere');
});

test('the same measurement passes off Windows and fails on Windows, and the failure names the floor that applied', () => {
  const measure = () => 95.5;
  assert.deepEqual(evaluate([osEntry()], measure, 'linux').failures, []);
  const windows = evaluate([osEntry()], measure, 'win32').failures;
  assert.equal(windows.length, 1);
  assert.match(windows[0], /95\.5% is below the floor 96%/);
  const offWindows = evaluate([osEntry()], () => 94.9, 'linux').failures;
  assert.match(offWindows[0], /94\.9% is below the non-Windows floor 95%/);
});

test('a ratchet note off Windows names the non-Windows floor', () => {
  const { notes } = evaluate([osEntry({ floor: 99, nonWindowsFloor: 90 })], () => 95, 'linux');
  assert.match(notes[0], /clears the 90% non-Windows floor; raise it to 95/);
});

test('--update raises the floor that applies on the host and leaves the other one alone', () => {
  const doc = { entries: [osEntry()] };
  const linux = raiseFloors(doc, () => 95.9, 'linux').entries[0];
  assert.deepEqual([linux.floor, linux.nonWindowsFloor], [96, 95], 'a 95.9 measurement raises nothing off Windows');
  assert.equal(raiseFloors({ entries: [osEntry({ nonWindowsFloor: 90 })] }, () => 95.9, 'linux').entries[0].nonWindowsFloor, 95);
  assert.equal(raiseFloors(doc, () => 99, 'linux').entries[0].nonWindowsFloor, 95, 'kept below the Windows floor, which is the one that matters on CI');
  const windows = raiseFloors(doc, () => 97.2, 'win32').entries[0];
  assert.deepEqual([windows.floor, windows.nonWindowsFloor], [97, 95]);
  assert.equal(raiseFloors(doc, () => 80, 'linux').entries[0].nonWindowsFloor, 95, 'never lowered');
});

test('--update from another host leaves an entry that was not part of the run exactly as it was', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-gate-'));
  const floorsPath = join(dir, 'floors.json');
  const inRun = entry({ path: 'internal/importer', floor: 80 });
  const other = osEntry({ project: 'apps/other' });
  const doc = { entries: [inRun, other] };
  assert.equal(report(doc, [inRun], () => 88.6, { ...quiet, update: true, floorsPath, platform: 'linux' }), 0);
  const written = JSON.parse(readFileSync(floorsPath, 'utf8')).entries;
  assert.equal(written[0].floor, 88);
  assert.deepEqual([written[1].floor, written[1].nonWindowsFloor], [96, 95]);
});

test('a nonWindowsFloor must be a whole number below the floor and say why', () => {
  assert.deepEqual(validateFloors({ entries: [osEntry()] }), []);
  const bad = (over) => validateFloors({ entries: [osEntry(over)] }).join('\n');
  assert.match(bad({ nonWindowsFloor: 96 }), /must be below the floor 96%/);
  assert.match(bad({ nonWindowsFloor: 97 }), /must be below the floor 96%/);
  assert.match(bad({ nonWindowsFloor: 94.5 }), /whole number/);
  assert.match(bad({ nonWindowsFloor: -1 }), /whole number/);
  assert.match(bad({ nonWindowsReason: undefined }), /needs a nonWindowsReason/);
  assert.match(validateFloors({ entries: [entry({ nonWindowsReason: 'orphan' })] }).join('\n'), /nonWindowsReason without a nonWindowsFloor/);
});
