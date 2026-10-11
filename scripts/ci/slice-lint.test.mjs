import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateLabels } from '../github/sync-labels.mjs';
import { LANES, KINDS, extractMeta, findCycle, globToRegExp, lintSlice, parseMeta } from '../dev/slice-lint.mjs';

// This slice's own header (issue #1002) is the fixture for the valid case.
const OWN_BLOCK = `id: SN-A1
lane: D
kind: docs
depends: []
owns:
  - .github/labels.json
  - "new:.github/ISSUE_TEMPLATE/slice.yml"
  - "new:scripts/dev/slice-lint.mjs"
  - "new:scripts/ci/slice-lint.test.mjs"
serial:
  - ".github"
`;
const OWN_BODY = `Part of #996.\n\n\`\`\`slice-meta\n${OWN_BLOCK}\`\`\`\n\n\`\`\`text\nPRD: ...\n\`\`\`\n`;
const FILES = ['.github/labels.json', '.github/workflows/ci.yml', 'scripts/dev/bump-host-api.mjs', 'apps/ui/src/App.tsx', 'apps/ui/src/pages/Tracks.tsx'];
const exists = (numbers) => (n) => numbers.includes(n);
const lint = (block, options = {}) => lintSlice(block, { files: FILES, issueExists: () => true, ...options });
const without = (key) => OWN_BLOCK.replace(new RegExp(`^${key}:.*\\n(?:  - .*\\n)*`, 'm'), '');

test('fails on a missing owns', () => {
  const errors = lint(without('owns'));
  assert.ok(errors.some((e) => /missing required key "owns"/.test(e)), errors.join('\n'));
  const empty = lint(OWN_BLOCK.replace(/owns:\n(?:  - .*\n)+/, 'owns: []\n'));
  assert.ok(empty.some((e) => /owns must list at least one glob/.test(e)), empty.join('\n'));
});

test('fails on an owns glob that matches nothing', () => {
  const errors = lint(OWN_BLOCK.replace('.github/labels.json', 'apps/ui/src/Missing/**'));
  assert.ok(errors.some((e) => /apps\/ui\/src\/Missing\/\*\*.*matches no tracked file/.test(e)), errors.join('\n'));
});

test('accepts an owns entry marked new: for a file the slice creates', () => {
  assert.deepEqual(lint(OWN_BLOCK), []);
  // The prefix exempts the match check only; the glob must still be valid.
  const bad = lint(OWN_BLOCK.replace('new:scripts/dev/slice-lint.mjs', 'new:scripts/[dev/slice-lint.mjs'));
  assert.ok(bad.some((e) => /invalid glob/.test(e)), bad.join('\n'));
});

