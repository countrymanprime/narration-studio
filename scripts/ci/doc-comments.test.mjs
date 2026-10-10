import assert from 'node:assert/strict';
import test from 'node:test';

import { PYTHON_RULES, filterToAdded, parseAddedLines, parseRuffJson, ruffArgs } from './doc-comments.mjs';

const DIFF = [
  'diff --git a/libs/python/a.py b/libs/python/a.py',
  'index 111..222 100644',
  '--- a/libs/python/a.py',
  '+++ b/libs/python/a.py',
  '@@ -3,0 +4,2 @@ def f():',
  '+x = 1',
  '+y = 2',
  '@@ -10,2 +13 @@ def g():',
  '-old',
  '+new',
  'diff --git a/libs/python/gone.py b/libs/python/gone.py',
  'deleted file mode 100644',
  '--- a/libs/python/gone.py',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-a',
  '-b',
  'diff --git a/libs/python/new.py b/libs/python/new.py',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/libs/python/new.py',
  '@@ -0,0 +1,3 @@',
  '+a',
  '+b',
  '+c',
].join('\n');

test('parseAddedLines reads added ranges per file, a single-line hunk, and a new file', () => {
  const added = parseAddedLines(DIFF);

  assert.deepEqual([...added.get('libs/python/a.py')].sort((a, b) => a - b), [4, 5, 13]);
  assert.deepEqual([...added.get('libs/python/new.py')].sort((a, b) => a - b), [1, 2, 3]);
});

test('parseAddedLines ignores a deleted file and a hunk that only removes lines', () => {
  assert.equal(parseAddedLines(DIFF).has('libs/python/gone.py'), false);
});

test('parseAddedLines on an empty diff is empty', () => {
  assert.equal(parseAddedLines('').size, 0);
});

test('filterToAdded keeps only violations on an added line of that file', () => {
  const added = parseAddedLines(DIFF);
  const violations = [
    { file: 'libs/python/a.py', line: 4, code: 'D103' },
    { file: 'libs/python/a.py', line: 7, code: 'D103' },
    { file: 'libs/python/other.py', line: 1, code: 'D100' },
    { file: 'libs/python/new.py', line: 1, code: 'D100' },
  ];

  assert.deepEqual(filterToAdded(violations, added).map((v) => `${v.file}:${v.line}`), ['libs/python/a.py:4', 'libs/python/new.py:1']);
});

test('parseRuffJson turns absolute paths into repo-relative ones with forward slashes', () => {
  const json = JSON.stringify([{ code: 'D103', message: 'Missing docstring in public function', filename: 'C:\\repo\\libs\\python\\a.py', location: { row: 4, column: 1 } }]);

  assert.deepEqual(parseRuffJson(json, 'C:\\repo'), [{ file: 'libs/python/a.py', line: 4, code: 'D103', message: 'Missing docstring in public function' }]);
});

test('the Python rules are the missing-docstring rules for public names, without __init__ and magic methods', () => {
  assert.deepEqual(PYTHON_RULES, ['D100', 'D101', 'D102', 'D103', 'D104', 'D106']);
});

test('ruffArgs gives each exclude in the = form and ends with the directories, so ruff does not scan the whole tree', () => {
  const args = ruffArgs(['libs/python', 'sidecars/x']);

  assert.deepEqual(args.slice(-2), ['libs/python', 'sidecars/x']);
  assert.equal(args.filter((arg) => arg === '--extend-exclude').length, 0);
  assert.ok(args.includes('--extend-exclude=**/tests/**'));
});

test('parseAddedLines reads a path with a space (git adds a tab) and a path with non-ASCII characters', () => {
  const diff = [
    'diff --git a/libs/python/a b.py b/libs/python/a b.py',
    '--- /dev/null',
    '+++ b/libs/python/a b.py\t',
    '@@ -0,0 +1 @@',
    '+x',
    'diff --git a/libs/python/caf\u00e9.py b/libs/python/caf\u00e9.py',
    '--- /dev/null',
    '+++ b/libs/python/caf\u00e9.py',
    '@@ -0,0 +1 @@',
    '+y',
  ].join('\n');

  assert.deepEqual([...parseAddedLines(diff).keys()], ['libs/python/a b.py', 'libs/python/caf\u00e9.py']);
});

test('parseAddedLines treats an added line that starts with ++ as content, not a new file header', () => {
  const diff = ['diff --git a/a.py b/a.py', '--- a/a.py', '+++ b/a.py', '@@ -1,0 +2,2 @@', '+++ x', '+z', '@@ -9,0 +11 @@', '+w'].join('\n');

  assert.deepEqual([...parseAddedLines(diff).get('a.py')].sort((a, b) => a - b), [2, 3, 11]);
});

test('parseAddedLines gives a pure rename no added lines', () => {
  const diff = ['diff --git a/old.py b/new.py', 'similarity index 100%', 'rename from old.py', 'rename to new.py'].join('\n');

  assert.equal(parseAddedLines(diff).size, 0);
});

test('parseRuffJson compares the root case-insensitively and throws for a file outside it', () => {
  const json = JSON.stringify([{ code: 'D103', message: 'm', filename: 'c:/Repo/libs/a.py', location: { row: 1, column: 1 } }]);

  assert.equal(parseRuffJson(json, 'C:/repo')[0].file, 'libs/a.py');
  assert.throws(() => parseRuffJson(json, 'D:/other'), /not under/);
});
