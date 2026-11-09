import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { countByDirectory, evaluate } from './pyright-ratchet.mjs';

const error = (file, severity = 'error') => ({ file: `/repo/${file}`, severity });

test('an error is counted against the longest directory that holds its file, and warnings are not counted', () => {
  const counts = countByDirectory(
    [error('lib/a.py'), error('lib/sub/b.py'), error('lib/sub/c.py'), error('lib/a.py', 'warning')],
    ['lib', 'lib/sub'],
    '/repo',
  );
  assert.deepEqual(counts, { lib: 1, 'lib/sub': 2 });
});

test('a file in no ratcheted directory is an error, not a silent zero', () => {
  assert.throws(() => countByDirectory([error('other/x.py')], ['lib'], '/repo'), /other\/x\.py/);
});

test('a directory over its limit fails and names both numbers', () => {
  const { problems } = evaluate({ lib: 4 }, { lib: 3 });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /4 errors, over the limit of 3/);
});

test('a directory under its limit fails until the lower number is written down, and the lowered limits are offered', () => {
  const { problems, lowered } = evaluate({ lib: 1, clean: 0 }, { lib: 3, clean: 0 });
  assert.match(problems[0], /1 errors, under the limit of 3/);
  assert.deepEqual(lowered, { lib: 1, clean: 0 });
});

test('a checked directory without a limit, and a limit without a checked directory, both fail', () => {
  assert.match(evaluate({ a: 2 }, {}).problems[0], /missing from/);
  assert.match(evaluate({}, { gone: 0 }).problems[0], /not checked by pyrightconfig\.json/);
});

test('a directory at its limit passes', () => {
  assert.deepEqual(evaluate({ lib: 3 }, { lib: 3 }).problems, []);
});

test('the committed config and limits list the same directories', () => {
  const config = JSON.parse(readFileSync(new URL('../../pyrightconfig.json', import.meta.url), 'utf8'));
  const limits = JSON.parse(readFileSync(new URL('./pyright-ratchet.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(limits).sort(), [...config.include].sort());
});

test('on a pull request a directory off its limit fails only when the change touches it (#3149)', () => {
  const scoped = { mode: 'scoped', files: ['lib/a.py'] };
  const over = evaluate({ lib: 4, other: 5 }, { lib: 3, other: 3 }, scoped);
  assert.equal(over.problems.length, 1);
  assert.match(over.problems[0], /^lib: 4 errors, over/);
  assert.match(over.warnings[0], /^other: 5 errors, over/);
  const under = evaluate({ lib: 1, other: 1 }, { lib: 3, other: 3 }, scoped);
  assert.match(under.problems[0], /^lib: 1 errors, under/);
  assert.equal(under.warnings.length, 1);
});

test('outside a pull request every miss is a warning, and a new directory still fails (#3149)', () => {
  const report = evaluate({ lib: 4, fresh: 0 }, { lib: 3 }, { mode: 'report' });
  assert.deepEqual(report.warnings.length, 1);
  assert.match(report.problems[0], /^fresh: checked by pyright but missing/);
});