test('fails on a cyclic depends (graph given as an issue-number map)', () => {
  assert.deepEqual(findCycle({ 1: [2], 2: [3], 3: [] }), null);
  assert.deepEqual(findCycle({ 1: [2], 2: [3], 3: [1] }), [1, 2, 3, 1]);
  assert.deepEqual(findCycle({ 5: [5] }), [5, 5]);
  const errors = lint(OWN_BLOCK.replace('depends: []', 'depends: [20]'), { issue: 10, graph: { 20: [30], 30: [10] } });
  assert.ok(errors.some((e) => /cyclic depends: #10 -> #20 -> #30 -> #10/.test(e)), errors.join('\n'));
});

test('fails on a missing required key', () => {
  for (const key of ['id', 'lane', 'kind', 'depends', 'owns', 'serial']) {
    const errors = lint(without(key));
    assert.ok(errors.some((e) => e.includes(`missing required key "${key}"`)), `${key}: ${errors.join('\n')}`);
  }
});

test('fails on an unknown lane or kind', () => {
  assert.deepEqual(LANES, ['K', 'A', 'B', 'U', 'C', 'D', 'X']);
  assert.deepEqual(KINDS, ['spike', 'adr', 'seam', 'page', 'swap', 'host', 'lua', 'docs']);
  assert.ok(lint(OWN_BLOCK.replace('lane: D', 'lane: Z')).some((e) => /unknown lane "Z"/.test(e)));
  assert.ok(lint(OWN_BLOCK.replace('kind: docs', 'kind: feature')).some((e) => /unknown kind "feature"/.test(e)));
  assert.ok(lint(OWN_BLOCK.replace('id: SN-A1', 'id: A1')).some((e) => /id "A1" is not SN-<code><n>/.test(e)));
});

test('fails on an invalid glob', () => {
  for (const glob of ['', '/etc/passwd', '../outside/**', 'apps/[ui', 'apps/{ui,desktop', '!apps/**', 'apps\\ui']) {
    const errors = lint(OWN_BLOCK.replace('.github/labels.json', glob.replace(/\\/g, '\\\\')).replace(/- (?=\n)/, '- ""'));
    assert.ok(errors.some((e) => /invalid glob|owns entry is empty/.test(e)), `${JSON.stringify(glob)}: ${errors.join('\n')}`);
  }
});

test('fails when a depends issue number does not exist', () => {
  const block = OWN_BLOCK.replace('depends: []', 'depends: [996, 4040]');
  const errors = lint(block, { issueExists: exists([996]) });
  assert.deepEqual(errors, ['depends: issue #4040 does not exist']);
  assert.deepEqual(lint(block, { issueExists: exists([996, 4040]) }), []);
  // Without a checker (offline) the existence check is skipped, not failed.
  assert.deepEqual(lint(block, { issueExists: undefined }), []);
});

test('passes a valid header', () => {
  assert.deepEqual(extractMeta(OWN_BODY), OWN_BLOCK.trimEnd());
  assert.deepEqual(parseMeta(OWN_BLOCK), {
    id: 'SN-A1',
    lane: 'D',
    kind: 'docs',
    depends: [],
    owns: ['.github/labels.json', 'new:.github/ISSUE_TEMPLATE/slice.yml', 'new:scripts/dev/slice-lint.mjs', 'new:scripts/ci/slice-lint.test.mjs'],
    serial: ['.github'],
  });
  assert.deepEqual(lint(OWN_BODY), []);
  const flow = `${OWN_BLOCK.replace('depends: []', 'depends: [996, "#997"]')}`;
  assert.deepEqual(parseMeta(flow).depends, [996, 997]);
});

test('reports a body with no slice-meta block and malformed lines', () => {
  assert.ok(lint('just prose').some((e) => /line 1: expected "key: value"/.test(e)));
  assert.throws(() => parseMeta('id SN-A1'), /line 1: expected "key: value"/);
  assert.throws(() => parseMeta('id: a\nid: b'), /line 2: duplicate key "id"/);
  assert.throws(() => parseMeta('  - stray'), /line 1/);
});

test('globToRegExp follows the owns glob rules', () => {
  const m = (glob, path) => globToRegExp(glob).test(path);
  assert.ok(m('apps/ui/src/**', 'apps/ui/src/pages/Tracks.tsx'));
  assert.ok(m('apps/ui/src/*.tsx', 'apps/ui/src/App.tsx'));
  assert.ok(!m('apps/ui/src/*.tsx', 'apps/ui/src/pages/Tracks.tsx'));
  assert.ok(m('**/*.md', 'README.md'));
  assert.ok(m('docs/{prds,adr}/*.md', 'docs/prds/a.md'));
  assert.ok(m('a/file?.txt', 'a/file1.txt'));
  assert.ok(m('a/[ab].txt', 'a/b.txt'));
  assert.ok(!m('a.b', 'aXb'));
});

test('labels.json carries slice, ready, owner-decision, studio-next, lane:K..lane:X and a prd:<code> label per PRD code', () => {
  const labels = JSON.parse(readFileSync(new URL('../../.github/labels.json', import.meta.url), 'utf8'));
  validateLabels(labels);
  const names = new Set(labels.map((label) => label.name));
  const required = [
    'slice',
    'ready',
    'owner-decision',
    'studio-next',
    'blocked',
    ...['K', 'A', 'B', 'U', 'C', 'D', 'X'].map((lane) => `lane:${lane}`),
    ...['SN0', 'SNG', 'SNA', 'SNF', 'SNR', 'SNS', 'SND', 'SNP', 'SNB', 'SNX', 'SNO', 'SNQ', 'SNE', 'SNM', 'SNC'].map((code) => `prd:${code}`),
  ];
  assert.deepEqual(required.filter((name) => !names.has(name)), []);
});
