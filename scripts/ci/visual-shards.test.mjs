import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPartition, assign, describeTest, groupKey, loaderLines, planTests, testsOfReport, weightsOf } from './visual-shards.mjs';

const spec = (file, title, duration) => ({ file, title, tests: [{ results: duration === undefined ? [] : [{ duration }] }] });
const report = (...suites) => ({ suites });

test('testsOfReport walks describe blocks and sums a test’s result times', () => {
  const found = testsOfReport(
    report({
      title: 'a.spec.ts',
      file: 'a.spec.ts',
      specs: [spec('a.spec.ts', 'Page / state', 2000)],
      suites: [{ title: 'group', specs: [spec('a.spec.ts', 'inner', 500)] }],
    }),
  );
  assert.deepEqual(found, [
    { file: 'a.spec.ts', loadFile: 'a.spec.ts', titlePath: ['Page / state'], seconds: 2 },
    { file: 'a.spec.ts', loadFile: 'a.spec.ts', titlePath: ['group', 'inner'], seconds: 0.5 },
  ]);
});

test('describeTest refuses a title a test list cannot carry', () => {
  for (const title of ['a > b', 'a › b', ' padded', '[project] x']) {
    assert.throws(() => describeTest({ file: 'a.spec.ts', titlePath: [title], seconds: 0 }), /cannot be written in a --test-list/);
  }
  assert.equal(describeTest({ file: 'a.spec.ts', titlePath: ['g', 'x / y'], seconds: 0 }).line, 'a.spec.ts › g › x / y');
});

test('groupKey keeps the file and the first two parts of the title', () => {
  assert.equal(groupKey('overlays.ts', ['Script / context menu on the page / desktop']), 'overlays.ts|Script / context menu on the page');
  assert.equal(groupKey('app.spec.ts', ['engine / link-chapters-error / tablet']), 'app.spec.ts|engine / link-chapters-error');
  assert.equal(groupKey('app.spec.ts', ['project / picker-empty']), 'app.spec.ts|project / picker-empty');
});

test('planTests estimates from the group, then the file, then the fallback, and merges a repeated title', () => {
  const tests = [
    { file: 'a.spec.ts', titlePath: ['P / s / desktop'], seconds: 0 },
    { file: 'a.spec.ts', titlePath: ['Q / t / desktop'], seconds: 0 },
    { file: 'b.spec.ts', titlePath: ['R / u'], seconds: 0 },
    { file: 'b.spec.ts', titlePath: ['R / u'], seconds: 0 },
  ];
  const plan = planTests(tests, { fallback: 7, files: { 'a.spec.ts': 3 }, groups: { 'a.spec.ts|P / s': 5 } });
  assert.deepEqual(
    plan.map((item) => [item.line, item.estimate]),
    [
      ['a.spec.ts › P / s / desktop', 5],
      ['a.spec.ts › Q / t / desktop', 3],
      ['b.spec.ts › R / u', 14],
    ],
  );
});

test('loaderLines names the spec file of a test declared in a helper, and refuses an ambiguous file', () => {
  const declared = [
    { file: 'helpers/guard.ts', loadFile: 'overlays.spec.ts', line: 'x' },
    { file: 'a.spec.ts', loadFile: 'a.spec.ts', line: 'y' },
  ];
  assert.deepEqual(loaderLines(declared), ['overlays.spec.ts']);
  assert.throws(() => loaderLines([...declared, { file: 'overlays.spec.ts', loadFile: 'overlays.spec.ts', line: 'z' }]), /cannot tell them apart/);
});

const items = (estimates) => estimates.map((estimate, index) => ({ line: `t${String(index).padStart(3, '0')}`, estimate }));

test('assign puts every test in exactly one shard and the aria suite in exactly one', () => {
  const all = items([30, 28, 25, 20, 20, 18, 12, 10, 9, 9, 8, 5, 4, 3, 3, 2, 1]);
  const loads = assign(all, 3, 49);
  assertPartition(all, loads);
  assert.equal(loads.filter((load) => load.aria).length, 1);
});

test('assign is deterministic and balances closer than cutting by count', () => {
  const estimates = [...Array.from({ length: 6 }, () => 40), ...Array.from({ length: 60 }, () => 4)];
  const all = items(estimates);
  const a = assign(all, 3, 0).map((load) => load.tests.map((t) => t.line));
  const b = assign([...all].reverse(), 3, 0).map((load) => load.tests.map((t) => t.line));
  assert.deepEqual(a, b);
  const seconds = assign(all, 3, 0).map((load) => load.seconds);
  assert.ok(Math.max(...seconds) - Math.min(...seconds) <= 4, `shards differ by ${Math.max(...seconds) - Math.min(...seconds)} s`);
  // Cut by count (what --shard does) the same list in order: the six heavy tests, listed first, share two shards.
  const byCount = [0, 1, 2].map((shard) => estimates.slice(shard * 22, shard * 22 + 22).reduce((sum, value) => sum + value, 0));
  assert.ok(Math.max(...byCount) - Math.min(...byCount) > 100);
});

test('the shard that runs aria gets fewer tests', () => {
  const loads = assign(items(Array.from({ length: 90 }, () => 10)), 3, 49);
  const aria = loads.find((load) => load.aria);
  assert.ok(aria.tests.length < 30);
  assert.ok(Math.max(...loads.map((load) => load.seconds)) - Math.min(...loads.map((load) => load.seconds)) <= 10);
});

test('assertPartition fails on a missing and on a duplicated test', () => {
  const all = items([5, 4, 3]);
  const loads = assign(all, 2, 0);
  const missing = structuredClone(loads);
  missing[0].tests.pop();
  missing[1].tests.pop();
  assert.throws(() => assertPartition(all, missing), /exactly once/);
  const twice = structuredClone(loads);
  twice[1].tests.push(loads[0].tests[0]);
  assert.throws(() => assertPartition(all, twice), /exactly once/);
});

test('weightsOf averages per group and per file, ignoring tests with no time', () => {
  const run = report({
    title: 'a.spec.ts',
    specs: [
      spec('a.spec.ts', 'P / s / desktop', 4000),
      spec('a.spec.ts', 'P / s / tablet', 2000),
      spec('a.spec.ts', 'Q / t / desktop', 9000),
      spec('a.spec.ts', 'skipped one'),
    ],
  });
  const weights = weightsOf([run]);
  assert.equal(weights.groups['a.spec.ts|P / s'], 3);
  assert.equal(weights.groups['a.spec.ts|Q / t'], 9);
  assert.equal(weights.files['a.spec.ts'], 5);
  assert.equal(weights.fallback, 5);
});
