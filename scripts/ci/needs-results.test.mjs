import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { verdict } from './needs-results.mjs';

test('success and skipped pass', () => {
  assert.equal(verdict('success skipped success').ok, true);
});

test('failure, cancelled or an unknown word fails', () => {
  for (const results of ['success failure', 'cancelled success', 'success neutral', 'success  timed_out']) {
    assert.equal(verdict(results).ok, false, results);
  }
});

test('an empty list fails: an aggregate with nothing to judge must not be green', () => {
  assert.equal(verdict('').ok, false);
  assert.equal(verdict('   ').ok, false);
  assert.equal(verdict(undefined).ok, false);
});

test('--expect fails a list of the wrong length', () => {
  assert.equal(verdict('success success', 3).ok, false);
  assert.equal(verdict('success success skipped', 3).ok, true);
});

test('the command line exits 1 with an error annotation on a failed job', () => {
  const run = (results, ...args) => spawnSync('node', ['scripts/ci/needs-results.mjs', ...args], { env: { ...process.env, RESULTS: results }, encoding: 'utf8' });
  const red = run('success failure');
  assert.equal(red.status, 1);
  assert.match(red.stdout, /::error::a job this run needs ended failure/);
  assert.equal(run('success skipped', '--expect', '2').status, 0);
  assert.equal(run('success', '--expect', '2').status, 1);
  assert.equal(run('success', '--expect', 'two').status, 2);
});
