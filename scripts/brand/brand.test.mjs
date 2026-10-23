import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { BRAND_FILE, IDENTITY_KEYS, REPOSITORY_ROOT, deriveBrand, loadBrand, nameForms, validateBrand } from './brand.mjs';

const file = () => JSON.parse(readFileSync(join(REPOSITORY_ROOT, BRAND_FILE), 'utf8'));

test('the brand file is valid', () => {
  assert.deepEqual(validateBrand(file()), []);
  assert.equal(loadBrand().name, file().name);
});

test('every spelling is derived from the display name', () => {
  assert.deepEqual(nameForms('Ocelot Tape Works'), {
    name: 'Ocelot Tape Works',
    slug: 'ocelot-tape-works',
    snake: 'ocelot_tape_works',
    constant: 'OCELOT_TAPE_WORKS',
    pascal: 'OcelotTapeWorks',
  });
  assert.equal(nameForms('Lab 9').slug, 'lab-9');
});

test('the repository URLs come from the owner and the repository name', () => {
  const brand = deriveBrand({ ...file(), repository: { owner: 'someone', name: 'ocelot-tape-works' } });
  assert.equal(brand.repository.url, 'https://github.com/someone/ocelot-tape-works');
  assert.equal(brand.repository.pagesUrl, 'https://someone.github.io/ocelot-tape-works/');
});

test('a display name of the wrong shape, and a missing or unknown identity value are refused', () => {
  const valid = file();
  for (const name of ['', 'zebra lab', 'Zebra  Lab', ' Zebra', 'Zebra-Lab']) {
    assert.match(validateBrand({ ...valid, name }).join('\n'), /^name:/, name);
  }
  const { dataFolder: _, ...missing } = valid.identity;
  assert.match(validateBrand({ ...valid, identity: missing }).join('\n'), /identity\.dataFolder/);
  assert.match(validateBrand({ ...valid, identity: { ...valid.identity, extra: 'x' } }).join('\n'), /identity\.extra: not a known/);
  assert.throws(() => deriveBrand({ ...valid, name: 'x' }), /config\/brand\.json is not valid/);
});

test('every identity value names what it is', () => {
  assert.deepEqual(Object.keys(file().identity).sort(), Object.keys(IDENTITY_KEYS).sort());
});
