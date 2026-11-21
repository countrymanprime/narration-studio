import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// #3931: the slow-clock run is a margin check that runs nightly. It must never run on a pull request (it would double the visual cost of each
// one), must open its issue only for `main`, and must hold nothing: a spec whose wait is too short is not a red `main`.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = readFileSync(join(root, '.github', 'workflows', 'slow-clock.yml'), 'utf8');
const triggers = '\n' + (/\non:\n([\s\S]*?)\npermissions:/.exec(workflow)?.[1] ?? '');

test('it runs on a schedule and by hand, and on no pull request or push', () => {
  assert.match(triggers, /\n {2}schedule:/);
  assert.match(triggers, /\n {2}workflow_dispatch:/);
  assert.doesNotMatch(triggers, /pull_request|push|workflow_call/);
});

test('it builds the mock app on a slowed page clock and runs only the Booth specs', () => {
  assert.match(workflow, /UI_SLOW_CLOCK: '0\.7'/);
  assert.match(workflow, /playwright test tests\/visual\/booth-\n/);
});

test('it opens and closes its own issue through train-health.mjs and never ticks HOLD', () => {
  assert.match(workflow, /train-health\.mjs red slow-clock/);
  assert.match(workflow, /train-health\.mjs green slow-clock/);
  assert.doesNotMatch(workflow, /train-health\.mjs hold/);
});

test('the issue jobs act only for main, and a job cancelled at its limit counts as red', () => {
  const red = /\n {2}red:\n([\s\S]*?)\n {2}green:/.exec(workflow)?.[1] ?? '';
  assert.match(red, /if: always\(\) && \(needs\.booth\.result == 'failure' \|\| \(needs\.booth\.result == 'cancelled' && !cancelled\(\)\)\) && github\.ref == 'refs\/heads\/main'/);
  const green = /\n {2}green:\n([\s\S]*)$/.exec(workflow)?.[1] ?? '';
  assert.match(green, /if: needs\.booth\.result == 'success' && github\.ref == 'refs\/heads\/main'/);
});
