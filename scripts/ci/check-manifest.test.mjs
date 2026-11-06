import assert from 'node:assert/strict';
import test from 'node:test';

import { jobBlock, loadManifest, needsOf, problems, readWorkflow, stepBlocks } from './check-manifest.mjs';

// Every check the pull-request CI ran on 2026-11-06 (#3065). An id leaves this list only with the owner's agreement that the check
// itself is retired; moving a check to another job, or off the pull request with a safety net, keeps its id.
const BASELINE = [
  'js-static/ui',
  'js-static/web',
  'js-static/knip',
  'js-test/vitest-shard',
  'js-test/coverage-merge',
  'ui-visual/screenshots',
  'ui-visual/aria',
  'ui-visual/whole-run',
  'ui-atlas/atlas',
  'ui-atlas/atlas-docs',
  'quick-ubuntu/repo-scripts',
  'quick-ubuntu/docs-site',
  'quick-ubuntu/python',
  'quick-ubuntu/reaper-linux',
  'rename-rehearsal',
  'quick-windows/reaper-windows',
  'quick-windows/go-lint',
  'go-test/root',
  'go-test/rest',
  'go-test/schedules',
  'ui-dist/build',
  'build-windows',
  'ci-passed',
  'ci-light-passed',
  'govulncheck',
];

const checks = loadManifest();

test('every baseline check has exactly one entry', () => {
  const ids = checks.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  assert.deepEqual(BASELINE.filter((id) => !ids.includes(id)), [], 'baseline checks missing from check-manifest.json');
});

for (const entry of checks) {
  test(`${entry.id} runs where the manifest says (${entry.workflow}#${entry.job})`, () => {
    assert.deepEqual(problems(entry, readWorkflow), []);
  });
}

const WORKFLOW = `name: X
on:
  pull_request:
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      # targets: knip
      - uses: ./.github/actions/nx-run
        with:
          targets: lint
          projects: ui
      - run: echo hi
  ci-passed:
    needs: [a, b]
    steps:
      - run: true
`;

test('a job is its own lines only, and a comment is not a step', () => {
  const job = jobBlock(WORKFLOW, 'a');
  assert.ok(job.startsWith('  a:'));
  assert.ok(!job.includes('ci-passed'));
  assert.ok(!job.includes('knip'));
  assert.equal(stepBlocks(job).length, 2);
  assert.equal(jobBlock(WORKFLOW, 'missing'), null);
});

test('needs are read from the list form and the scalar form', () => {
  assert.deepEqual(needsOf(jobBlock(WORKFLOW, 'ci-passed')), ['a', 'b']);
  assert.deepEqual(needsOf('  x:\n    needs: scope\n'), ['scope']);
  assert.deepEqual(needsOf(null), []);
});

test('the guard reports a lost step, a missing job, an aggregate that does not wait, and a deferral without a safety net', () => {
  const read = () => WORKFLOW;
  assert.deepEqual(problems({ id: 'ok', tier: 'pr', workflow: 'ci.yml', job: 'a', step: ['targets: lint', 'projects: ui'] }, read), []);
  assert.match(problems({ id: 'lost', tier: 'pr', workflow: 'x.yml', job: 'a', step: ['targets: knip'] }, read)[0], /no step/);
  assert.match(problems({ id: 'gone', tier: 'pr', workflow: 'x.yml', job: 'z' }, read)[0], /has no job z/);
  const notNeeded = `${WORKFLOW.replace('needs: [a, b]', 'needs: [b]')}`;
  assert.match(problems({ id: 'n', tier: 'pr', workflow: 'ci.yml', job: 'a' }, () => notNeeded)[0], /not in the needs of ci-passed/);
  const deferred = WORKFLOW.replace('  pull_request:', '  push:\n    branches: [main]');
  assert.match(problems({ id: 'd', tier: 'post-merge', workflow: 'post.yml', job: 'a' }, () => deferred)[0], /without a safety_net/);
  assert.deepEqual(problems({ id: 'd', tier: 'post-merge', workflow: 'post.yml', job: 'a', safety_net: 'a red run on main ticks HOLD within 3 h' }, () => deferred), []);
  assert.match(problems({ id: 'd', tier: 'post-merge', workflow: 'pr.yml', job: 'a', safety_net: 'a red run on main ticks HOLD within 3 h' }, read)[0], /neither on a push to main nor on a schedule/);
  assert.match(problems({ id: 'p', tier: 'pr', workflow: 'post.yml', job: 'a' }, () => deferred)[0], /no pull_request trigger/);
});

test('a check inside a composite action is found there, and its loss from the action is reported', () => {
  const read = () => WORKFLOW;
  const entry = { id: 'merge', tier: 'pr', workflow: 'ci.yml', job: 'a', step: ['targets: lint'], action_has: { gate: ['--merge='] } };
  assert.deepEqual(problems(entry, read, () => 'runs:\n  steps:\n    - run: node coverage-gate.mjs --merge=3\n'), []);
  assert.match(problems(entry, read, () => 'runs:\n  steps:\n    # --merge=3\n    - run: true\n')[0], /action gate does not contain/);
  assert.match(
    problems(entry, read, () => {
      throw new Error('ENOENT');
    })[0],
    /action gate does not exist/,
  );
});
