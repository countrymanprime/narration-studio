// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// SN0-Q4 / SNP-Q4: the overview draws no timer figure, hours-per-finished-hour or effective rate, so a plan with a royalty share or
// no rate ("no PFH rate") never shows one. The figures it does draw are the mock's; those three have no mock equivalent here.
describe('no-pfh-rate-case', () => {
  const dir = __dirname;
  const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && f !== 'noEffectiveRate.test.ts' && f !== 'overviewFixtures.ts');
  test.each(['effectiveRate', 'pfh', 'hoursLogged'])('no source in the folder mentions %s', (word) => {
    for (const file of sources) expect(readFileSync(join(dir, file), 'utf8').toLowerCase(), file).not.toContain(word.toLowerCase());
  });
  test('the folder has sources to scan', () => expect(sources.length).toBeGreaterThan(6));
});
