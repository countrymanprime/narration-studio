import assert from 'node:assert/strict';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { MOCK_DIR, RAIL_LABELS, capture, outputName, parseArgs } from '../dev/capture-studio-next-mock.mjs';
import { REPO_ROOT } from './layout.mjs';

const insideRepo = (p) => !relative(REPO_ROOT, resolve(p)).startsWith('..');

/** A fake browser that records every call, so no Chromium and no network are needed. */
function fakes({ mockModules = true } = {}) {
  const calls = [];
  const writes = [];
  const page = new Proxy(
    {},
    {
      get: (target, name) =>
        name in target || name === 'then'
          ? target[name]
          : async (...args) => {
              calls.push([name, ...args]);
              if (name === 'screenshot') writes.push(args[0].path);
            },
    },
  );
  page.keyboard = { press: async (...a) => calls.push(['keyboard.press', ...a]) };
  page.mouse = { click: async (...a) => calls.push(['mouse.click', ...a]) };
  const deps = {
    hasMockModules: () => mockModules,
    build: (outDir) => {
      calls.push(['build', outDir]);
      return join(outDir, 'index.html');
    },
    makeTempDir: (prefix) => {
      const dir = join(tmpdir(), `${prefix}fake`);
      calls.push(['makeTempDir', dir]);
      return dir;
    },
    ensureDir: (dir) => calls.push(['ensureDir', dir]),
    removeDir: (dir) => calls.push(['removeDir', dir]),
    fontCss: () => '/* fonts */',
    launch: async (browserInfo) => {
      calls.push(['launch', browserInfo]);
      return {
        newContext: async (opts) => {
          calls.push(['newContext', opts]);
          return { newPage: async () => page };
        },
        close: async () => calls.push(['browser.close']),
      };
    },
    log: () => {},
  };
  return { calls, writes, deps };
}

test('parses page, viewport, theme and out dir', () => {
  assert.deepEqual(parseArgs(['--page', 'Production']), {
    page: 'Production',
    viewport: { width: 1440, height: 900 },
    theme: 'light',
    out: undefined,
    mock: undefined,
  });
  const full = parseArgs(['--page', 'Booth', '--viewport', '1280x720', '--theme', 'dark', '--out', 'shots', '--mock', 'setup=builtin']);
  assert.deepEqual(full.viewport, { width: 1280, height: 720 });
  assert.equal(full.theme, 'dark');
  assert.equal(full.out, 'shots');
  assert.deepEqual(full.mock, { name: 'setup', value: 'builtin' });
  assert.throws(() => parseArgs(['--page', 'Booth', '--viewport', '1280']), /WxH/);
  assert.throws(() => parseArgs(['--page', 'Booth', '--theme', 'sepia']), /light|dark/);
  assert.throws(() => parseArgs(['--page', 'Booth', '--mock', 'setup']), /name=value/);
  assert.throws(() => parseArgs([]), /--page/);
});

test('rejects a page label that is not a rail label of the mock', () => {
  assert.deepEqual(RAIL_LABELS, [
    'Production',
    'Schedule',
    'Script',
    'Story Bible',
    'Booth',
    'Editing',
    'Proof',
    'Pickups',
    'Master & QC',
    'Delivery',
    'Settings',
  ]);
  assert.throws(() => parseArgs(['--page', 'Dashboard']), /not a rail label.*Production, Schedule/);
  assert.throws(() => parseArgs(['--page', 'production']), /not a rail label/);
});

test('names the file <state>-<viewport>.png under the out dir', () => {
  assert.equal(outputName('Production', { width: 1440, height: 900 }), 'production-1440x900.png');
  assert.equal(outputName('Master & QC', { width: 1280, height: 720 }), 'master-qc-1280x720.png');
  assert.equal(outputName('Story Bible', { width: 1440, height: 900 }, { name: 'setup', value: 'builtin' }), 'story-bible-setup-builtin-1440x900.png');
});

test('navigates by the rail aria-label and screenshots at the viewport and colour scheme', async () => {
  const { calls, writes, deps } = fakes();
  const file = await capture(parseArgs(['--page', 'Master & QC', '--theme', 'dark', '--viewport', '1280x720', '--out', '/scratch/shots']), deps);
  assert.equal(file, join('/scratch/shots', 'master-qc-1280x720.png'));
  assert.deepEqual(writes, [file]);
  const ctx = calls.find((c) => c[0] === 'newContext')[1];
  assert.deepEqual(ctx.viewport, { width: 1280, height: 720 });
  assert.equal(ctx.colorScheme, 'dark');
  assert.deepEqual(
    calls.find((c) => c[0] === 'click'),
    ['click', '.rail .nav[aria-label="Master & QC"]'],
  );
  assert.ok(
    calls.some((c) => c[0] === 'addStyleTag' && c[1].content === '/* fonts */'),
    'injects the local @fontsource faces',
  );
  assert.ok(calls.findIndex((c) => c[0] === 'click') < calls.findIndex((c) => c[0] === 'screenshot'), 'navigates before the screenshot');
  const names = calls.map((c) => c[0]);
  assert.ok(names.indexOf('browser.close') > names.indexOf('screenshot'), 'closes the browser after the screenshot');
  assert.ok(
    calls.some((c) => c[0] === 'removeDir'),
    'removes the temp build',
  );
});

test('sets a mock state through #mockbtn before the screenshot', async () => {
  const { calls, deps } = fakes();
  await capture(parseArgs(['--page', 'Booth', '--mock', 'setup=builtin', '--out', '/scratch']), deps);
  const names = calls.map((c) => c[0]);
  assert.deepEqual(
    calls.filter((c) => c[0] === 'click').map((c) => c[1]),
    ['.rail .nav[aria-label="Booth"]', '#mockbtn'],
  );
  assert.deepEqual(
    calls.find((c) => c[0] === 'check'),
    ['check', 'input[name="setup"][value="builtin"]'],
  );
  assert.ok(names.indexOf('check') < names.indexOf('screenshot'));
});

test("fails with a clear message and no network attempt when the mock's node_modules is missing", async () => {
  const { calls, deps } = fakes({ mockModules: false });
  await assert.rejects(capture(parseArgs(['--page', 'Production']), deps), (err) => {
    assert.match(err.message, /npm ci/);
    assert.ok(err.message.includes('docs/research/mockups/studio-next'));
    return true;
  });
  assert.deepEqual(calls, [], 'no build, no browser, no directory was touched');
});

test('never writes inside the mock folder or the repo tree unless --out says so', async () => {
  const { calls, writes, deps } = fakes();
  const file = await capture(parseArgs(['--page', 'Proof']), deps);
  const touched = [...calls.filter((c) => ['build', 'makeTempDir', 'ensureDir'].includes(c[0])).map((c) => c[1]), ...writes, file];
  assert.ok(touched.length >= 3);
  for (const p of touched) {
    assert.ok(!insideRepo(p), `${p} is inside the repo tree`);
    assert.ok(!resolve(p).startsWith(MOCK_DIR), `${p} is inside the mock folder`);
  }
  const explicit = fakes();
  const inRepo = await capture(parseArgs(['--page', 'Proof', '--out', join(REPO_ROOT, 'scratch-shots')]), explicit.deps);
  assert.ok(insideRepo(inRepo), '--out is honoured even inside the repo');
});
