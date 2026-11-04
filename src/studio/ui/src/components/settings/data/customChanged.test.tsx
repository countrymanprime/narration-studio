// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { announceBrowserSettingChange } from '../../../browserSettings';
import { CUSTOM_CHANGED, useCustomChanged, type ProbeContext } from './customChanged';
import type { ReadSettings } from './values';

afterEach(cleanup);

const settings: ReadSettings = {};
function Probe({ onSet }: { onSet: (set: ReadonlySet<string>) => void }) {
  onSet(useCustomChanged(settings));
  return null;
}

describe('the custom-row probes', () => {
  it('run once per mount, share one delivery read, and again only for a change', async () => {
    const api = createMockApi();
    const zoom = vi.spyOn(api, 'windowZoom');
    const profiles = vi.spyOn(api, 'deliveryProfiles');
    const seen: ReadonlySet<string>[] = [];
    const { rerender } = render(
      <ApiProvider api={api}>
        <Probe onSet={(set) => seen.push(set)} />
      </ApiProvider>,
    );
    await waitFor(() => expect(zoom).toHaveBeenCalledTimes(1));
    // The delivery row reads the profiles once per pass.
    expect(profiles).toHaveBeenCalledTimes(1);

    // Re-rendering with nothing changed reads nothing more.
    rerender(
      <ApiProvider api={api}>
        <Probe onSet={(set) => seen.push(set)} />
      </ApiProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(zoom).toHaveBeenCalledTimes(1);

    // A window-kept write asks again, once.
    announceBrowserSettingChange();
    await waitFor(() => expect(zoom).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(zoom).toHaveBeenCalledTimes(2);
    expect(profiles).toHaveBeenCalledTimes(2);

    // An answer equal to the last one keeps the same set, so nothing downstream redraws.
    const last = seen[seen.length - 1];
    expect(seen.filter((set) => set === last).length).toBeGreaterThan(0);
  });
});

describe('each probe says changed for a changed value and not for the default', () => {
  const profilesOf = (over: object) => async () =>
    ({ profiles: [{ builtIn: true }], globalDefault: { id: 'builtin' }, hasProject: true, projectChoice: null, projectProfile: '', ...over }) as never;
  const ctx = (api: object, extra: Partial<ProbeContext> = {}): ProbeContext => ({
    api: api as ProbeContext['api'],
    settings: {},
    delivery: profilesOf({}),
    ...extra,
  });
  const run = async (id: string, context: ProbeContext) => CUSTOM_CHANGED[id]!(context);

  it('look.zoom', async () => {
    expect(await run('look.zoom', ctx({ windowZoom: async () => ({ level: 1 }) }))).toBe(false);
    expect(await run('look.zoom', ctx({ windowZoom: async () => ({ level: 1.25 }) }))).toBe(true);
  });
  it('daw.engine', async () => {
    expect(await run('daw.engine', ctx({ dawChoice: async () => ({ chosen: 'REAPER' }) }))).toBe(false);
    expect(await run('daw.engine', ctx({ dawChoice: async () => ({ chosen: null }) }))).toBe(false);
    expect(await run('daw.engine', ctx({ dawChoice: async () => ({ chosen: 'Audacity' }) }))).toBe(true);
  });
  it('keys.map', async () => {
    const keymap = (isSet: boolean) => ({ global: { Keymap: [{ key: 'overrides', isSet }] } }) as never;
    expect(await run('keys.map', ctx({}, { settings: keymap(false) }))).toBe(false);
    expect(await run('keys.map', ctx({}, { settings: keymap(true) }))).toBe(true);
  });
  it('delivery.profile: the project chose something other than the global default', async () => {
    expect(await run('delivery.profile', ctx({}, { delivery: profilesOf({}) }))).toBe(false);
    expect(await run('delivery.profile', ctx({}, { delivery: profilesOf({ projectChoice: { id: 'builtin' } }) }))).toBe(false);
    expect(await run('delivery.profile', ctx({}, { delivery: profilesOf({ projectChoice: { id: 'none' } }) }))).toBe(true);
  });
  it('the data rows are not read: what the narrator entered has no default to differ from', () => {
    for (const id of ['voice.mwKey', 'delivery.custom']) expect(CUSTOM_CHANGED[id], id).toBeUndefined();
  });
});
