import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { classify, jobOfLine } from './workflow-pins.mjs';

const OLD = 'a'.repeat(40);
const NEW = 'b'.repeat(40);
const pin = (action, sha, version) => `      - uses: ${action}@${sha} # ${version}`;

const WORKFLOW = [
  'name: Quality', // 1
  'jobs:', // 2
  '  go-test:', // 3
  '    runs-on: windows-latest', // 4
  '    steps:', // 5
  `${pin('actions/checkout', NEW, 'v7.0.2')}`, // 6
  '      - uses: ./.github/actions/nx-run', // 7
  '        with: { targets: test }', // 8
  '  ui-atlas:', // 9
  '    steps:', // 10
  `${pin('actions/upload-artifact', NEW, 'v7.0.2')}`, // 11
  '      - run: echo hi', // 12
].join('\n');

const ACTION = ['name: Nx run', 'runs:', '  steps:', pin('actions/cache', NEW, 'v4.3.1')].join('\n');
const OUTER = ['name: Build native', 'runs:', '  steps:', '    - uses: ./.github/actions/nx-run'].join('\n');
const FILES = {
  '.github/workflows/_quality.yml': WORKFLOW,
  '.github/workflows/other.yml': ['jobs:', '  build:', '    steps:', '      - uses: ./.github/actions/build-native'].join('\n'),
  '.github/actions/nx-run/action.yml': ACTION,
  '.github/actions/build-native/action.yml': OUTER,
};

function diff(path, hunks) {
  const body = hunks.map(({ start, removed, added }) => `@@ -${start},${removed.length} +${start},${added.length} @@\n${removed.map((l) => `-${l}`).join('\n')}\n${added.map((l) => `+${l}`).join('\n')}`);
  return `diff --git a/${path} b/${path}\nindex 111..222 100644\n--- a/${path}\n+++ b/${path}\n${body.join('\n')}\n`;
}

test('jobOfLine finds the enclosing job and nothing outside jobs', () => {
  assert.equal(jobOfLine(WORKFLOW, 6), 'go-test');
  assert.equal(jobOfLine(WORKFLOW, 11), 'ui-atlas');
  assert.equal(jobOfLine(WORKFLOW, 1), null);
});

test('a pin bump maps to the jobs that contain the changed lines, not the rest', () => {
  const text = diff('.github/workflows/_quality.yml', [{ start: 11, removed: [pin('actions/upload-artifact', OLD, 'v7.0.1')], added: [pin('actions/upload-artifact', NEW, 'v7.0.2')] }]);
  assert.deepEqual(classify({ diff: text, files: FILES, otherChanged: false }), { kind: 'pins', jobs: ['_quality.yml#ui-atlas'], pure: true });
});

test('a changed local action reaches every job that uses it, and the users of actions that use it', () => {
  const text = diff('.github/actions/nx-run/action.yml', [{ start: 4, removed: [pin('actions/cache', OLD, 'v4.3.0')], added: [pin('actions/cache', NEW, 'v4.3.1')] }]);
  assert.deepEqual(classify({ diff: text, files: FILES, otherChanged: true }), { kind: 'pins', jobs: ['_quality.yml#go-test', 'other.yml#build'], pure: false });
});

test('a changed run: line is other', () => {
  const text = diff('.github/workflows/_quality.yml', [{ start: 12, removed: ['      - run: echo bye'], added: ['      - run: echo hi'] }]);
  assert.equal(classify({ diff: text, files: FILES, otherChanged: false }).kind, 'other');
});

test('a pin line swapped for a different action is other', () => {
  const text = diff('.github/workflows/_quality.yml', [{ start: 6, removed: [pin('actions/checkout', OLD, 'v7.0.1')], added: [pin('actions/setup-node', NEW, 'v7.0.2')] }]);
  assert.equal(classify({ diff: text, files: FILES, otherChanged: false }).kind, 'other');
});

test('an unpinned or unversioned uses: line is other', () => {
  const text = diff('.github/workflows/_quality.yml', [{ start: 6, removed: ['      - uses: actions/checkout@v7'], added: ['      - uses: actions/checkout@v8'] }]);
  assert.equal(classify({ diff: text, files: FILES, otherChanged: false }).kind, 'other');
});

