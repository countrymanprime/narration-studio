import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

// nx 23 matches `nx show projects --projects=<glob>` with `minimatch.makeRe`, which minimatch 11 removed. A pnpm override that raised
// minimatch to 11 (to clear an advisory, #1133) made every pull request's `quality / scope` job fail with
// "minimatch_1.minimatch.makeRe is not a function". This resolves minimatch the way nx does and fails before CI does.
test('the minimatch that nx resolves still has makeRe, so project globs keep working', () => {
  const fromNx = createRequire(createRequire(import.meta.url).resolve('nx/package.json'));
  const { minimatch } = fromNx('minimatch');
  assert.equal(typeof minimatch.makeRe, 'function', 'nx needs minimatch.makeRe; do not override minimatch to a version without it');
  assert.ok(minimatch.makeRe('u*').test('ui'));
});
