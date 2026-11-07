import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { jobBlock, readWorkflow } from './check-manifest.mjs';
import { FAMILIES, pinFlags, SELF_SCOPED } from './pin-flags.mjs';

const NONE = { ui: false, shell: false, static: true, quickubuntu: true };

test('no pin bump leaves the families to Nx and keeps the self-scoped jobs', () => {
  assert.deepEqual(pinFlags({ kind: 'none', jobs: [], pure: true }), NONE);
  assert.deepEqual(pinFlags({ kind: 'other', jobs: [], pure: false }), NONE);
  assert.deepEqual(pinFlags(undefined), NONE);
});

test('a pure pin bump starts only the families of the jobs it reaches', () => {
  const pins = { kind: 'pins', pure: true, jobs: ['_quality.yml#test-linux', 'codeql.yml#analyze'] };
  assert.deepEqual(pinFlags(pins), { ui: true, shell: false, static: false, quickubuntu: true });
  const ciOnly = { kind: 'pins', pure: true, jobs: ['ci.yml#ci-passed'] };
  assert.deepEqual(pinFlags(ciOnly), { ui: true, shell: false, static: false, quickubuntu: false });
});

test('a bump in Test (Windows) starts the shell family; a bump in lint runs its steps; a bump in Test (Linux) starts its shards and quick tests', () => {
  assert.deepEqual(pinFlags({ kind: 'pins', pure: true, jobs: ['_quality.yml#test-windows'] }), { ui: false, shell: true, static: false, quickubuntu: false });
  assert.deepEqual(pinFlags({ kind: 'pins', pure: true, jobs: ['_quality.yml#test-linux'] }), { ui: true, shell: false, static: false, quickubuntu: true });
  assert.deepEqual(pinFlags({ kind: 'pins', pure: true, jobs: ['_quality.yml#lint'] }), { ui: false, shell: false, static: true, quickubuntu: false });
});

test('the gate job belongs to the ui family, so its download-artifact pins run the shards whose uploads it reads', () => {
  assert.equal(pinFlags({ kind: 'pins', pure: true, jobs: ['ci.yml#ci-passed'] }).ui, true);
});

test('a pin bump beside other changes keeps the self-scoped jobs', () => {
  assert.deepEqual(pinFlags({ kind: 'pins', pure: false, jobs: ['_quality.yml#test-linux'] }), { ui: true, shell: false, static: true, quickubuntu: true });
});

test('the command line reads the classifier output from stdin', () => {
  const out = execFileSync('node', ['scripts/ci/pin-flags.mjs'], { input: '{"kind":"pins","jobs":["_quality.yml#test-windows"],"pure":true}' }).toString();
  assert.equal(out.trim(), 'ui=false\nshell=true\nstatic=false\nquickubuntu=false');
});

test('every job a family names exists, so a renamed job cannot drop out of its family unnoticed', () => {
  for (const ref of [...Object.values(FAMILIES).flat(), ...Object.values(SELF_SCOPED)]) {
    const [file, job] = ref.split('#');
    assert.ok(jobBlock(readWorkflow(file), job), `${ref} is not a job`);
  }
});
