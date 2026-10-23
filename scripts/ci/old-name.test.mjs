import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ALLOWED, checkFolder, checkTracked, findOldName, zipEntryNames } from './old-name.mjs';

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

test('an allowed file that is gone, or no longer holds the old name, must leave the list', () => {
  const [kept, ...rest] = [...ALLOWED.keys()];
  const texts = new Map([[kept, 'nothing old here']]);
  assert.deepEqual(checkTracked([kept], texts), [
    `${kept} is allowed to hold the old name but does not: remove it from ALLOWED`,
    ...rest.map((file) => `${file} is allowed to hold the old name but is not tracked: remove it from ALLOWED`),
  ]);
});

test('the old name split across a wrapped line is found, on the line where it starts', () => {
  const [first, second] = title;
  for (const text of [
    `a "${first}\n${second}" label`,
    `// the "${first}\n// ${second}" track`,
    `> ${first}\n> ${second}`,
    `${first}  \r\n   ${second.toUpperCase()}`,
  ]) {
    assert.deepEqual(
      findOldName(`zero\n${text}`).map((hit) => hit.line),
      [2],
      JSON.stringify(text),
    );
  }
  assert.deepEqual(findOldName(`${first}\n\n${second}`), [], 'a blank line between is two sentences');
  assert.deepEqual(findOldName(`${first} Studio\n${second}`), []);
});

test('a zip is checked by the names inside it', () => {
  assert.deepEqual(zipEntryNames(storedZip(['narration-studio.exe', `${OLD.join('-')}.exe`])), ['narration-studio.exe', `${OLD.join('-')}.exe`]);
  assert.equal(zipEntryNames(Buffer.from('bytes of a file')), null);
  const dir = mkdtempSync(join(tmpdir(), 'old-name-zip-'));
  writeFileSync(join(dir, 'narration-studio-1.0.0-windows-x64.zip'), storedZip([`${OLD.join('-')}.exe`]));
  assert.deepEqual(checkFolder(dir), [`narration-studio-1.0.0-windows-x64.zip!${OLD.join('-')}.exe: the name holds the old name`]);
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

// A zip of empty, stored files: a local header and a central-directory entry per name, then the end record.
function storedZip(names) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const name of names) {
    const bytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(bytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(bytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, bytes);
    central.push(entry, bytes);
    offset += 30 + bytes.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function missingAllowed() {
  return [...ALLOWED.keys()].map((file) => `${file} is allowed to hold the old name but is not tracked: remove it from ALLOWED`);
}