test('an added step (more lines added than removed) is other', () => {
  const text = diff('.github/workflows/_quality.yml', [{ start: 6, removed: [pin('actions/checkout', OLD, 'v7.0.1')], added: [pin('actions/checkout', NEW, 'v7.0.2'), '      - run: echo extra'] }]);
  assert.equal(classify({ diff: text, files: FILES, otherChanged: false }).kind, 'other');
});

test('a new file under the folders is other', () => {
  const text = 'diff --git a/.github/workflows/new.yml b/.github/workflows/new.yml\nnew file mode 100644\nindex 000..111\n--- /dev/null\n+++ b/.github/workflows/new.yml\n@@ -0,0 +1,1 @@\n+name: x\n';
  assert.equal(classify({ diff: text, files: FILES, otherChanged: false }).kind, 'other');
});

test('a changed line outside any job is other', () => {
  const text = diff('.github/workflows/_quality.yml', [{ start: 1, removed: [pin('actions/checkout', OLD, 'v7.0.1')], added: [pin('actions/checkout', NEW, 'v7.0.2')] }]);
  assert.equal(classify({ diff: text, files: FILES, otherChanged: false }).kind, 'other');
});

test('no change under the folders is none, and an unparseable diff is other', () => {
  assert.deepEqual(classify({ diff: '', files: FILES, otherChanged: true }), { kind: 'none', jobs: [], pure: false });
  assert.equal(classify({ diff: 'diff --git garbage\n', files: FILES, otherChanged: false }).kind, 'other');
});

// nx-scope.sh --pins against a real repository: the existing all/affected answers stay, and a pin-only change stops forcing `all`.
const root = join(import.meta.dirname, '..', '..');
function scopeOf(change, flag) {
  const dir = mkdtempSync(join(tmpdir(), 'nx-scope-'));
  const run = (cmd, ...args) => execFileSync(cmd, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ALWAYS: 'false', GITHUB_EVENT_NAME: 'pull_request', BASE_REF: 'main' } });
  try {
    run('git', 'init', '-q', '-b', 'main');
    run('git', 'config', 'user.email', 't@t');
    run('git', 'config', 'user.name', 't');
    mkdirSync(join(dir, 'scripts/ci'), { recursive: true });
    mkdirSync(join(dir, '.github/workflows'), { recursive: true });
    for (const name of ['nx-scope.sh', 'workflow-pins.mjs']) copyFileSync(join(root, 'scripts/ci', name), join(dir, 'scripts/ci', name));
    writeFileSync(join(dir, '.github/workflows/q.yml'), ['jobs:', '  build:', '    steps:', pin('actions/checkout', OLD, 'v7.0.1'), '      - run: echo a', ''].join('\n'));
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    run('git', 'add', '-A');
    run('git', 'commit', '-q', '-m', 'base');
    run('git', 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    run('git', 'checkout', '-q', '-b', 'pr');
    change(dir);
    run('git', 'add', '-A');
    run('git', 'commit', '-q', '-m', 'change');
    return run('bash', 'scripts/ci/nx-scope.sh', ...(flag ? ['--pins'] : [])).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const bump = (dir) => writeFileSync(join(dir, '.github/workflows/q.yml'), ['jobs:', '  build:', '    steps:', pin('actions/checkout', NEW, 'v7.0.2'), '      - run: echo a', ''].join('\n'));
const editRun = (dir) => writeFileSync(join(dir, '.github/workflows/q.yml'), ['jobs:', '  build:', '    steps:', pin('actions/checkout', OLD, 'v7.0.1'), '      - run: echo b', ''].join('\n'));

test('nx-scope.sh: a pin bump is all without --pins and affected with it', () => {
  assert.equal(scopeOf(bump, false), 'all');
  assert.equal(scopeOf(bump, true), 'affected');
});

test('nx-scope.sh --pins: a run: edit, or a pin bump beside a workspace-wide file, stays all', () => {
  assert.equal(scopeOf(editRun, true), 'all');
  assert.equal(
    scopeOf((dir) => {
      bump(dir);
      writeFileSync(join(dir, 'nx.json'), '{}\n');
    }, true),
    'all',
  );
});

test('nx-scope.sh --pins: an ordinary change is unchanged', () => {
  assert.equal(scopeOf((dir) => writeFileSync(join(dir, 'a.txt'), 'b\n'), true), 'affected');
});
