import assert from 'node:assert/strict';
import test from 'node:test';

import { findRatchetViolations, isTestPath, parseAddedLines } from './test-ratchet.mjs';

const none = { changes: [], addedLines: [], floorsBefore: [], floorsAfter: [] };
const floor = (path, value) => ({ tool: 'go', project: 'apps/desktop', path, floor: value });

test('isTestPath recognises the repo test layouts and not source files', () => {
  for (const path of ['apps/ui/src/a.test.ts', 'apps/ui/src/a.spec.tsx', 'apps/desktop/internal/x/x_test.go', 'libs/python/tests/test_a.py', 'integrations/reaper/tests/cmd_spec.lua', 'scripts/ci/a.test.mjs']) {
    assert.equal(isTestPath(path), true, path);
  }
  for (const path of ['apps/ui/src/a.ts', 'apps/desktop/internal/x/x.go', 'docs/testing.md']) assert.equal(isTestPath(path), false, path);
});

test('no changes means no violations', () => {
  assert.deepEqual(findRatchetViolations(none), []);
});

test('a deleted test file is a violation, an added or edited one is not', () => {
  const changes = [
    { status: 'D', path: 'apps/ui/src/a.test.ts' },
    { status: 'A', path: 'apps/ui/src/b.test.ts' },
    { status: 'M', path: 'apps/ui/src/c.test.ts' },
  ];
  const found = findRatchetViolations({ ...none, changes });
  assert.equal(found.length, 1);
  assert.match(found[0], /deleted test file apps\/ui\/src\/a\.test\.ts/);
});

test('a deleted non-test file is fine', () => {
  assert.deepEqual(findRatchetViolations({ ...none, changes: [{ status: 'D', path: 'apps/ui/src/a.ts' }] }), []);
});

test('a rename of a test file to a non-test path is a violation', () => {
  const found = findRatchetViolations({ ...none, changes: [{ status: 'R', from: 'apps/ui/src/a.test.ts', path: 'apps/ui/src/a.ts' }] });
  assert.equal(found.length, 1);
  assert.match(found[0], /no longer a test file/);
});

test('skip, focus and expected-failure markers added to a test file are violations', () => {
  const markers = ['it.skip("x", () => {})', 'describe.skip("x", () => {})', 'xit("x", () => {})', 't.Skip("later")', '@pytest.mark.skip', 'pytest.skip("no")', 'test.only("x", () => {})', '@pytest.mark.xfail'];
  for (const text of markers) {
    const found = findRatchetViolations({ ...none, addedLines: [{ path: 'apps/ui/src/a.test.ts', text }] });
    assert.equal(found.length, 1, text);
  }
});

test('the same text in a source file or a doc is not a violation', () => {
  const addedLines = [
    { path: 'apps/ui/src/a.ts', text: 'it.skip("x")' },
    { path: 'docs/a.md', text: '`t.Skip("x")` skips a test' },
  ];
  assert.deepEqual(findRatchetViolations({ ...none, addedLines }), []);
});

test('a lowered coverage floor is a violation, a raised or equal one is not', () => {
  const found = findRatchetViolations({ ...none, floorsBefore: [floor('internal/a', 90), floor('internal/b', 80), floor('internal/c', 70)], floorsAfter: [floor('internal/a', 85), floor('internal/b', 85), floor('internal/c', 70)] });
  assert.equal(found.length, 1);
  assert.match(found[0], /internal\/a.*90.*85/);
});

test('a removed coverage floor is a violation and a new one is not', () => {
  const found = findRatchetViolations({ ...none, floorsBefore: [floor('internal/a', 90)], floorsAfter: [floor('internal/new', 80)] });
  assert.equal(found.length, 1);
  assert.match(found[0], /internal\/a.*removed/);
});

test('parseAddedLines pairs each added line with its file and skips headers and removals', () => {
  const diff = ['diff --git a/x.test.ts b/x.test.ts', '--- a/x.test.ts', '+++ b/x.test.ts', '@@ -1,2 +1,3 @@', '-old', '+it.skip("a")', ' context', '+const b = 1'].join('\n');
  assert.deepEqual(parseAddedLines(diff), [
    { path: 'x.test.ts', text: 'it.skip("a")' },
    { path: 'x.test.ts', text: 'const b = 1' },
  ]);
});
