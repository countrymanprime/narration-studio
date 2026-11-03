import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The parity checker and the ruling-index checker run over the live docs, so `repo-scripts:test-node` (and `pnpm check`)
// fail when a parity note names a test that is gone or an agreed ruling loses its test. SNC-6 deletes the folders they read,
// and this file with them.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(script) {
  try {
    return { status: 0, out: execFileSync('node', [join(ROOT, 'scripts/ci', script)], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (error) {
    return { status: error.status, out: `${error.stdout}${error.stderr}` };
  }
}

test('docs-checkers-run-in-the-gate: every parity note maps its mock cases to a real test or an excuse', () => {
  const { status, out } = run('studio-next-parity.mjs');
  assert.equal(status, 0, out);
  assert.match(out, /^\d+ docs, \d+ cases mapped, \d+ excused$/m);
});

test('docs-checkers-run-in-the-gate: every ruling has a row, every agreed row names a test or says n/a and why', () => {
  const { status, out } = run('studio-next-rulings.mjs');
  assert.equal(status, 0, out);
  assert.match(out, /0 agreed rows without a test name \(enforced: true\); 0 deferred or rejected rows need a pointer/);
});
