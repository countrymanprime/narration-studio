import { describe, expect, it } from 'vitest';
import type { DawCapabilities, DawCapabilityLevel } from '../../../api/contracts/daw';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { dawCannotPlay, playRoute } from './playRoute';

const withTransport = (level: DawCapabilityLevel, available = true): DawCapabilities => ({
  ...DAW_SETUPS.reaper,
  capabilities: { ...DAW_SETUPS.reaper.capabilities, transport_sync: { level, available, ...(available ? {} : { message: 'Off.' }) } },
});

describe('playRoute', () => {
  it('waits for the first answer', () => {
    expect(playRoute(null)).toEqual({ kind: 'unknown' });
  });
  it('lets the app play with no DAW, the built-in recorder, or an engine with no transport it can drive', () => {
    expect(playRoute({ ...DAW_SETUPS.builtin, daw: 'none' })).toEqual({ kind: 'app' });
    expect(playRoute(DAW_SETUPS.builtin)).toEqual({ kind: 'app' });
    expect(playRoute(withTransport('unsupported', false))).toEqual({ kind: 'app' });
    expect(playRoute(withTransport('not_yet_available', false))).toEqual({ kind: 'app' });
    const without = Object.fromEntries(Object.entries(DAW_SETUPS.reaper.capabilities).filter(([key]) => key !== 'transport_sync'));
    expect(playRoute({ ...DAW_SETUPS.reaper, capabilities: without })).toEqual({ kind: 'app' });
  });
  it('gives the chapter to a linked DAW that can drive its transport, also while it cannot play now', () => {
    expect(playRoute(withTransport('experimental'))).toEqual({ kind: 'daw', name: 'REAPER' });
    expect(playRoute(withTransport('supported'))).toEqual({ kind: 'daw', name: 'REAPER' });
    expect(playRoute(withTransport('experimental', false))).toEqual({ kind: 'daw', name: 'REAPER' });
    expect(playRoute(DAW_SETUPS['reaper-off'])).toEqual({ kind: 'daw', name: 'REAPER' });
  });
});

describe('dawCannotPlay', () => {
  it("is the capability's sentence while it is unavailable", () => {
    expect(dawCannotPlay(withTransport('experimental', false), 'REAPER')).toBe('Off.');
  });
  it('names a lease that is not answered while the capability is available', () => {
    expect(dawCannotPlay(withTransport('experimental'), 'REAPER')).toMatch(/has not answered, or has another project open/);
  });
});
