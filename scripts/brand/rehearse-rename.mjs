// The rename rehearsal (docs/research/app-name-injection.md#the-rename): renames this checkout to a made-up name with
// `rename-app`, then runs the checks a rename must pass with no second edit: the brand sync, both name guards and the tests that
// read the name. A test or file that spells the current name instead of reading it fails here, before a real rename needs it.
//
// It changes the checkout it runs in, so it refuses to run outside CI unless given --in-place: run it in a throwaway worktree
// (`git worktree add --detach ../rehearsal HEAD`). Every check runs, and it fails at the end if any did.
//
//   node scripts/brand/rehearse-rename.mjs [--full] [--in-place]
//     (default)  the per-pull-request run (ci.yml's rename-rehearsal job): the guards, the Node script tests, the site build's
//                tests, the docs-site tests, `go vet ./...` and the Go, Python, Lua and UI tests that read the brand
//     --full     the nightly run (main-health.yml): every Go, UI, shared-library Python and Lua test, the built site and the
//                strict docs build

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
function steps(root = REPOSITORY_ROOT, full = false) {
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
  if (!full) {
    return [
      ...always,
      ['Go tests that read the brand', 'go', ['test', './internal/brand/...', './internal/contractfile/...', './internal/deliveryreport/...', './internal/productionreport/...'], DESKTOP],
      ['Python brand tests', ...python('-m', 'pytest', '-q', '-p', 'no:cacheprovider', 'src/studio/libs/python/tests/test_brand.py', 'src/studio/libs/python/tests/test_config_audacity.py')],
      ['Lua bridge harness', ...python('src/studio/integrations/reaper/tests/run_lua_tests.py')],
      ['UI tests that read the brand', 'pnpm', ['exec', 'vitest', 'run', ...uiBrandTests(root)], UI],
    ];
  }
  return [
    ...always,
    ['every Go test', 'go', ['test', './...'], DESKTOP],
    ['every shared-library Python test', ...python('-m', 'pytest', '-q', '-p', 'no:cacheprovider', 'src/studio/libs/python/tests')],
    ['Lua bridge harness and mutations', ...python('src/studio/integrations/reaper/tests/run_lua_tests.py', '--mutations')],
    ['every UI test', 'pnpm', ['exec', 'vitest', 'run'], UI],
    ['UI typecheck', 'pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'], UI],
    ['built site', ...node('src/web/build/build-demo-site.mjs')],
    ['the built site never says a retired name', ...node('scripts/ci/old-name.mjs', 'dir', 'dist-site')],
    ['strict docs build', 'uv', ['run', '--locked', '--only-group', 'docs', 'python', '-m', 'mkdocs', 'build', '--strict', '-f', 'tools/docs-site/mkdocs.yml']],
  ];
}

function main(args) {
  const full = args.includes('--full');
  if (!process.env.CI && !args.includes('--in-place')) {
    console.error('The rehearsal renames the checkout it runs in. Run it in a throwaway worktree with --in-place, or in CI.');
    process.exitCode = 2;
    return;
  }
  const result = renameApp(REHEARSAL_NAME);
  console.log(`Renamed "${result.oldName}" to "${result.newName}": ${result.changed.length} files.`);
  const failed = [];
  for (const [label, command, commandArgs, cwd = '.'] of steps(REPOSITORY_ROOT, full)) {
    console.log(`\n::group::${label}`);
    try {
      execFileSync(command, commandArgs, { cwd: join(REPOSITORY_ROOT, cwd), stdio: 'inherit', shell: process.platform === 'win32' });
    } catch {
      failed.push(label);
    }
    console.log('::endgroup::');
  }
  if (failed.length) {
    console.error(`\nAfter a rename to "${REHEARSAL_NAME}", these failed: something spells the name instead of reading it.\n  ${failed.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`\nA rename to "${REHEARSAL_NAME}" needs no second edit.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
