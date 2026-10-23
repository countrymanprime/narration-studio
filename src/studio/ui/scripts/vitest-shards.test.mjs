/* global URL */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assignShard, loadWeights, weightsFromProfile } from './vitest-shards.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

// The test files under src and tests, as vite.config.ts's include/exclude would pick them (close enough to judge the balance).
function testFiles(dir = '') {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return ['node_modules', 'visual', 'aria', 'atlas'].includes(entry.name) && dir !== 'src' ? [] : testFiles(path);
    return /\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name) && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

const files = [...testFiles('src'), ...testFiles('tests')].sort();

test('every file is in exactly one shard, whatever the shard count', () => {
  assert.ok(files.length > 100, 'found the test files');
  for (const count of [1, 2, 3, 4, 7]) {
    const shards = Array.from({ length: count }, (_, i) => assignShard(files, i + 1, count));
    assert.deepEqual(shards.flat().sort(), files, `${count} shards cover the files once`);
  }
});

test('files with no weight are still assigned, and a stale weight changes nothing but the balance', () => {
  const names = ['a.test.ts', 'b.test.ts', 'c.test.ts', 'd.test.ts', 'e.test.ts'];
  const weights = { default: 1, files: { 'gone.test.ts': 500, 'a.test.ts': 10 } };
  const shards = [1, 2, 3].map((i) => assignShard(names, i, 3, weights));
  assert.deepEqual(shards.flat().sort(), names);
  assert.deepEqual(shards[0], ['a.test.ts'], 'the heavy file has a shard to itself');
});

test('the same input gives the same shards on every runner', () => {
  assert.deepEqual(assignShard([...files].reverse(), 2, 3), assignShard(files, 2, 3).reverse());
});

test('a shard keeps the order the caller gave', () => {
  const names = ['z.test.ts', 'b.test.ts', 'm.test.ts', 'a.test.ts'];
  assert.deepEqual(assignShard(names, 1, 1), names);
});

test('three shards carry the checked-in weights within 15% of an even third', () => {
  const weights = loadWeights();
  const weight = (file) => weights.files[file] ?? weights.default;
  const loads = [1, 2, 3].map((i) => assignShard(files, i, 3).reduce((sum, file) => sum + weight(file), 0));
  const mean = loads.reduce((a, b) => a + b, 0) / 3;
  for (const load of loads) assert.ok(Math.abs(load - mean) / mean < 0.15, `loads ${loads.map(Math.round)} are not within 15% of ${Math.round(mean)}`);
});

test('a shard that is not one is refused', () => {
  for (const [index, count] of [
    [0, 3],
    [4, 3],
    [1, 0],
    [1.5, 3],
  ])
    assert.throws(() => assignShard(files, index, count), /not a shard/);
});

test('weights from a profile list the costliest files and average the rest', () => {
  const at = (name, seconds) => ({ name: `${root}${name}`, startTime: 0, endTime: seconds * 1000 });
  const profile = {
    testResults: [at('src/slow.test.ts', 100), at('src/fast.test.ts', 2), ...Array.from({ length: 40 }, (_, i) => at(`src/f${i}.test.ts`, 1))],
  };
  const weights = weightsFromProfile(profile, root);
  assert.equal(weights.files['src/slow.test.ts'], 100);
  assert.equal(Object.keys(weights.files).length, 30);
  assert.equal(weights.default, 1);
});
