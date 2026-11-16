import assert from 'node:assert/strict';
import { test } from 'node:test';

import { markdown, parse, skippedTests } from './go-skips.mjs';

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

const outputOf = (test, ...lines) => [...lines.map((line) => event({ Action: 'output', Test: test, Output: line })), event({ Action: 'skip', Test: test })];

test('the reason is the last file_test.go line before the skip, not a log line the test wrote earlier', () => {
  const text = outputOf(
    'TestLogs',
    '=== RUN   TestLogs\n',
    '    a_test.go:5: setup done\n',
    '    a_test.go:9: the real reason\n',
    '--- SKIP: TestLogs (0.00s)\n',
  ).join('\n');
  assert.equal(skippedTests(text)[0].reason, 'the real reason');
});

test('a reason that spans lines is joined, so a command output is not cut to its first line', () => {
  const text = outputOf(
    'TestMulti',
    '    a_test.go:9: icacls deny unavailable: exit status 5: \n',
    '        Access is denied.\n',
    '        Successfully processed 0 files\n',
    '--- SKIP: TestMulti (0.00s)\n',
  ).join('\n');
  assert.equal(skippedTests(text)[0].reason, 'icacls deny unavailable: exit status 5: Access is denied. Successfully processed 0 files');
});

test('an empty t.Skip() reads "(no reason given)"', () => {
  const text = outputOf('TestEmpty', '    a_test.go:9: \n', '--- SKIP: TestEmpty (0.00s)\n').join('\n');
  assert.equal(skippedTests(text)[0].reason, '(no reason given)');
});

test('a package that did not build is reported, and empty input is not "No test skipped"', () => {
  const build = [
    event({ Action: 'build-output', ImportPath: 'desktop/internal/x [desktop/internal/x.test]', Output: 'x_test.go:1: undefined\n' }),
    event({ Action: 'build-fail', ImportPath: 'desktop/internal/x [desktop/internal/x.test]' }),
    event({ Action: 'fail', Package: 'desktop/internal/x' }),
  ].join('\n');
  const parsed = parse(build);
  assert.deepEqual(parsed.notBuilt, ['desktop/internal/x']);
  assert.match(markdown(parsed), /desktop\/internal\/x did not build: none of its tests ran/);
  assert.doesNotMatch(markdown(parse('')), /No test skipped/);
  assert.match(markdown(parse('')), /No `go test -json` output was read/);
});

test('a pipe in a test name is escaped too', () => {
  assert.match(markdown([{ package: 'desktop/internal/x', test: 'TestA/x|y', reason: 'r' }]), /TestA\/x\\\|y/);
});
