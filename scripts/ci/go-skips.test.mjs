import assert from 'node:assert/strict';
import { test } from 'node:test';

import { markdown, skippedTests } from './go-skips.mjs';

const event = (fields) => JSON.stringify({ Time: '2026-11-16T00:00:00Z', Package: 'desktop/internal/findings', ...fields });

const sample = [
  event({ Action: 'run', Test: 'TestDenied' }),
  event({ Action: 'output', Test: 'TestDenied', Output: '=== RUN   TestDenied\n' }),
  event({ Action: 'output', Test: 'TestDenied', Output: '    store_test.go:66: icacls deny is not enforced for this (elevated) process\n' }),
  event({ Action: 'output', Test: 'TestDenied', Output: '--- SKIP: TestDenied (0.00s)\n' }),
  event({ Action: 'skip', Test: 'TestDenied', Elapsed: 0 }),
  event({ Action: 'run', Test: 'TestFine' }),
  event({ Action: 'pass', Test: 'TestFine', Elapsed: 0 }),
  event({ Action: 'skip', Package: 'desktop/internal/assetmove', Test: 'TestLink', Elapsed: 0 }),
  'not json at all',
  event({ Action: 'pass', Package: 'desktop/internal/findings', Elapsed: 0.1 }),
].join('\n');

test('a skipped test is listed with the package it ran in and the reason it gave', () => {
  const skips = skippedTests(sample);
  assert.deepEqual(skips[0], { package: 'desktop/internal/findings', test: 'TestDenied', reason: 'icacls deny is not enforced for this (elevated) process' });
});

test('a skip with no message says so, and a passing test or a package event is never a skip', () => {
  const skips = skippedTests(sample);
  assert.deepEqual(
    skips.map((skip) => skip.test),
    ['TestDenied', 'TestLink'],
  );
  assert.equal(skips[1].reason, '(no reason given)');
});

test('two packages that run a test of the same name keep their outputs apart', () => {
  const text = [
    event({ Action: 'output', Package: 'p/a', Test: 'TestSame', Output: '    a_test.go:1: reason A\n' }),
    event({ Action: 'output', Package: 'p/b', Test: 'TestSame', Output: '    b_test.go:2: reason B\n' }),
    event({ Action: 'skip', Package: 'p/b', Test: 'TestSame' }),
  ].join('\n');
  assert.equal(skippedTests(text)[0].reason, 'reason B');
});

test('the table escapes a pipe in a reason and names how many skipped; nothing skipped says so', () => {
  const table = markdown([{ package: 'desktop/internal/x', test: 'TestA', reason: 'a | b' }]);
  assert.match(table, /1 skipped\./);
  assert.match(table, /\| internal\/x \| TestA \| a \\\| b \|/);
  assert.match(markdown([]), /No test skipped\./);
});
