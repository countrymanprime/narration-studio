import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { BRAND_FILE, REPOSITORY_ROOT, loadBrand } from './brand.mjs';
import { TARGETS, brandValue, renderRegions, staleFiles, sync } from './sync.mjs';

test('every generated brand file and brand region is up to date with the brand file', () => {
  assert.deepEqual(
    staleFiles().map(({ path }) => path),
    [],
    'run `pnpm run brand:sync`',
  );
});

test('a brand region takes the brand value its key names, and an unknown key is refused', () => {
  const brand = loadBrand();
  assert.equal(brandValue(brand, 'repository.url'), brand.repository.url);
  assert.equal(brandValue(brand, 'identity'), undefined);
  assert.equal(renderRegions('# <!-- brand:name -->Old<!-- /brand --> guide', brand), `# <!-- brand:name -->${brand.name}<!-- /brand --> guide`);
  assert.throws(() => renderRegions('<!-- brand:nope -->x<!-- /brand -->', brand, 'a.md'), /a\.md: brand region "nope"/);
  const example = 'write `<!-- brand:name -->` before the name and `<!-- /brand -->` after it';
  assert.equal(renderRegions(example, brand), example);
});

test('sync writes every target from another brand, and a second run changes nothing', () => {
  const root = mkdtempSync(join(tmpdir(), 'brand-sync-'));
  const brand = JSON.parse(readFileSync(join(REPOSITORY_ROOT, BRAND_FILE), 'utf8'));
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, BRAND_FILE), JSON.stringify({ ...brand, name: 'Zebra Audio Lab' }));
  for (const target of TARGETS) mkdirSync(dirname(join(root, target.path)), { recursive: true });
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'a.md'), 'Open <!-- brand:name -->Old Name<!-- /brand -->.\n');
  cpSync(join(REPOSITORY_ROOT, TARGETS[0].path), join(root, TARGETS[0].path));
  cpSync(join(REPOSITORY_ROOT, 'src/studio/desktop/wails.json'), join(root, 'src/studio/desktop/wails.json'));

  assert.deepEqual(sync(root).sort(), [...TARGETS.map((target) => target.path), 'docs/a.md'].sort());
  assert.deepEqual(sync(root), []);
  assert.equal(readFileSync(join(root, 'docs', 'a.md'), 'utf8'), 'Open <!-- brand:name -->Zebra Audio Lab<!-- /brand -->.\n');
  for (const target of TARGETS.filter((t) => !t.identityOnly)) assert.match(readFileSync(join(root, target.path), 'utf8'), /Zebra Audio Lab/, target.path);
});
