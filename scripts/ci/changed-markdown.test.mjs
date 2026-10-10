import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { changedMarkdownFiles, isMarkdownFile, parseChangedFiles } from './changed-markdown.mjs';

test('parseChangedFiles reads an added and a modified file', () => {
  const output = ['A', 'docs/adr/0415-new.md', 'M', 'README.md'].join('\0') + '\0';

  assert.deepEqual(parseChangedFiles(output), ['docs/adr/0415-new.md', 'README.md']);
});

test('parseChangedFiles takes the new path of a rename, not the old one', () => {
  const output = ['R100', 'docs/old-name.md', 'docs/new-name.md'].join('\0') + '\0';

  assert.deepEqual(parseChangedFiles(output), ['docs/new-name.md']);
});

test('parseChangedFiles takes the new path of a copy', () => {
  const output = ['C75', 'docs/source.md', 'docs/copy.md'].join('\0') + '\0';

  assert.deepEqual(parseChangedFiles(output), ['docs/copy.md']);
});

test('parseChangedFiles reports nothing for empty output', () => {
  assert.deepEqual(parseChangedFiles(''), []);
});

test('isMarkdownFile matches .md case-insensitively and rejects everything else', () => {
  assert.equal(isMarkdownFile('docs/adr/0415-new.md'), true);
  assert.equal(isMarkdownFile('README.MD'), true);
  assert.equal(isMarkdownFile('apps/desktop/app.go'), false);
  assert.equal(isMarkdownFile('docs/adr/0415-new.md.bak'), false);
});

test('changedMarkdownFiles with includeWorkingTree also reports an uncommitted edit and an untracked file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'changed-md-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
  try {
    git('init', '-q');
    writeFileSync(join(dir, 'a.md'), 'one\n');
    writeFileSync(join(dir, 'b.md'), 'one\n');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
    writeFileSync(join(dir, 'a.md'), 'two\n');
    writeFileSync(join(dir, 'c.md'), 'new\n');
    writeFileSync(join(dir, 'note.txt'), 'not markdown\n');

    assert.deepEqual(changedMarkdownFiles({ base: 'HEAD', cwd: dir }), []);
    assert.deepEqual(changedMarkdownFiles({ base: 'HEAD', cwd: dir, includeWorkingTree: true }).sort(), ['a.md', 'c.md']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
