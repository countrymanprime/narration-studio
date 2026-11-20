import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// #3619: ci.yml skips a pull request that changes only docs/ or Markdown, so the layout check (scripts/ci/layout.test.mjs, run by
// ci.yml's repo-scripts step) never saw a docs-only change, and #3604 merged a research document whose short paths the check reads as
// retired: main went red and so did every open pull request. docs.yml runs on every pull request, so the layout check runs there too.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => readFileSync(join(root, '.github', 'workflows', file), 'utf8');
const docs = read('docs.yml');
const ci = read('ci.yml');

/** The step of the `docs` job that runs the layout test, as its YAML text, or '' when there is none. */
function layoutStep() {
  const steps = docs.split(/\n {6}- /);
  return steps.find((step) => /node --test scripts\/ci\/layout\.test\.mjs/.test(step)) ?? '';
}

test('ci.yml still skips a documentation-only change, which is why docs.yml has to run the layout check', () => {
  assert.match(ci, /paths-ignore:\n\s+- 'docs\/\*\*'\n\s+- '\*\*\/\*\.md'/);
});

test('docs.yml runs on every pull request, with no path filter', () => {
  const trigger = /\non:\n([\s\S]*?)\npermissions:/.exec(docs)?.[1] ?? '';
  const pullRequest = /\n {2}pull_request:\n([\s\S]*?)(?=\n {2}\w)/.exec(`\n${trigger}\n  end`)?.[1] ?? '';
  assert.ok(pullRequest.length > 0, 'docs.yml has no pull_request trigger');
  assert.doesNotMatch(pullRequest, /paths(-ignore)?:/);
});

test('docs.yml runs the layout test, so a docs-only change cannot turn main red', () => {
  const step = layoutStep();
  assert.ok(step, 'no step of docs.yml runs `node --test scripts/ci/layout.test.mjs`');
  assert.match(step, /if: \$\{\{ !cancelled\(\) \}\}/, 'the layout step may only be skipped when the run is cancelled');
});
