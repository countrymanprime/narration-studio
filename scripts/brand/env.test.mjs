import assert from 'node:assert/strict';
import test from 'node:test';

import { IDENTITY_KEYS, loadBrand } from './brand.mjs';
import { envLines, variableName } from './env.mjs';

test('a workflow gets the name, the repository and every identity value, one KEY=value line each', () => {
  const brand = loadBrand();
  const lines = envLines(brand);
  assert.ok(lines.includes(`BRAND_NAME=${brand.name}`));
  assert.ok(lines.includes(`BRAND_REPOSITORY=${brand.repository.slug}`));
  assert.ok(lines.includes(`BRAND_EXECUTABLE=${brand.identity.executable}`));
  assert.ok(lines.includes(`BRAND_ENV_PREFIX=${brand.identity.envPrefix}`));
  assert.equal(lines.length, 2 + Object.keys(IDENTITY_KEYS).length);
  assert.equal(variableName('reaperExtPrefix'), 'BRAND_REAPER_EXT_PREFIX');
});

test('a value with a line break is refused, so it cannot add a variable of its own to $GITHUB_ENV', () => {
  const brand = loadBrand();
  assert.throws(() => envLines({ ...brand, name: 'Zebra\nGITHUB_PATH=/x' }), /line break/);
});
