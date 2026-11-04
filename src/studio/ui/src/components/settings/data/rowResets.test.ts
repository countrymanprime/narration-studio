import { describe, expect, it } from 'vitest';
import { ROWS } from '../registry/rows';
import { BROWSER_CHANGED } from './browserValues';
import { CHANGED_EXEMPT, CUSTOM_CHANGED, LIVE_CHANGED } from './customChanged';
import { isResettable, RESETTABLE_ROWS } from './rowResets';

const changedReadable = [...Object.keys(BROWSER_CHANGED), ...Object.keys(CUSTOM_CHANGED), ...Object.keys(LIVE_CHANGED)];

describe('the header Reset to defaults and the Changed marks (issue 2605)', () => {
  it('every row Changed can mark is put back by the header Reset, and every row Reset puts back is one Changed can mark', () => {
    const resettable = [...RESETTABLE_ROWS] as string[];
    expect(
      changedReadable.filter((id) => !resettable.includes(id)),
      'a Changed row the header Reset does not reset',
    ).toEqual([]);
    expect(
      resettable.filter((id) => !changedReadable.includes(id)),
      'a Reset the Changed filter cannot see',
    ).toEqual([]);
  });

  it('a row Changed does not count is one nothing resets', () => {
    for (const id of Object.keys(CHANGED_EXEMPT)) {
      expect(changedReadable, `${id} is exempt from Changed but read`).not.toContain(id);
      expect(RESETTABLE_ROWS as readonly string[], `${id} is exempt from Changed but reset`).not.toContain(id);
    }
  });

  it('resets only rows that exist, and counts a row with a host field as reset', () => {
    const ids = new Set(ROWS.map((row) => row.id));
    for (const id of RESETTABLE_ROWS) expect(ids.has(id), `${id} is not a Settings row`).toBe(true);
    expect(isResettable({ id: 'app.channel', field: { tool: 'Updates', key: 'channel' } })).toBe(true);
    expect(isResettable({ id: 'daw.voices' })).toBe(false);
    expect(isResettable({ id: 'look.theme' })).toBe(true);
  });
});
