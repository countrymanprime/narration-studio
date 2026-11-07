import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { jobBlock } from './check-manifest.mjs';

// The shard count of Test (Linux) is written in several places that must agree: the lint job's `test-shards` list (the matrix), the job's
// `/N` label, the `/N` of its Vitest, visual and atlas steps, and the `vitest-shards` and `visual-shards` ci.yml's gate job gives
// .github/actions/ci-gate (which merges that many blobs and checks that many manifests). A mismatch would leave a shard unrun, a blob
// missing or the whole-run check failing, so this reads them all.
const WORKFLOWS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.github', 'workflows');
const quality = readFileSync(join(WORKFLOWS, '_quality.yml'), 'utf8');
const ci = readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf8');

const testJob = jobBlock(quality, 'test-linux') ?? '';
const lintJob = jobBlock(quality, 'lint') ?? '';

test('the test-linux job exists and takes its matrix from lint', () => {
  assert.ok(testJob.length > 100);
  assert.match(testJob, /shard: \$\{\{ fromJSON\(needs\.lint\.outputs\.test-shards\) \}\}/);
});

test('test-shards, the job name, the Vitest, visual and atlas splits and ci.yml agree on the number of shards', () => {
  const list = /test-shards: .*'\[([\d,]+)\]' \|\| '\[1\]'/.exec(lintJob);
  assert.ok(list, 'lint has no test-shards list');
  const shards = list[1].split(',').map(Number);
  const n = shards.length;
  assert.deepEqual(shards, Array.from({ length: n }, (_, i) => i + 1), 'the list must be 1..n');
  assert.match(testJob, new RegExp(`name: Test \\(Linux \\$\\{\\{ matrix\\.shard \\}\\}/${n}\\)`));
  assert.match(testJob, new RegExp(`coverage-gate\\.mjs vitest src/studio/ui --shard="\\$SHARD/${n}"`));
  assert.match(testJob, new RegExp(`visual-shards\\.mjs split --shard "\\$SHARD/${n}"`));
  assert.match(testJob, new RegExp(`run atlas --shard="\\$SHARD/${n}"`));
  assert.ok(
    ci.includes(`visual-shards: ${'$'}{{ github.event.pull_request.draft != true && needs.quality.outputs.ui-affected == 'true' && '${n}' || '0' }}`),
    `ci.yml must pass visual-shards '${n}' to ci-gate in the full tier`,
  );
  const vitest = ci.match(/vitest-shards: \$\{\{ needs\.quality\.outputs\.vitest-affected == 'true' && '(\d+)' \|\| '0' \}\}/g) ?? [];
  assert.equal(vitest.length, 1, 'the gate job passes vitest-shards once');
  assert.ok(vitest[0].includes(`'${n}'`), `${vitest[0]} must merge ${n} blobs`);
});

test('the suite is split into at least four shards', () => {
  const n = /test-shards: .*'\[([\d,]+)\]' \|\| '\[1\]'/.exec(lintJob)[1].split(',').length;
  // Three shards ran 22.8 min of visual tests each (run 42182391318) against a 30 minute limit that a slow setup-playwright (9 min) broke.
  assert.ok(n >= 4, `Test (Linux) has ${n} shards; fewer than 4 leaves each over 22 minutes of tests under a 30 minute limit (#3054)`);
});
