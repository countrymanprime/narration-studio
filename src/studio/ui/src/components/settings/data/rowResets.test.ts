import { describe, expect, it } from 'vitest';
import { ROWS } from '../registry/rows';
import { BROWSER_CHANGED } from './browserValues';
import { CUSTOM_CHANGED, LIVE_CHANGED } from './customChanged';
import { isResettable, RESET_BY_ROW, RESETTABLE_ROWS } from './rowResets';

const changedReadable = [...Object.keys(BROWSER_CHANGED), ...Object.keys(CUSTOM_CHANGED), ...Object.keys(LIVE_CHANGED)];

describe('the header Reset to defaults and the Changed marks (issue 2605)', () => {
  it('every row Changed can mark is put back by Reset, or left to its own row with a stated reason', () => {
    const left = changedReadable.filter((id) => !(RESETTABLE_ROWS as readonly string[]).includes(id) && !(id in RESET_BY_ROW));
    expect(left, 'a Changed row the header Reset neither resets nor lists in RESET_BY_ROW').toEqual([]);
  });

  it('lists as left-to-its-own-row only rows Changed marks and Reset does not reset, each with a reason', () => {
    for (const [id, reason] of Object.entries(RESET_BY_ROW)) {
      expect(changedReadable, `${id} is listed but Changed does not read it`).toContain(id);
      expect(RESETTABLE_ROWS as readonly string[], `${id} is listed but also reset`).not.toContain(id);
      expect(reason.length, `${id} needs a reason`).toBeGreaterThan(30);
    }
    expect(Object.keys(RESET_BY_ROW).length, 'the list grew; give the row a reset instead').toBeLessThanOrEqual(6);
  });

  it('resets only rows that exist, and counts a row with a host field as reset', () => {
    const ids = new Set(ROWS.map((row) => row.id));
    for (const id of RESETTABLE_ROWS) expect(ids.has(id), `${id} is not a Settings row`).toBe(true);
    expect(isResettable({ id: 'app.channel', field: { tool: 'Updates', key: 'channel' } })).toBe(true);
    expect(isResettable({ id: 'daw.voices' })).toBe(false);
    expect(isResettable({ id: 'look.theme' })).toBe(true);
  });
});
