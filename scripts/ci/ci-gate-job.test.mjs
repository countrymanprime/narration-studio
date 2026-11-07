import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { jobBlock } from './check-manifest.mjs';

// ci.yml has one gate job for both tiers (#3065). Its check name is what a ruleset and the merge conditions require, so a draft must
// never report `CI passed`: a draft runs no visual suite, atlas or Windows build, and a green `CI passed` there would mean less than
// the full gate.
const ci = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');
const gate = jobBlock(ci, 'ci-passed') ?? '';

test('ci.yml has exactly one gate job, and it needs quality and always runs', () => {
  assert.ok(gate.length > 100, 'no ci-passed job');
  assert.equal((ci.match(/uses: \.\/\.github\/actions\/ci-gate/g) ?? []).length, 1, 'one job runs ci-gate');
  assert.match(gate, /needs: \[quality\]/);
  assert.match(gate, /\n {4}if: always\(\)\n/);
});

test('the gate reports `CI light passed` on a draft and `CI passed` otherwise', () => {
  const name = /\n {4}name: \$\{\{ github\.event\.pull_request\.draft == true && 'CI light passed' \|\| 'CI passed' \}\}\n/.exec(gate);
  assert.ok(name, 'the gate job name must follow the tier');
});

test('the gate judges the visual records in the full tier only', () => {
  assert.match(gate, /visual-shards: \$\{\{ github\.event\.pull_request\.draft != true && needs\.quality\.outputs\.ui-affected == 'true' && '\d+' \|\| '0' \}\}/);
});

test('no other line of ci.yml names a check `CI passed` or `CI light passed`', () => {
  // Comments aside, the tier expression of the gate's name is the only place either check name may appear: a second job or step
  // named `CI passed` would be a second gate a draft could turn green.
  const code = ci
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
  assert.equal((code.match(/CI light passed/g) ?? []).length, 1, '`CI light passed` appears outside the gate name');
  assert.equal((code.match(/CI passed/g) ?? []).length, 1, '`CI passed` appears outside the gate name');
});
