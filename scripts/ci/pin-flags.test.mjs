import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { pinFlags } from './pin-flags.mjs';

const NONE = { ui: false, shell: false, winquick: false, static: true, quickubuntu: true };

test('no pin bump leaves the families to Nx and keeps the self-scoped jobs', () => {
  assert.deepEqual(pinFlags({ kind: 'none', jobs: [], pure: true }), NONE);
  assert.deepEqual(pinFlags({ kind: 'other', jobs: [], pure: false }), NONE);
  assert.deepEqual(pinFlags(undefined), NONE);
});

test('a pure pin bump starts only the families of the jobs it reaches', () => {
  const pins = { kind: 'pins', pure: true, jobs: ['_quality.yml#ui-atlas', 'codeql.yml#analyze'] };
  assert.deepEqual(pinFlags(pins), { ui: true, shell: false, winquick: false, static: false, quickubuntu: false });
});

test('a bump in go-test starts the shell family; a bump in js-static starts js-static', () => {
  const pins = { kind: 'pins', pure: true, jobs: ['_quality.yml#go-test', '_quality.yml#js-static'] };
  assert.deepEqual(pinFlags(pins), { ui: false, shell: true, winquick: false, static: true, quickubuntu: false });
});

test('ci-passed belongs to the ui family, so its download-artifact pin runs the visual shards', () => {
  assert.equal(pinFlags({ kind: 'pins', pure: true, jobs: ['ci.yml#ci-passed'] }).ui, true);
});

test('a pin bump beside other changes keeps the self-scoped jobs', () => {
  assert.deepEqual(pinFlags({ kind: 'pins', pure: false, jobs: ['_quality.yml#ui-atlas'] }), { ui: true, shell: false, winquick: false, static: true, quickubuntu: true });
});

test('the command line reads the classifier output from stdin', () => {
  const out = execFileSync('node', ['scripts/ci/pin-flags.mjs'], { input: '{"kind":"pins","jobs":["_quality.yml#go-test"],"pure":true}' }).toString();
  assert.equal(out.trim(), 'ui=false\nshell=true\nwinquick=false\nstatic=false\nquickubuntu=false');
});
