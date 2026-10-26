import { describe, expect, it } from 'vitest';
import { wholePage } from './catalog/shared';
import { STATE_CATALOG } from './state-catalog';

// A whole-page row is its base row grown to the full height. The base row's own sameAs compares two window-sized pictures, so the
// whole-page row must not inherit it; the whole run then reported it stale (storybible/whole-page took entity-selected's sameAs of
// category-all, #2251).
describe('wholePage', () => {
  it('does-not-inherit-the-base-rows-sameAs', () => {
    const row = wholePage([{ page: 'p', state: 'b', description: 'd', sameAs: { of: 'p/a', reason: 'r' } }], 'b');
    expect(row.sameAs).toBeUndefined();
  });

  it('declares-sameAs-only-for-the-widths-the-page-fits', () => {
    const row = wholePage([{ page: 'p', state: 'b', description: 'd', sameAs: { of: 'p/a', reason: 'r' } }], 'b', ['tablet']);
    expect(row.sameAs).toMatchObject({ of: 'p/b', viewports: ['tablet'] });
  });

  it('every-catalogued-whole-page-row-is-same-only-as-its-own-base', () => {
    for (const row of STATE_CATALOG.filter((r) => r.state === 'whole-page' && r.sameAs))
      expect(row.sameAs!.viewports, `${row.page}/whole-page declares sameAs at every width`).toBeDefined();
  });
});
