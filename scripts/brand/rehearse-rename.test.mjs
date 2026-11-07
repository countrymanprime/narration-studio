import assert from 'node:assert/strict';
import test from 'node:test';

import { REPOSITORY_ROOT } from './brand.mjs';
import { steps } from './rehearse-rename.mjs';

const labels = (full) => steps(REPOSITORY_ROOT, full).map(([label]) => label);

test('the pull-request run checks the guards and the tests that read the brand', () => {
  const run = labels(false);
  for (const label of [
    'brand sync is clean',
    'the current name is only in the brand file and its outputs',
    'the retired names, the outgoing one among them, are gone',
    'Go vet (every package and test builds)',
    'Go tests that read the brand',
    'UI tests that read the brand',
  ]) {
    assert.ok(run.includes(label), label);
  }
});

test('--full is the pull-request run plus the UI typecheck and the built site with its retired-name check', () => {
  const pr = labels(false);
  const full = labels(true);
  assert.deepEqual(full.slice(0, pr.length), pr, '--full keeps every pull-request check, in order');
  assert.deepEqual(full.slice(pr.length), ['UI typecheck', 'built site', 'the built site never says a retired name']);
});

test('--full re-runs no whole test suite (#3078): the suites have their own jobs, and the name guard covers every tracked file', () => {
  for (const [label, command, args] of steps(REPOSITORY_ROOT, true)) {
    assert.doesNotMatch(label, /^every /, label);
    assert.ok(!(command === 'go' && args[0] === 'test' && args.includes('./...')), `${label}: go test ./...`);
    assert.ok(!(command === 'pnpm' && args.join(' ') === 'exec vitest run'), `${label}: the whole Vitest run`);
    assert.ok(!args.includes('--mutations'), `${label}: the Lua mutation checks`);
  }
});

test('the UI brand tests are found, so the UI step is never an empty Vitest run of everything', () => {
  const ui = steps(REPOSITORY_ROOT, false).find(([label]) => label === 'UI tests that read the brand');
  const files = ui[2].slice(3);
  assert.ok(files.length > 0, 'no UI test imports the generated brand module');
  for (const file of files) assert.match(file, /^src\/.*\.test\.tsx?$/);
});
