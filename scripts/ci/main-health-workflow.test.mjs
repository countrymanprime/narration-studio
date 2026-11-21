import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// #3845: main-health ticked HOLD only when the called CI workflow reported `failure`. A job that reaches its timeout-minutes is
// cancelled by GitHub and the called workflow then reports `cancelled`, so the likeliest red on `main` (a shard at its time limit,
// run 44839193505) ticked nothing. This holds the condition of the job that ticks HOLD, over every result `needs.ci.result` can take.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = readFileSync(join(root, '.github', 'workflows', 'main-health.yml'), 'utf8');

/** The YAML text of one job of main-health.yml, from its key to the next job's. */
function job(name) {
  const found = new RegExp(`\\n {2}${name}:\\n([\\s\\S]*?)(?=\\n {2}[\\w-]+:\\n|$)`).exec(workflow);
  assert.ok(found, `main-health.yml has no ${name} job`);
  return found[1];
}

/** Whether the job's `if:` lets it run, for a result of `ci` and for this run having been cancelled or not. */
function ticks(result, runCancelled) {
  const condition = /\n {4}if: (.+)\n/.exec(job('hold-on-red'))?.[1];
  assert.ok(condition, 'hold-on-red has no if:');
  // The expression uses only these three terms, ==, !, && and ||, which read the same in JavaScript.
  const script = condition
    .replaceAll('always()', 'true')
    .replaceAll('!cancelled()', String(!runCancelled))
    .replaceAll('cancelled()', String(runCancelled))
    .replaceAll('needs.ci.result', JSON.stringify(result));
  assert.doesNotMatch(script.replaceAll(/'[a-z]*'|"[a-z]*"|true|false/g, ''), /[a-z]/i, `a term this test cannot evaluate in: ${condition}`);
  return Function(`return (${script});`)();
}

test('a failed CI run on main ticks HOLD', () => {
  assert.equal(ticks('failure', false), true);
});

test('a CI run with a job cancelled at its time limit ticks HOLD: the run itself was not cancelled', () => {
  assert.equal(ticks('cancelled', false), true);
});

test('a run someone cancelled judged nothing and ticks nothing', () => {
  assert.equal(ticks('cancelled', true), false);
  assert.equal(ticks('failure', true), true, 'a failure already reported still counts when the run is cancelled afterwards');
});

test('a green run, and a scheduled run skipped because main has not moved, tick nothing', () => {
  assert.equal(ticks('success', false), false);
  assert.equal(ticks('skipped', false), false);
});

test('the condition starts with always(), without which the job is skipped exactly when ci did not succeed', () => {
  assert.match(job('hold-on-red'), /\n {4}if: always\(\) && /);
});

test('the HOLD reason says whether a test failed or a job was cancelled', () => {
  const hold = job('hold-on-red');
  assert.match(hold, /train-health\.mjs hold "the full CI run on main \$OUTCOME \(\$RUN_URL\)"/);
  assert.match(hold, /OUTCOME: \$\{\{ needs\.ci\.result == 'cancelled' && '[^']+' \|\| 'failed' \}\}/);
});

test('the concurrency group still never cancels a run in progress, which is what makes a cancelled ci a timeout', () => {
  assert.match(workflow, /\nconcurrency:\n {2}group: main-health\n {2}cancel-in-progress: false\n/);
});
