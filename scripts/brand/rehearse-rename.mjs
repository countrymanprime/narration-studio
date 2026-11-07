// The rename rehearsal (docs/operations/renaming-the-app.md): renames a throwaway copy of the repository to a
// made-up name with `rename-app`, then runs the checks a rename must pass with no second edit: the brand sync, both name guards
// and the tests that read the name. A test or file that spells the current name instead of reading it fails here, before a real
// rename needs it.
//
// The copy is a detached git worktree of HEAD in the system temp folder (so uncommitted changes are not in it), with its own
// node_modules and .venv installed from the pnpm store and uv cache the checkout already filled. The checkout itself is never
// written to. Every check runs, the worktree is removed, and the run fails at the end if any check did.
//
//   node scripts/brand/rehearse-rename.mjs [--full] [--keep]
//     (default)  the per-pull-request run (the rename rehearsal step of _quality.yml's Test (Linux) shard 1): the guards, the Node script tests, the site build's
//                tests, the docs-site tests, `go vet ./...` and the Go, Python, Lua and UI tests that read the brand
//     --full     the scheduled run (main-health.yml): the same checks, plus the UI typecheck and the built site with its
//                retired-name check, the one check of the name in rendered output. It no longer re-runs every test suite (#3078):
//                scripts/ci/brand-name.mjs already fails on the name spelled in any tracked file, tests included, and the
//                suites run in their own jobs. Over 2026-10-30 to 11-06 the re-runs found no spelled name; their reds were load
//                and test-quality failures (the seven-day summary on #3078).
//     --keep     leaves the worktree in place and prints where it is

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPOSITORY_ROOT, listFiles } from './brand.mjs';
import { renameApp } from './rename-app.mjs';

const REHEARSAL_NAME = ['Zebra', 'Audio', 'Lab'].join(' ');

const DESKTOP = 'src/studio/desktop';
const UI = 'src/studio/ui';
const node = (...args) => ['node', args];
const python = (...args) => ['node', ['scripts/quality.mjs', 'python', ...args]];

/** The UI test files that import the generated brand module. */
function uiBrandTests(root) {
  return listFiles(root)
    .filter((file) => file.startsWith(`${UI}/src/`) && /\.test\.tsx?$/.test(file))
    .filter((file) => /from '[./]*brand\.gen'|brand\.gen'/.test(readFileSync(join(root, file), 'utf8')))
    .map((file) => file.slice(UI.length + 1));
}

/** The checks after the rename: [label, command, args, cwd]. */
export function steps(root, full = false) {
  const always = [
    ['brand sync is clean', ...node('scripts/brand/sync.mjs', '--check')],
    ['the current name is only in the brand file and its outputs', ...node('scripts/ci/brand-name.mjs')],
    ['the retired names, the outgoing one among them, are gone', ...node('scripts/ci/old-name.mjs')],
    [
      'Node script tests',
      ...node('--test', ...['brand', 'ci', 'github', 'licenses', 'release'].map((folder) => `scripts/${folder}/*.test.mjs`)),
    ],
    ['site build tests', ...node('--test', 'src/web/build/*.test.mjs')],
    ['docs-site tests', 'uv', ['run', '--locked', '--only-group', 'docs', 'python', '-m', 'pytest', '-q', '-p', 'no:cacheprovider', 'tools/docs-site/tests']],
    ['Go vet (every package and test builds)', 'go', ['vet', './...'], DESKTOP],
  ];
  const brandTests = [
    ['Go tests that read the brand', 'go', ['test', './internal/brand/...', './internal/contractfile/...', './internal/deliveryreport/...', './internal/productionreport/...'], DESKTOP],
    ['Python brand tests', ...python('-m', 'pytest', '-q', '-p', 'no:cacheprovider', 'src/studio/libs/python/tests/test_brand.py', 'src/studio/libs/python/tests/test_config_audacity.py')],
    ['Lua bridge harness', ...python('src/studio/integrations/reaper/tests/run_lua_tests.py')],
    ['UI tests that read the brand', 'pnpm', ['exec', 'vitest', 'run', ...uiBrandTests(root)], UI],
  ];
  if (!full) return [...always, ...brandTests];
  // The docs-site tests above already build the docs strictly, so --full adds no docs build of its own.
  return [
    ...always,
    ...brandTests,
    ['UI typecheck', 'pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'], UI],
    ['built site', ...node('src/web/build/build-demo-site.mjs')],
    ['the built site never says a retired name', ...node('scripts/ci/old-name.mjs', 'dir', 'dist-site')],
  ];
}

function main(args) {
  const full = args.includes('--full');
  const run = (command, commandArgs, cwd) =>
    execFileSync(command, commandArgs, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  const work = mkdtempSync(join(tmpdir(), 'rename-rehearsal-'));
  run('git', ['worktree', 'add', '--detach', work, 'HEAD'], REPOSITORY_ROOT);
  const failed = [];
  try {
    // The copy's own dependencies, from the store and cache the checkout's setup filled; no install script runs.
    run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--ignore-scripts', '--filter', 'workspace', '--filter', 'ui', '--filter', 'web'], work);
    run('uv', ['sync', '--locked', '--group', 'docs'], work);
    const result = renameApp(REHEARSAL_NAME, { root: work });
    console.log(`Renamed the copy at ${work} from "${result.oldName}" to "${result.newName}": ${result.changed.length} files.`);
    for (const [label, command, commandArgs, cwd = '.'] of steps(work, full)) {
      console.log(`\n::group::${label}`);
      try {
        run(command, commandArgs, join(work, cwd));
      } catch {
        failed.push(label);
      }
      console.log('::endgroup::');
    }
  } finally {
    if (args.includes('--keep')) console.log(`The renamed copy is at ${work} (git worktree remove --force ${work} removes it).`);
    else run('git', ['worktree', 'remove', '--force', work], REPOSITORY_ROOT);
  }
  if (failed.length) {
    // A failed check is not always a spelled name: a test can fail in the copy for its own reasons. Its log is in the group above.
    console.error(`\nAfter a rename to "${REHEARSAL_NAME}", these checks failed (each one's output is in its group above):\n  ${failed.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`\nA rename to "${REHEARSAL_NAME}" needs no second edit.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
