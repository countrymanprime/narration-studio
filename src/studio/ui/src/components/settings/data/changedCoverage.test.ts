// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CUSTOM } from '../controls/registry';
import { ROWS } from '../registry/rows';
import { BROWSER_CHANGED } from './browserValues';
import { CHANGED_EXEMPT, CUSTOM_CHANGED, changedIsCovered } from './customChanged';

// The class guard for issue 2636: the Changed filter must be able to see every row of every scope and kind. A row it cannot see must say why.
describe('Changed covers every row', () => {
  it('every row has a host field, a window reader, a probe or a stated exemption', () => {
    expect(ROWS.filter((row) => !changedIsCovered(row)).map((row) => row.id)).toEqual([]);
  });

  it('a row is covered one way only', () => {
    for (const row of ROWS) {
      const ways = [Boolean(row.field && !CUSTOM[row.id]), row.id in BROWSER_CHANGED, row.id in CUSTOM_CHANGED, row.id in CHANGED_EXEMPT];
      expect(ways.filter(Boolean).length, row.id).toBeLessThanOrEqual(1);
    }
  });

  it('an exemption is for a row with a custom body, names one of the three kinds and gives a specific reason', () => {
    for (const [id, { kind, reason }] of Object.entries(CHANGED_EXEMPT)) {
      const row = ROWS.find((candidate) => candidate.id === id);
      expect(row, id).toBeTruthy();
      expect(row?.field, id).toBeUndefined();
      expect(['report', 'action', 'unmarked-default'], id).toContain(kind);
      expect(reason.length, id).toBeGreaterThan(40);
      // A reason for a setting nobody can compare names what the default is.
      if (kind === 'unmarked-default') expect(reason, id).toMatch(/default|shipped/);
    }
  });

  // The list shrinks as rows get probes. A new entry needs this number raised in the same change, which a reviewer sees.
  it('the exemption list does not grow silently', () => {
    expect(Object.keys(CHANGED_EXEMPT).length).toBeLessThanOrEqual(9);
  });

  it('a probe or a window reader names a row that exists', () => {
    const ids = new Set(ROWS.map((row) => row.id));
    for (const id of [...Object.keys(CUSTOM_CHANGED), ...Object.keys(BROWSER_CHANGED)]) expect(ids.has(id), id).toBe(true);
  });
});
