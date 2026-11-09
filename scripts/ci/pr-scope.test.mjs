import assert from 'node:assert/strict';
import test from 'node:test';

import { changedFiles, modeFor, under } from './pr-scope.mjs';

test('the mode follows the CI event', () => {
  assert.equal(modeFor({}), 'strict');
  assert.equal(modeFor({ GITHUB_EVENT_NAME: 'pull_request' }), 'scoped');
  assert.equal(modeFor({ GITHUB_EVENT_NAME: 'schedule' }), 'strict');
  assert.equal(modeFor({ GITHUB_EVENT_NAME: 'push' }), 'strict');
});

test('changed files come from git diff against the base only on a pull request', () => {
  assert.equal(changedFiles({ GITHUB_EVENT_NAME: 'push' }), null);
  let args;
  const git = (a) => ((args = a), { status: 0, stdout: 'a/b.py\n\nc.go\n' });
  assert.deepEqual(changedFiles({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' }, git), ['a/b.py', 'c.go']);
  assert.deepEqual(args, ['diff', '--name-only', 'origin/main...HEAD']);
  const pr = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' };
  const calls = [];
  const shallow = (a) => (calls.push(a[0]), a[0] === 'diff' && calls.length === 1 ? { status: 128, stderr: 'unknown revision' } : { status: 0, stdout: 'x.py\n' });
  assert.deepEqual(changedFiles(pr, shallow), ['x.py'], 'a shallow checkout fetches the base and diffs again');
  assert.deepEqual(calls, ['diff', 'fetch', 'diff']);
  assert.equal(changedFiles(pr, () => ({ status: 128, stderr: 'fatal' })), null, 'an unreachable base gates everything, it does not fail the run');
});

test('under matches a directory boundary, not a prefix', () => {
  assert.ok(under('lib/a.py', 'lib'));
  assert.ok(!under('library/a.py', 'lib'));
  assert.ok(under('x', '.'));
});
