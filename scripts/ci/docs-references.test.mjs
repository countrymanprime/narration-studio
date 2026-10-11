import assert from 'node:assert/strict';
import test from 'node:test';

import { REPO_ROOT, trackedFiles } from './layout.mjs';
import { extractReferences, findMissing, ignoredAmong, isCheckedFile, makeExists } from './docs-references.mjs';

const TRACKED = ['apps/ui/src/App.tsx', 'apps/desktop/app.go', 'docs/architecture/reaper-bridge.md', 'README.md', 'scripts/ci/layout.json'];
const exists = makeExists(TRACKED);
const SCRIPTS = new Set(['check', 'lint:md']);

test('extractReferences finds repo paths in inline code with their line numbers', () => {
  const refs = extractReferences('intro\nSee `apps/ui/src/App.tsx` and `docs/architecture/reaper-bridge.md`.\n');

  assert.deepEqual(refs, [
    { line: 2, ref: 'apps/ui/src/App.tsx', kind: 'path' },
    { line: 2, ref: 'docs/architecture/reaper-bridge.md', kind: 'path' },
  ]);
});

test('extractReferences strips a :line suffix and a #anchor, and a trailing slash or punctuation', () => {
  const refs = extractReferences('`apps/desktop/app.go:42` `docs/architecture/reaper-bridge.md#harness` `apps/ui/src/`');

  assert.deepEqual(refs.map((ref) => ref.ref), ['apps/desktop/app.go', 'docs/architecture/reaper-bridge.md', 'apps/ui/src']);
});

test('extractReferences ignores placeholders, globs, URLs, absolute and unknown-root paths', () => {
  const text = '`docs/<name>.md` `docs/**/*.md` `docs/{a,b}.md` `https://example.com/docs/x` `/etc/hosts` `other/dir/file.go` `~/docs/x.md` `docs/$X/y.md`';

  assert.deepEqual(extractReferences(text), []);
});

test('extractReferences ignores a path in a fenced block and in a quotation', () => {
  assert.deepEqual(extractReferences('```\n`apps/ui/gone.ts`\napps/ui/gone.ts\n```\n> `apps/ui/gone.ts`\n'), []);
});

test('extractReferences reads root pnpm scripts but not filtered or directory-scoped ones', () => {
  const refs = extractReferences('`pnpm check` `pnpm run lint:md` `pnpm --dir apps/ui atlas` `pnpm exec nx run x` `pnpm -s check`');

  assert.deepEqual(
    refs.map((ref) => [ref.kind, ref.ref]),
    [
      ['pnpm', 'check'],
      ['pnpm', 'lint:md'],
    ],
  );
});

test('findMissing reports a path that is neither a tracked file nor a tracked directory', () => {
  const refs = extractReferences('`apps/ui/src/App.tsx` `apps/ui/src` `apps/ui/src/Gone.tsx` `README.md` `pnpm check` `pnpm nope`');

  assert.deepEqual(
    findMissing(refs, { exists, scripts: SCRIPTS }).map((ref) => ref.ref),
    ['apps/ui/src/Gone.tsx', 'nope'],
  );
});

test('findMissing accepts a Go symbol, a sub-project-relative path and a pnpm built-in', () => {
  const exists = makeExists(['apps/desktop/internal/daw/daw.go', 'apps/ui/tests/visual/state-catalog.ts']);
  const refs = extractReferences('`apps/desktop/internal/daw.Locate` `apps/desktop/internal/daw.Reach.Start` `tests/visual/state-catalog.ts` `pnpm licenses` `apps/desktop/internal/gone.Locate` `tests/visual/gone.ts`');

  assert.deepEqual(
    findMissing(refs, { exists, scripts: new Set() }).map((ref) => ref.ref),
    ['apps/desktop/internal/gone.Locate', 'tests/visual/gone.ts'],
  );
});

test('extractReferences skips a line that says the path was deleted or replaced', () => {
  assert.deepEqual(extractReferences('The PRD `docs/design/gone.md` was delivered and deleted.'), []);
  assert.equal(extractReferences('See `docs/design/gone.md` for the plan.').length, 1);
});

test('extractReferences skips only the span next to the word, not a distant one on the same line', () => {
  const line = 'The `apps/old/a.go` was removed. ' + 'Filler words go here to push the next path out of reach of that word. ' + 'See `apps/old/b.go`.';

  assert.deepEqual(extractReferences(line).map((ref) => ref.ref), ['apps/old/b.go']);
});

test('extractReferences skips front matter, reads a GitHub alert, and skips an ordinary quotation', () => {
  assert.deepEqual(extractReferences('---\nsource: `apps/old/a.go`\n---\n'), []);
  assert.equal(extractReferences('> [!NOTE]\n> see `apps/old/a.go`\n').length, 0); // second line is a quotation line
  assert.equal(extractReferences('> [!NOTE] see `apps/old/a.go`\n').length, 1);
  assert.deepEqual(extractReferences('> see `apps/old/a.go`\n'), []);
});

test('makeExists: the suffix shorthand is for tests/ only, so a stale tail cannot resolve to a nested package', () => {
  const exists = makeExists(['apps/ui/scripts/foo.mjs', 'apps/ui/package.json', 'apps/ui/tests/visual/x.ts']);

  assert.equal(exists('scripts/foo.mjs'), false);
  assert.equal(exists('package.json'), false);
  assert.equal(exists('tests/visual/x.ts'), true);
});

test('extractReferences ignores a placeholder spelled in letters', () => {
  assert.deepEqual(extractReferences('`docs/adr/NNNN-short-title.md`'), []);
});

test('isCheckedFile covers current docs and leaves history and plans alone', () => {
  assert.equal(isCheckedFile('docs/architecture/reaper-bridge.md'), true);
  assert.equal(isCheckedFile('README.md'), true);
  assert.equal(isCheckedFile('.claude/skills/docs-style/SKILL.md'), true);
  assert.equal(isCheckedFile('docs/adr/0001-x.md'), false);
  assert.equal(isCheckedFile(`${'docs/prds'}/x.prd.md`), false);
  assert.equal(isCheckedFile('docs/research/x.md'), false);
  assert.equal(isCheckedFile('docs/ui/atlas/x.md'), false);
});

test('the tracked tree: makeExists resolves a real file and a real directory', () => {
  const real = makeExists(trackedFiles());

  assert.equal(real('scripts/ci/layout.json'), true);
  assert.equal(real('scripts/ci'), true);
  assert.equal(real('scripts/ci/nope.json'), false);
  assert.ok(REPO_ROOT);
});

test('ignoredAmong reports an ignored directory that is not on disk under the name the doc used', () => {
  const ignored = ignoredAmong(['apps/ui/coverage', 'apps/ui/src']);

  assert.ok(ignored.has('apps/ui/coverage'));
  assert.ok(!ignored.has('apps/ui/src'));
});
