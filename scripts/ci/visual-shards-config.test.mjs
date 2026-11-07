import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { jobBlock } from './check-manifest.mjs';

// The shard count of the visual suite is written in three places that must agree: the job's matrix and its `/N` labels in
// _quality.yml, and the `visual-shards` ci.yml's `CI passed` gives .github/actions/ci-gate (which checks the manifests against it). A mismatch would leave a shard
// unrun or fail the whole-run check, so this reads them all.
const WORKFLOWS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.github', 'workflows');
const quality = readFileSync(join(WORKFLOWS, '_quality.yml'), 'utf8');
const ci = readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf8');

const jobText = jobBlock(quality, 'ui-visual-shard') ?? '';

test('the ui-visual-shard job exists', () => {
  assert.ok(jobText.length > 100);
});

test('the matrix, the job name, the split and ci.yml agree on the number of visual shards', () => {
  const matrix = /shard: \[([\d, ]+)\]/.exec(jobText);
  assert.ok(matrix, 'no shard matrix');
  const shards = matrix[1].split(',').map(Number);
  const n = shards.length;
  assert.deepEqual(shards, Array.from({ length: n }, (_, i) => i + 1), 'the matrix must be 1..n');
  assert.match(jobText, new RegExp(`name: ui-visual \\(shard \\$\\{\\{ matrix\\.shard \\}\\}/${n}\\)`));
  assert.match(jobText, new RegExp(`--shard "\\$SHARD/${n}"`));
  assert.ok(ci.includes(`visual-shards: ${'$'}{{ needs.quality.outputs.ui-affected == 'true' && '${n}' || '0' }}`), `ci.yml must pass visual-shards '${n}' to ci-gate`);
});

test('the suite is split into at least four shards', () => {
  const n = /shard: \[([\d, ]+)\]/.exec(jobText)[1].split(',').length;
  // Three shards ran 22.8 min of tests each (run 42182391318) against a 30 minute limit that a slow setup-playwright (9 min) broke.
  assert.ok(n >= 4, `ui-visual has ${n} shards; fewer than 4 leaves each over 22 minutes of tests under a 30 minute limit (#3054)`);
});
