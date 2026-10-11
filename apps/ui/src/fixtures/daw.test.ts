import { describe, expect, it } from 'vitest';
import { DAW_CAPABILITIES } from '../api/contracts/daw';
import { dawCapabilitiesSchema } from '../api/schemas/daw';
import { parseWire } from '../api/wire/parseWire';
import { DAW_SETUPS, type DawSetupId } from './daw';

const SETUP_IDS: DawSetupId[] = ['reaper', 'reaper-off', 'builtin', 'audacity', 'audacity-backups'];

describe('the mock DAW setups', () => {
  it('mock-setups-are-data: holds REAPER, REAPER off, built-in and Audacity with and without backups', () => {
    expect(Object.keys(DAW_SETUPS).sort()).toEqual([...SETUP_IDS].sort());
  });

  it.each(SETUP_IDS)('mock-setups-are-data: %s is a DawCapabilities the schema accepts', (id) => {
    const parsed = parseWire(dawCapabilitiesSchema, DAW_SETUPS[id], { boundary: 'fixtures', payload: id });
    expect(parsed).toEqual(DAW_SETUPS[id]);
  });

  it.each(SETUP_IDS)('mock-setups-are-data: %s names exactly the capabilities the Go catalogue has today', (id) => {
    expect(Object.keys(DAW_SETUPS[id].capabilities).sort()).toEqual(DAW_CAPABILITIES.map((c) => c.key).sort());
  });

  it.each(SETUP_IDS)('mock-setups-are-data: in %s an unavailable capability carries its reason and sentence', (id) => {
    for (const [name, support] of Object.entries(DAW_SETUPS[id].capabilities)) {
      if (support.available) continue;
      expect(support.reason, name).toBeTruthy();
      expect(support.message, name).toBeTruthy();
    }
  });

  it('mock-setups-are-data: REAPER off is the same DAW that cannot be reached, and only reading the saved project still works', () => {
    expect(DAW_SETUPS['reaper-off'].daw).toBe(DAW_SETUPS.reaper.daw);
    expect(DAW_SETUPS['reaper-off'].reachable).toBe(false);
    const stillAvailable = Object.entries(DAW_SETUPS['reaper-off'].capabilities)
      .filter(([, s]) => s.available)
      .map(([name]) => name);
    expect(stillAvailable).toEqual(['project_read']);
  });

  it('mock-setups-are-data: a roll in Audacity is destructive only without backups', () => {
    expect(DAW_SETUPS.audacity.capabilities.punch.destructive).toBe(true);
    expect(DAW_SETUPS['audacity-backups'].capabilities.punch.destructive).toBeUndefined();
  });

  it('ui-mirror-names-exactly-the-go-catalogue: the four edit capabilities follow macro_render, in Go order', () => {
    const keys = DAW_CAPABILITIES.map((c) => c.key);
    const at = keys.indexOf('macro_render');
    expect(keys.slice(at + 1, at + 5)).toEqual(['cut_range', 'fx_range', 'stack_takes', 'backups']);
    expect(DAW_CAPABILITIES.slice(at + 1, at + 5).map((c) => c.label)).toEqual([
      'Cut words and audio',
      'Add an effect to words',
      'Stack takes',
      'Audio backups',
    ]);
  });

  it.each(['reaper', 'reaper-off'] as const)(
    'ui-mirror-names-exactly-the-go-catalogue: %s declares the edit capabilities not yet available with the host sentence',
    (id) => {
      for (const { key, label } of DAW_CAPABILITIES.filter((c) => ['cut_range', 'fx_range', 'stack_takes', 'backups'].includes(c.key))) {
        expect(DAW_SETUPS[id].capabilities[key], key).toEqual({
          level: 'not_yet_available',
          available: false,
          reason: 'not_yet',
          message: `${label} is not available with REAPER yet.`,
        });
      }
    },
  );

  it('ui-mirror-names-exactly-the-go-catalogue: Audacity with backups still has no backups role here', () => {
    expect(DAW_SETUPS['audacity-backups'].capabilities.backups).toEqual(DAW_SETUPS.audacity.capabilities.backups);
    expect(DAW_SETUPS['audacity-backups'].capabilities.backups.level).toBe('not_yet_available');
  });
});
