import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { summarize } from './step-summary.mjs';

test('every check is reported, and the summary passes when each passed or was skipped', () => {
  const { ok, markdown } = summarize({ python: 'success', 'reaper (Lua)': 'skipped' });
  assert.equal(ok, true);
  assert.match(markdown, /\| python \| passed \|/);
  assert.match(markdown, /\| reaper \(Lua\) \| skipped/);
});

test('a failed or cancelled check fails the summary and every one is named', () => {
  const { ok, failed } = summarize({ python: 'failure', docs: 'success', knip: 'cancelled' });
  assert.equal(ok, false);
  assert.deepEqual(failed, ['python', 'knip']);
});

test('an empty outcome (a step id that does not exist) fails', () => {
  const { ok, markdown } = summarize({ python: '' });
  assert.equal(ok, false);
  assert.match(markdown, /unknown outcome ''/);
});

test('no checks at all fails', () => {
  assert.equal(summarize({}).ok, false);
  assert.equal(summarize(undefined).ok, false);
});

test('the command line writes the job summary and exits 1 on a failed check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'step-summary-'));
  const summary = join(dir, 'summary.md');
  const run = (outcomes) => spawnSync('node', ['scripts/ci/step-summary.mjs'], { env: { ...process.env, OUTCOMES: outcomes, GITHUB_STEP_SUMMARY: summary }, encoding: 'utf8' });
  const red = run('{"python":"failure","docs":"success"}');
  assert.equal(red.status, 1);
  assert.match(red.stdout, /::error::1 check\(s\) did not pass: python/);
  assert.match(readFileSync(summary, 'utf8'), /\| python \| FAILED \|/);
  assert.equal(run('{"docs":"success"}').status, 0);
  assert.equal(run('not json').status, 1);
});
