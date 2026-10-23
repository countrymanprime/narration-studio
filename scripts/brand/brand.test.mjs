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
  assert.deepEqual(nameForms('Zebra Audio Lab'), {
    name: 'Zebra Audio Lab',
    slug: 'zebra-audio-lab',
    snake: 'zebra_audio_lab',
    constant: 'ZEBRA_AUDIO_LAB',
    pascal: 'ZebraAudioLab',
  });
  assert.equal(nameForms('Lab 9').slug, 'lab-9');
});

test('the repository URLs come from the owner and the repository name', () => {
  const brand = deriveBrand({ ...file(), repository: { owner: 'someone', name: 'zebra-audio-lab' } });
  assert.equal(brand.repository.url, 'https://github.com/someone/zebra-audio-lab');
  assert.equal(brand.repository.pagesUrl, 'https://someone.github.io/zebra-audio-lab/');
});

test('a display name of the wrong shape, a missing or unknown identity value and a retired current name are refused', () => {
  const valid = file();
  for (const name of ['', 'zebra lab', 'Zebra  Lab', ' Zebra', 'Zebra-Lab']) {
    assert.match(validateBrand({ ...valid, name }).join('\n'), /^name:/, name);
  }
  const { dataFolder: _, ...missing } = valid.identity;
  assert.match(validateBrand({ ...valid, identity: missing }).join('\n'), /identity\.dataFolder/);
  assert.match(validateBrand({ ...valid, identity: { ...valid.identity, extra: 'x' } }).join('\n'), /identity\.extra: not a known/);
  assert.match(validateBrand({ ...valid, retiredNames: [valid.name] }).join('\n'), /holds the current name/);
  assert.throws(() => deriveBrand({ ...valid, name: 'x' }), /config\/brand\.json is not valid/);
});

test('every identity value names what it is', () => {
  assert.deepEqual(Object.keys(file().identity).sort(), Object.keys(IDENTITY_KEYS).sort());
});
