import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { brand } from './brand.gen';

// brand.gen.ts is written by scripts/brand/sync.mjs; this fails when it was edited by hand or config/brand.json changed
// without `pnpm run brand:sync`.
test('the generated brand module matches config/brand.json', () => {
  const file = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', 'config', 'brand.json'), 'utf8'));
  expect(brand.name).toBe(file.name);
  expect(brand.identity).toEqual(file.identity);
  expect(brand.retiredNames).toEqual(file.retiredNames);
  expect(brand.repository.url).toBe(`https://github.com/${file.repository.owner}/${file.repository.name}`);
});
