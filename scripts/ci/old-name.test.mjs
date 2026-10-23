import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ALLOWED, checkFolder, checkTracked, findOldName } from './old-name.mjs';

// The old name is assembled here so this file does not hold it either.
const OLD = ['narration', 'utils'];
const title = OLD.map((word) => word[0].toUpperCase() + word.slice(1));
const spellings = [
  ...['-', '_', ' ', '', '.'].map((separator) => OLD.join(separator)),
  title.join(' '),
  title.join(''),
  title.join('-'),
  OLD.join('_').toUpperCase(),
];

test('no tracked file holds the old name outside the migration files', () => {
  assert.deepEqual(checkTracked(), []);
});

test('every spelling of the old name is found, in a path and in text', () => {
  for (const spelling of spellings) {
    assert.equal(findOldName(`line one\nsee ${spelling}/x`).length, 1, spelling);
    assert.deepEqual(
      checkTracked([`docs/${spelling}.md`], new Map([[`docs/${spelling}.md`, '']])),
      [`docs/${spelling}.md: the path holds the old name`].concat(missingAllowed()),
    );
  }
});

test('the product name, look-alikes and the allowed files pass', () => {
  for (const text of ['narration-studio', 'Narration Studio', 'narration utilities', 'narration_util', 'narrationstudio']) {
    assert.deepEqual(findOldName(text), [], text);
  }
  const allowed = [...ALLOWED.keys()];
  const texts = new Map(allowed.map((file) => [file, `const old = "${OLD.join('-')}"`]));
  assert.deepEqual(checkTracked(allowed, texts), []);
});

test('an allowed file that is gone must leave the list', () => {
  assert.ok(missingAllowed().length === ALLOWED.size);
});

test('a built folder is checked by file name and by text, and a binary file only by name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'old-name-'));
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'index.html'), '<title>Narration Studio</title>');
  writeFileSync(join(dir, 'docs', 'page.html'), `<p>${OLD.join(' ')}</p>`);
  writeFileSync(join(dir, `${OLD.join('-')}-1.0.0-windows-x64.zip`), Buffer.from([0x50, 0x4b, 0, 1]));
  writeFileSync(join(dir, 'app.bin'), Buffer.concat([Buffer.from([0]), Buffer.from(OLD.join('-'))]));
  assert.deepEqual(
    checkFolder(dir).sort(),
    [`${OLD.join('-')}-1.0.0-windows-x64.zip: the name holds the old name`, `docs/page.html:1: <p>${OLD.join(' ')}</p>`].sort(),
  );
});

function missingAllowed() {
  return [...ALLOWED.keys()].map((file) => `${file} is allowed to hold the old name but is not tracked: remove it from ALLOWED`);
}
