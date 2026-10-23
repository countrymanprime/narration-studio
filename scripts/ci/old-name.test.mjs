import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadBrand } from '../brand/brand.mjs';
import { checkFolder, checkTracked, findOldName, zipEntryNames } from './old-name.mjs';

// The current name and its file names, from config/brand.json: they must pass.
const BRAND = loadBrand();
const EXE = `${BRAND.identity.executable}.exe`;
const PREFIX = BRAND.identity.releaseAssetPrefix;

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

test('no tracked file holds the old name, in its path or its text', () => {
  assert.deepEqual(checkTracked(), []);
});

test('every spelling of the old name is found, in a path and in text', () => {
  for (const spelling of spellings) {
    assert.equal(findOldName(`line one\nsee ${spelling}/x`).length, 1, spelling);
    assert.deepEqual(
      checkTracked([`docs/${spelling}.md`], new Map([[`docs/${spelling}.md`, '']])),
      [`docs/${spelling}.md: the path holds the old name`],
    );
  }
});

test('the product name and look-alikes pass', () => {
  for (const text of [PREFIX, BRAND.name, BRAND.name.replaceAll(' ', '').toLowerCase(), 'narration utilities', 'narration_util', 'test-utils']) {
    assert.deepEqual(findOldName(text), [], text);
  }
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
  assert.deepEqual(zipEntryNames(storedZip([EXE, `${OLD.join('-')}.exe`])), [EXE, `${OLD.join('-')}.exe`]);
  assert.equal(zipEntryNames(Buffer.from('bytes of a file')), null);
  const dir = mkdtempSync(join(tmpdir(), 'old-name-zip-'));
  writeFileSync(join(dir, `${PREFIX}-1.0.0-windows-x64.zip`), storedZip([`${OLD.join('-')}.exe`]));
  assert.deepEqual(checkFolder(dir), [`${PREFIX}-1.0.0-windows-x64.zip!${OLD.join('-')}.exe: the name holds the old name`]);
});

test('a built folder is checked by file name and by text, and a binary file only by name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'old-name-'));
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'index.html'), `<title>${BRAND.name}</title>`);
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

