import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { jobScope } from './job-scope.mjs';

const ALL = { ui: true, go: true, 'windows-quick': true, 'js-static': true, 'quick-ubuntu': true };

test('all mode runs every job whatever the list says', () => {
  assert.deepEqual(jobScope('all', []), ALL);
});

test('a UI-only change starts no Windows job', () => {
  assert.deepEqual(jobScope('affected', ['narration-utils-ui']), { ui: true, go: false, 'windows-quick': false, 'js-static': true, 'quick-ubuntu': true });
});

test('a Go-only change skips the UI jobs and runs both Windows jobs', () => {
  assert.deepEqual(jobScope('affected', ['narration-utils-shell']), { ui: false, go: true, 'windows-quick': true, 'js-static': true, 'quick-ubuntu': true });
});

test('a Lua change keeps quick-windows for the CRLF run even if go were not affected', () => {
  assert.deepEqual(jobScope('affected', ['reaper']), { ui: false, go: false, 'windows-quick': true, 'js-static': true, 'quick-ubuntu': true });
});

test('a docs or scripts change starts none of the gated jobs', () => {
  assert.deepEqual(jobScope('affected', ['narration-utils', 'repo-scripts']), { ui: false, go: false, 'windows-quick': false, 'js-static': true, 'quick-ubuntu': true });
});

test('a bad mode or list fails instead of guessing', () => {
  assert.throws(() => jobScope('', []));
  assert.throws(() => jobScope('affected', 'narration-utils-ui'));
});

test('the command line reads the list from stdin', () => {
  const out = execFileSync('node', ['scripts/ci/job-scope.mjs', '--mode', 'affected'], { input: '["narration-utils-ui"]' }).toString();
  assert.equal(out.trim(), 'ui=true\ngo=false\nwindows-quick=false\njs-static=true\nquick-ubuntu=true');
});

const PURE = (jobs) => ({ kind: 'pins', jobs, pure: true });

test('a pure pin bump starts only the flags of the jobs it reaches', () => {
  const pins = PURE(['_quality.yml#ui-atlas', 'codeql.yml#analyze']);
  assert.deepEqual(jobScope('affected', ['narration-utils'], pins), { ui: true, go: false, 'windows-quick': false, 'js-static': false, 'quick-ubuntu': false });
});

test('a pin bump in go-test starts go and nothing in the UI', () => {
  const pins = PURE(['_quality.yml#go-test', '_quality.yml#js-static']);
  assert.deepEqual(jobScope('affected', ['narration-utils'], pins), { ui: false, go: true, 'windows-quick': false, 'js-static': true, 'quick-ubuntu': false });
});

test('a pin bump mixed with other changes keeps the self-scoped jobs', () => {
  const pins = { kind: 'pins', jobs: ['_quality.yml#ui-atlas'], pure: false };
  assert.deepEqual(jobScope('affected', ['narration-utils-shell'], pins), { ui: true, go: true, 'windows-quick': true, 'js-static': true, 'quick-ubuntu': true });
});

test('all mode ignores the pin list', () => {
  assert.deepEqual(jobScope('all', [], PURE([])), ALL);
});
