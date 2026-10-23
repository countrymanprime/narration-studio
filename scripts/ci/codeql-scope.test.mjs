import assert from 'node:assert/strict';
import test from 'node:test';

import { matrixFor } from './codeql-scope.mjs';

const languages = (paths) => matrixFor(paths).map((row) => row.language);

test('a Go-only change analyses Go only', () => {
  assert.deepEqual(languages(['src/studio/desktop/app.go', 'src/studio/desktop/internal/daw/reachability.go']), ['go']);
  assert.deepEqual(languages(['src/studio/desktop/go.mod']), ['go']);
  assert.deepEqual(languages(['scripts/toolchain.json']), ['go']);
});

test('a UI change analyses JavaScript and TypeScript only', () => {
  assert.deepEqual(languages(['src/studio/ui/src/App.tsx', 'src/studio/ui/src/styles.css']), ['javascript-typescript']);
  assert.deepEqual(languages(['scripts/ci/pr-risk.mjs']), ['javascript-typescript']);
  assert.deepEqual(languages(['tools/docs-site/theme/main.html']), ['javascript-typescript']);
});

test('a Python change analyses Python only, wherever the file lives', () => {
  assert.deepEqual(languages(['src/studio/sidecars/compare/compare.py', 'src/studio/libs/python/narration_common/x.py']), ['python']);
  assert.deepEqual(languages(['scripts/licenses/notices.py', 'tools/docs-site/hooks.py', 'tests/fixtures/make.py']), ['python']);
});

test('a mixed change analyses each language it touches, in a fixed order', () => {
  assert.deepEqual(languages(['src/studio/sidecars/a.py', 'src/studio/ui/src/a.ts', 'src/studio/desktop/a.go']), ['go', 'javascript-typescript', 'python']);
});

test('a change to no analysed file analyses nothing', () => {
  assert.deepEqual(languages(['docs/guides/x.md', 'src/studio/integrations/reaper/lua/bridge.lua', 'pnpm-lock.yaml', '.github/workflows/ci.yml']), []);
});

test('the workflow, the Go setup and an unreadable diff analyse every language', () => {
  const every = ['go', 'javascript-typescript', 'python'];
  assert.deepEqual(languages(['.github/workflows/codeql.yml']), every);
  assert.deepEqual(languages(['.github/actions/setup-toolchain/action.yml']), every);
  assert.deepEqual(languages(['scripts/ci/codeql-scope.mjs']), every);
  assert.deepEqual(languages([]), every);
  assert.deepEqual(languages(['', '  ']), every);
});

test('a Windows path and a build mode are carried through', () => {
  assert.deepEqual(matrixFor(['src\\studio\\desktop\\app.go']), [{ language: 'go', 'build-mode': 'manual' }]);
  assert.deepEqual(matrixFor(['a.py']), [{ language: 'python', 'build-mode': 'none' }]);
});
