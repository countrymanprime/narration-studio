import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { BRAND_FILE, REPOSITORY_ROOT } from './brand.mjs';
import { renameApp } from './rename-app.mjs';
import { TARGETS, staleFiles } from './sync.mjs';

const RETIRED = 'scripts/ci/retired-names.json';
const NEW = 'Ocelot Tape Works';

/** A copy of the files a rename reads and writes. */
function copy() {
  const root = mkdtempSync(join(tmpdir(), 'rename-app-'));
  for (const path of [BRAND_FILE, RETIRED, ...TARGETS.map((target) => target.path)]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(REPOSITORY_ROOT, path), join(root, path));
  }
  return root;
}
const read = (root, path) => readFileSync(join(root, path), 'utf8');

test('a rename writes the new name, retires the old one with its history, and leaves nothing for the sync', () => {
  const root = copy();
  const before = JSON.parse(read(root, BRAND_FILE));
  const result = renameApp(NEW, { root, today: '2030-01-02' });

  const after = JSON.parse(read(root, BRAND_FILE));
  assert.equal(after.name, NEW);
  assert.deepEqual(after.identity, before.identity, 'identity values do not follow a rename');
  assert.deepEqual(JSON.parse(read(root, RETIRED)).at(-1), { words: before.name.toLowerCase().split(' '), retired: '2030-01-02', history: true });
  assert.deepEqual(staleFiles(root), []);
  for (const target of TARGETS.filter((t) => !t.identityOnly)) assert.match(read(root, target.path), new RegExp(NEW), target.path);
  assert.ok(result.changed.includes(BRAND_FILE) && result.changed.includes(RETIRED));
  assert.match(result.todo.join('\n'), /guide-screenshots\.mjs --all/);
  assert.match(result.todo.join('\n'), /repository-rename\.md/);
});

test('a dry run reports the same files and writes nothing', () => {
  const root = copy();
  const brand = read(root, BRAND_FILE);
  const retired = read(root, RETIRED);
  const result = renameApp(NEW, { root, dryRun: true });
  assert.equal(read(root, BRAND_FILE), brand);
  assert.equal(read(root, RETIRED), retired);
  assert.ok(result.changed.length > 2);
  assert.deepEqual(renameApp(NEW, { root: copy() }).changed, result.changed);
});

test('a name that is not valid, the current name or a retired name is refused, and nothing is written', () => {
  const root = copy();
  const brand = read(root, BRAND_FILE);
  const current = JSON.parse(brand).name;
  const retired = JSON.parse(read(root, RETIRED))[0].words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
  assert.throws(() => renameApp('ocelot tape', { root }), /not a valid name/);
  assert.throws(() => renameApp(current, { root }), /already called/);
  assert.throws(() => renameApp(retired, { root }), /retired name/);
  assert.equal(read(root, BRAND_FILE), brand);
});
