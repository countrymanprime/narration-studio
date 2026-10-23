// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { monitorDaw } from './EditingOutput';

const caps = (daw: DawCapabilities['daw'], available: boolean | undefined): DawCapabilities => ({
  daw,
  reachable: true,
  capabilities: available === undefined ? {} : { monitor_level: { available, state: 'running', message: '' } as never },
});

describe('monitorDaw', () => {
  it('names the DAW whose monitor level is on', () => {
    expect(monitorDaw(caps('REAPER', true))).toBe('REAPER');
  });
  it.each([
    ['capabilities not read yet', null],
    ['no DAW', caps('none', true)],
    ['the built-in recorder', caps('Built-in', true)],
    ['a capability that is off', caps('REAPER', false)],
    ['a DAW that does not list it', caps('REAPER', undefined)],
  ])('is null for %s', (_name, input) => {
    expect(monitorDaw(input)).toBeNull();
  });
});
