import assert from 'node:assert/strict';
import test from 'node:test';

import { changedFiles, modeFor, under } from './pr-scope.mjs';

test('the mode follows the CI event', () => {
  assert.equal(modeFor({}), 'strict');
  assert.equal(modeFor({ GITHUB_EVENT_NAME: 'pull_request' }), 'scoped');
  assert.equal(modeFor({ GITHUB_EVENT_NAME: 'schedule' }), 'report');
});

test('changed files come from git diff against the base only on a pull request', () => {
  assert.equal(changedFiles({ GITHUB_EVENT_NAME: 'push' }), null);
  let args;
  const git = (a) => ((args = a), { status: 0, stdout: 'a/b.py\n\nc.go\n' });
  assert.deepEqual(changedFiles({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' }, git), ['a/b.py', 'c.go']);
  assert.deepEqual(args, ['diff', '--name-only', 'origin/main...HEAD']);
  assert.throws(() => changedFiles({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' }, () => ({ status: 1, stderr: 'x' })));
});

test('under matches a directory boundary, not a prefix', () => {
  assert.ok(under('lib/a.py', 'lib'));
  assert.ok(!under('library/a.py', 'lib'));
  assert.ok(under('x', '.'));
});
