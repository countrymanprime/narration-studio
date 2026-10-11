import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

// The program is AGPL-3.0-or-later and bundles GPL-family code (owner decision D17): the licences and the source offer travel as their own
// release asset, so the notes point at it.
test('the release notes point at the third-party notices and the source offer', () => {
  const notes = releaseNotes({});

  assert.match(notes, /## Licences and source/);
  assert.match(notes, /`narration-utils-0\.1\.0-THIRD-PARTY-NOTICES\.txt`/);
  assert.match(notes, /AGPL-3\.0-or-later/);
});

test('the release notes tell a narrator how to verify a download against the repository that built it', () => {
  const notes = releaseNotes({ GITHUB_REPOSITORY: 'countrymanprime/narration-utils' });

  assert.match(notes, /## Verifying this download/);
  assert.match(notes, /gh attestation verify <file> --repo countrymanprime\/narration-utils/);
});

test('the changes still come first and the verification section last', () => {
  const notes = releaseNotes({ GITHUB_REPOSITORY: 'countrymanprime/narration-utils' });

  assert.ok(notes.indexOf('## Features') > 0);
  assert.ok(notes.indexOf('## Features') < notes.indexOf('## Verifying this download'));
});

test('the verification section names a placeholder when the repository is not known', () => {
  const notes = releaseNotes({ GITHUB_REPOSITORY: '' });

  assert.match(notes, /--repo <owner>\/<repo>/);
});

// The first stable release is unsigned (owner decision D7): the notes say so and say what a narrator will see, instead of leaving the
// SmartScreen warning to look like a fault.
test('the release notes say how to install on Windows and that the download is unsigned', () => {
  const notes = releaseNotes({ GITHUB_REPOSITORY: 'countrymanprime/narration-utils' });

  assert.match(notes, /## Installing on Windows/);
  assert.match(notes, /`narration-utils-0\.1\.0-windows-x64-setup\.exe`/);
  assert.match(notes, /unsigned/i);
  assert.match(notes, /More info/);
  assert.match(notes, /Run anyway/);
  assert.match(notes, /`narration-utils-0\.1\.0-windows-x64\.zip`/);
});

test('the install section comes after the changes and before the verification section', () => {
  const notes = releaseNotes({ GITHUB_REPOSITORY: 'countrymanprime/narration-utils' });

  assert.ok(notes.indexOf('## Features') < notes.indexOf('## Installing on Windows'));
  assert.ok(notes.indexOf('## Installing on Windows') < notes.indexOf('## Verifying this download'));
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
