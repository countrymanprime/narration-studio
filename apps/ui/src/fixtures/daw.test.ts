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
});
