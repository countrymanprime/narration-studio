import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadBrand } from '../brand/brand.mjs';

const BRAND = loadBrand();
const PREFIX = BRAND.identity.releaseAssetPrefix;
const EXE = `${BRAND.identity.executable}.exe`;
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const script = fileURLToPath(new URL('./generate-notes.mjs', import.meta.url));

function releaseNotes(env) {
  const dir = mkdtempSync(join(tmpdir(), 'notes-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'feat: a thing');
  git('tag', 'v0.1.0-rc');
  const destination = join(dir, 'notes.md');
  const result = spawnSync(process.execPath, [script, 'v0.1.0-rc'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, RELEASE_NOTES_FILE: destination, GITHUB_STEP_SUMMARY: '', ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(destination, 'utf8');
}

// Install, the unsigned warning, licences and verification live in the README (one place); the release page shows the changes and
// a single line that links there.
test('the release notes show the changes and one line linking to the README, and none of the install or licence text', () => {
  const notes = releaseNotes({ GITHUB_REPOSITORY: `${BRAND.repository.slug}` });
  const slug = BRAND.repository.slug;

  assert.match(notes, /## Added\n\n- a thing \([0-9a-f]+\)/);
  assert.match(notes, new RegExp(`\\[README\\]\\(https://github\\.com/${esc(slug)}#install-on-windows\\)`));
  assert.match(notes, new RegExp(`\\[licences\\]\\(https://github\\.com/${esc(slug)}#license\\)`));
  assert.equal(notes.trim().split('\n').filter((line) => /README/.test(line)).length, 1);
  for (const gone of ['Installing on Windows', 'Licences and source', 'Verifying this download', 'SmartScreen', 'THIRD-PARTY-NOTICES', 'gh attestation', '-setup.exe', '.zip', EXE]) {
    assert.ok(!notes.includes(gone), `still in the notes: ${gone}`);
  }
});

test('the changes come first and the link line is last', () => {
  const notes = releaseNotes({ GITHUB_REPOSITORY: `${BRAND.repository.slug}` });

  assert.ok(notes.indexOf('## Added') === 0);
  assert.ok(notes.trim().split('\n').at(-1).startsWith('Install, update, licences'));
});

test('the link names the repository the workflow runs in', () => {
  assert.match(releaseNotes({ GITHUB_REPOSITORY: 'someone/else' }), /https:\/\/github\.com\/someone\/else#install-on-windows/);
});

// Runs the script for `tag` in a throwaway repository built from `history`: each step makes an empty commit and/or creates a tag,
// at HEAD or at `at`, and `branch` switches to (creating) a branch at `from`.
function notesFor(tag, history) {
  const dir = mkdtempSync(join(tmpdir(), 'notes-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  for (const step of history) {
    if (step.branch) git('checkout', '-q', '-b', step.branch, step.from);
    if (step.commit) git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', step.commit);
    if (step.tag) git('tag', step.tag, ...(step.at ? [step.at] : []));
  }
  const destination = join(dir, 'notes.md');
  const result = spawnSync(process.execPath, [script, tag], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, RELEASE_NOTES_FILE: destination, GITHUB_STEP_SUMMARY: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(destination, 'utf8');
}

const bullets = (notes) => notes.split('\n').filter((line) => /^- .+ \([0-9a-f]+\)$/.test(line)).map((line) => line.replace(/ \([0-9a-f]+\)$/, ''));

test('the first candidate, with no earlier tag, lists the whole history', () => {
  const notes = notesFor('v0.1.0-rc', [{ commit: 'feat: first' }, { commit: 'fix: second' }, { tag: 'v0.1.0-rc' }]);

  assert.deepEqual(bullets(notes).sort(), ['- first', '- second']);
});

test('a candidate lists only the commits since the previous candidate', () => {
  const notes = notesFor('v0.1.1-rc', [{ commit: 'feat: first' }, { tag: 'v0.1.0-rc' }, { commit: 'fix: second' }, { commit: 'feat: third' }, { tag: 'v0.1.1-rc' }]);

  assert.deepEqual(bullets(notes).sort(), ['- second', '- third']);
});

test('the first candidate after a promotion lists only the commits since the promotion', () => {
  const notes = notesFor('v0.2.1-rc', [
    { commit: 'feat: old' }, { tag: 'v0.2.0-rc' }, { tag: 'v0.2.0', at: 'v0.2.0-rc' },
    { commit: 'fix: new' }, { tag: 'v0.2.1-rc' },
  ]);

  assert.deepEqual(bullets(notes), ['- new']);
});

test('a stable release lists every commit since the previous stable release, across its candidates', () => {
  const notes = notesFor('v0.3.0', [
    { commit: 'feat: before' }, { tag: 'v0.2.0-rc' }, { tag: 'v0.2.0', at: 'v0.2.0-rc' },
    { commit: 'fix: one' }, { tag: 'v0.2.1-rc' }, { commit: 'feat: two' }, { tag: 'v0.3.0-rc' }, { tag: 'v0.3.0', at: 'v0.3.0-rc' },
  ]);

  assert.deepEqual(bullets(notes).sort(), ['- one', '- two']);
});

test('the first stable release after several candidates lists the whole history', () => {
  const notes = notesFor('v0.1.2', [
    { commit: 'feat: a' }, { tag: 'v0.1.0-rc' }, { commit: 'fix: b' }, { tag: 'v0.1.1-rc' },
    { commit: 'feat: c' }, { tag: 'v0.1.2-rc' }, { tag: 'v0.1.2', at: 'v0.1.2-rc' },
  ]);

  assert.deepEqual(bullets(notes).sort(), ['- a', '- b', '- c']);
});

test('a tag on another branch is not taken as the previous release', () => {
  const history = [
    { commit: 'feat: base' }, { tag: 'v0.2.0-rc' },
    { branch: 'side', from: 'main', commit: 'fix: side' }, { tag: 'v0.2.1-rc' },
    { branch: 'next', from: 'main', commit: 'feat: mainline' }, { tag: 'v0.2.2-rc' },
  ];

  assert.deepEqual(bullets(notesFor('v0.2.2-rc', history)), ['- mainline']);
  assert.deepEqual(bullets(notesFor('v0.2.1-rc', history)), ['- side']);
});
