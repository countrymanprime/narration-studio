// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { announceBrowserSettingChange } from '../../../browserSettings';
import { projectDataChanged } from './projectDataSignal';
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
    // Three rows read the delivery profiles; they share one call.
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

describe('saving the types, the marks or the credits asks the probes again', () => {
  it('reads the four project rows once more after a save, and only then', async () => {
    const api = createMockApi();
    const types = vi.spyOn(api, 'guideTypesChanged');
    const credits = vi.spyOn(api, 'creditsChanged');
    render(
      <ApiProvider api={api}>
        <Probe onSet={() => undefined} />
      </ApiProvider>,
    );
    await waitFor(() => expect(types).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(credits).toHaveBeenCalledTimes(1);
    projectDataChanged();
    await waitFor(() => expect(types).toHaveBeenCalledTimes(2));
    expect(credits).toHaveBeenCalledTimes(2);
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
  it('voice.mwKey', async () => {
    expect(await run('voice.mwKey', ctx({ pronunciationOnlineKeyStatus: async () => ({ present: false }) }))).toBe(false);
    expect(await run('voice.mwKey', ctx({ pronunciationOnlineKeyStatus: async () => ({ present: true }) }))).toBe(true);
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
  it('delivery.default', async () => {
    const acx = { id: 'acx', version: '2026-09' };
    expect(await run('delivery.default', ctx({}, { delivery: profilesOf({ globalDefault: acx, shippedDefault: acx }) }))).toBe(false);
    expect(await run('delivery.default', ctx({}, { delivery: profilesOf({ globalDefault: { id: 'custom-1' }, shippedDefault: acx }) }))).toBe(true);
    expect(await run('delivery.default', ctx({}, { delivery: profilesOf({ globalDefault: { id: 'acx', version: '2026-10' }, shippedDefault: acx }) }))).toBe(
      true,
    );
  });
  it('project.types', async () => {
    expect(await run('project.types', ctx({ guideTypesChanged: async () => false }))).toBe(false);
    expect(await run('project.types', ctx({ guideTypesChanged: async () => true }))).toBe(true);
  });
  it('project.marks', async () => {
    expect(await run('project.marks', ctx({ marksList: async () => ({ types: [], marks: [], typesChanged: false }) }))).toBe(false);
    expect(await run('project.marks', ctx({ marksList: async () => ({ types: [], marks: [], typesChanged: true }) }))).toBe(true);
  });
  it('project.credits', async () => {
    expect(await run('project.credits', ctx({ creditsChanged: async () => false }))).toBe(false);
    expect(await run('project.credits', ctx({ creditsChanged: async () => true }))).toBe(true);
  });
  it('the delivery rows', async () => {
    expect(await run('delivery.custom', ctx({}, { delivery: profilesOf({}) }))).toBe(false);
    expect(await run('delivery.custom', ctx({}, { delivery: profilesOf({ profiles: [{ builtIn: true }, { builtIn: false }] }) }))).toBe(true);
    expect(await run('delivery.profile', ctx({}, { delivery: profilesOf({}) }))).toBe(false);
    expect(await run('delivery.profile', ctx({}, { delivery: profilesOf({ projectChoice: { id: 'none' } }) }))).toBe(true);
  });
});
