import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserEnv, findInstalledHeadlessShell, parseArgs, parseThemes, visualGrep } from './targeted-runs.mjs';

test('visualGrep selects the rows of the named pages only', () => {
  const re = new RegExp(visualGrep(['script', 'settings']), 'i');
  assert.ok(re.test('tests/visual/app.spec.ts:31:3 › script / find'));
  assert.ok(re.test('settings / dirty-footer / reflow'));
  assert.ok(!re.test('proof-chapter / compare-toast'));
  assert.ok(!re.test('storybible / script / x'.replace('storybible / ', 'storybible-')));
});

test('visualGrep rejects no page and malformed names', () => {
  assert.throws(() => visualGrep([]), /at least one page/);
  assert.throws(() => visualGrep(['a b']), /not a page name/);
  assert.throws(() => visualGrep(['x|y']), /not a page name/);
});

test('findInstalledHeadlessShell picks the newest build that has an executable', () => {
  const files = new Set(['/b', '/b/chromium_headless_shell-1194/chrome-linux/headless_shell', '/b/chromium_headless_shell-1100/chrome-linux/headless_shell']);
  const tree = {
    '/b': ['chromium', 'chromium_headless_shell-1100', 'chromium_headless_shell-1194'],
    '/b/chromium_headless_shell-1194': ['chrome-linux', 'INSTALLATION_COMPLETE'],
    '/b/chromium_headless_shell-1100': ['chrome-linux'],
  };
  const found = findInstalledHeadlessShell(
    '/b',
    (p) => files.has(p),
    (d) => tree[d],
  );
  assert.equal(found, '/b/chromium_headless_shell-1194/chrome-linux/headless_shell');
});

test('findInstalledHeadlessShell is undefined with no browsers path or no shell', () => {
  assert.equal(findInstalledHeadlessShell(undefined), undefined);
  assert.equal(
    findInstalledHeadlessShell(
      '/b',
      () => true,
      () => ['chromium'],
    ),
    undefined,
  );
});

test('browserEnv never overrides the caller or a present pinned build', () => {
  const find = () => '/found';
  assert.deepEqual(browserEnv({ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/mine' }, false, find), {});
  assert.deepEqual(browserEnv({}, true, find), {});
  assert.deepEqual(browserEnv({}, false, find), { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/found' });
  assert.deepEqual(
    browserEnv({}, false, () => undefined),
    {},
  );
});

test('parseThemes defaults to both and rejects others', () => {
  assert.deepEqual(parseThemes(undefined), ['light', 'dark']);
  assert.deepEqual(parseThemes('dark'), ['dark']);
  assert.throws(() => parseThemes('sepia'), /light and\/or dark/);
});

test('parseArgs splits names from options and skips a bare --', () => {
  const { names, options } = parseArgs(['--', 'settings', '--themes', 'dark', 'script', '--out=x'], ['themes', 'out']);
  assert.deepEqual(names, ['settings', 'script']);
  assert.deepEqual(options, { themes: 'dark', out: 'x' });
  assert.throws(() => parseArgs(['--nope'], ['themes']), /unknown option/);
});
