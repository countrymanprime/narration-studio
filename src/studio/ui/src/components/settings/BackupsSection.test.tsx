// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { DawCapabilities } from '../../api/contracts/daw';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../fixtures/daw';
import { createMockDawClient, type DawClient } from '../../ports/daw';
import { PortOverrides } from '../../ports/usePort';
import type { NarrationApi, Scope, ScopedSettingField } from '../../types';
import { UnsavedDraftsProvider, useUnsavedDrafts } from '../../studio/drafts/unsavedDrafts';
import { BackupsSection } from './BackupsSection';

afterEach(cleanup);

// The two DAW rows as the host sends them (tests/fixtures/contracts/settings-*.json): the ranges are settings_number.go's.
function field(key: 'backups.window_seconds' | 'backups.retention_days', own = ''): ScopedSettingField {
  const window = key === 'backups.window_seconds';
  return {
    key,
    label: window ? 'Audio kept either side of a punch or an edit (s)' : 'Keep backups for (days)',
    kind: 'number',
    choices: [],
    value: own,
    isSet: own !== '',
    effectiveValue: own || (window ? '120' : '7'),
    effectiveSource: own ? 'global' : 'repo_default',
    number: window ? { min: 10, max: 300, step: 10, unit: 's' } : { min: 1, max: 365, step: 1, unit: 'days' },
  };
}

type Layers = Record<Scope, ScopedSettingField[]>;
const defaults = (): Layers => ({
  global: [field('backups.window_seconds'), field('backups.retention_days')],
  project: [field('backups.window_seconds'), field('backups.retention_days')],
});

function renderSection({
  setup = 'audacity',
  caps,
  daw,
  layers = defaults(),
  overrides = {},
}: { setup?: DawSetupId; caps?: DawCapabilities; daw?: Partial<DawClient>; layers?: Layers; overrides?: Partial<NarrationApi> } = {}) {
  const saveSettings = vi.fn(async () => createMockApi().bootstrap());
  const api = createMockApi({ settingsForScope: async (scope) => ({ DAW: layers[scope] }), saveSettings, ...overrides });
  const client = { ...createMockDawClient(caps ?? DAW_SETUPS[setup]), ...daw };
  const view = render(
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw: client }}>
        <UnsavedDraftsProvider>
          <RegistryProbe />
          <main tabIndex={-1}>
            <BackupsSection />
          </main>
        </UnsavedDraftsProvider>
      </PortOverrides>
    </ApiProvider>,
  );
  return { ...view, saveSettings };
}

let registry: ReturnType<typeof useUnsavedDrafts>;
function RegistryProbe() {
  registry = useUnsavedDrafts();
  return null;
}

const windowBox = () => screen.findByRole('textbox', { name: 'Audio kept either side of a punch or an edit (s)' });
const retentionBox = () => screen.findByRole('textbox', { name: 'Keep backups for (days)' });

describe('BackupsSection', () => {
  it.each<DawSetupId>(['reaper', 'builtin'])('hidden-when-the-daw-lacks-the-capability: %s renders nothing', async (setup) => {
    const capabilities = vi.fn(() => Promise.resolve(DAW_SETUPS[setup]));
    renderSection({ setup, daw: { capabilities } });
    await waitFor(() => expect(capabilities).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.getByRole('main').innerHTML).toBe('');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shown-for-a-daw-that-reports-it: the window and the retention rows, with help computed from the value', async () => {
    renderSection();
    expect(await screen.findByRole('heading', { name: 'Backups' })).toBeTruthy();
    expect((await windowBox()).getAttribute('placeholder')).toBe('Inherits 120');
    expect((await retentionBox()).getAttribute('placeholder')).toBe('Inherits 7');
    expect(screen.getByText(/about 2 minutes either side/)).toBeTruthy();
    expect(screen.getByText(/for 7 days/)).toBeTruthy();
    fireEvent.change(await windowBox(), { target: { value: '300' } });
    expect(screen.getByText(/about 5 minutes either side/)).toBeTruthy();
  });

  it('edits-save-through-scoped-settings: a value saves at the layer it comes from when the box is left', async () => {
    const { saveSettings } = renderSection();
    const box = await windowBox();
    fireEvent.change(box, { target: { value: '180' } });
    fireEvent.blur(box);
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('DAW', 'global', { 'backups.window_seconds': '180' }));

    // A project override is the layer in force, so the edit goes there.
    cleanup();
    const layers = defaults();
    layers.project[1] = { ...field('backups.retention_days', '14'), effectiveSource: 'project' };
    const project = renderSection({ layers });
    const days = await retentionBox();
    expect((days as HTMLInputElement).value).toBe('14');
    fireEvent.change(days, { target: { value: '30' } });
    fireEvent.blur(days);
    await waitFor(() => expect(project.saveSettings).toHaveBeenCalledWith('DAW', 'project', { 'backups.retention_days': '30' }));
  });

  // This test pinned the store's red sentence for a value outside its bounds, with nothing saved. The owner's rule CS-N1 (#3681) changed
  // that on purpose: the box saves the nearest limit when it is left, and the range note stays under it.
  it("edits-save-through-scoped-settings: a value outside the store's bounds is saved as the nearest limit when the box is left", async () => {
    const { saveSettings } = renderSection();
    const box = await windowBox();
    fireEvent.change(box, { target: { value: '600' } });
    expect(saveSettings).not.toHaveBeenCalled();
    fireEvent.blur(box);
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('DAW', 'global', { 'backups.window_seconds': '300' }));
    const days = await retentionBox();
    fireEvent.change(days, { target: { value: '0' } });
    fireEvent.blur(days);
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('DAW', 'global', { 'backups.retention_days': '1' }));
    expect(saveSettings).toHaveBeenCalledTimes(2);
    expect(screen.getByText('From 10 to 300 s')).toBeTruthy();
    expect(screen.queryByText(/^Enter a value/)).toBeNull();
  });

  it("edits-save-through-scoped-settings: a refused save shows the host's reason", async () => {
    renderSection({ overrides: { saveSettings: vi.fn(async () => Promise.reject(new Error('the settings file is read-only'))) } });
    const box = await windowBox();
    fireEvent.change(box, { target: { value: '60' } });
    fireEvent.blur(box);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('the settings file is read-only');
  });

  it("the-reason-comes-from-the-capability: present but unavailable shows the capability's own sentence instead of the rows", async () => {
    const quiet = 'Audacity is not answering. Open the Audacity chip at the top for the steps.';
    renderSection({
      caps: {
        ...DAW_SETUPS.audacity,
        reachable: false,
        capabilities: { ...DAW_SETUPS.audacity.capabilities, backups: { level: 'experimental', available: false, reason: 'not_running', message: quiet } },
      },
    });
    expect(await screen.findByRole('heading', { name: 'Backups' })).toBeTruthy();
    expect(await screen.findByText(quiet)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('the-wording-names-the-daw-from-the-report', async () => {
    // A report from another DAW that has backups: the help names that DAW, never Audacity.
    const reaper = DAW_SETUPS.reaper;
    const caps: DawCapabilities = { ...reaper, capabilities: { ...reaper.capabilities, backups: DAW_SETUPS.audacity.capabilities.backups! } };
    renderSection({ caps });
    expect(await screen.findByText(/^REAPER keeps a copy of the audio around an edit/)).toBeTruthy();
    expect(screen.queryByText(/Audacity/)).toBeNull();
  });

  it('a failed capability read says why and reads again on Retry', async () => {
    let fail = true;
    const capabilities = vi.fn(() => (fail ? Promise.reject(new Error('the DAW did not answer')) : Promise.resolve(DAW_SETUPS.audacity)));
    renderSection({ daw: { capabilities } });
    expect((await screen.findByRole('alert')).textContent).toContain('the DAW did not answer');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await windowBox()).toBeTruthy();
  });

  it('keeps focus on the page when Retry succeeds and its error line goes away, and on Retry when the read fails again', async () => {
    let fail = true;
    const capabilities = vi.fn(() => (fail ? Promise.reject(new Error('the DAW did not answer')) : Promise.resolve(DAW_SETUPS.audacity)));
    renderSection({ daw: { capabilities } });
    await screen.findByRole('alert');
    const retry = screen.getByRole('button', { name: 'Retry' });
    await userEvent.click(retry);
    await waitFor(() => expect(capabilities).toHaveBeenCalledTimes(2));
    expect(document.activeElement).toBe(retry);
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await windowBox()).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('standalone-and-self-contained: it takes no props, so a page can draw it anywhere', async () => {
    const Section = BackupsSection;
    render(
      <ApiProvider api={createMockApi({ settingsForScope: async (scope) => ({ DAW: defaults()[scope] }) })}>
        <PortOverrides clients={{ daw: createMockDawClient(DAW_SETUPS.audacity) }}>
          <Section />
        </PortOverrides>
      </ApiProvider>,
    );
    expect(await windowBox()).toBeTruthy();
  });

  // #3877 N6: text held in its box and not saved was dropped without a word by leaving the category or the page. Text that is not a number
  // is still held so.
  it('text that is not a number is held, not saved: leaving asks, and Discard puts the box back', async () => {
    const { saveSettings } = renderSection();
    const box = (await retentionBox()) as HTMLInputElement;
    expect(registry.heldNow()).toEqual([]);
    fireEvent.change(box, { target: { value: 'abc' } });
    expect(registry.heldNow().map((held) => held.label)).toEqual(['a backups value that is not a number']);
    fireEvent.blur(box);
    expect(box.value).toBe('abc');
    expect(saveSettings).not.toHaveBeenCalled();
    act(() => registry.discard());
    await waitFor(() => expect(box.value).toBe(''));
    expect(registry.heldNow()).toEqual([]);
  });

  // #3877 N6 held a value outside its range in its box as an unsaved draft that leaving asked about. Since CS-N1 (#3681) there is no such
  // draft: the value is saved as the nearest limit when the box is left, and every exit takes the focus off the box first.
  it('a value outside its range is not an unsaved draft: leaving the box saves the nearest limit', async () => {
    const { saveSettings } = renderSection();
    const box = await retentionBox();
    fireEvent.change(box, { target: { value: '400' } });
    expect(registry.heldNow()).toEqual([]);
    fireEvent.blur(box);
    await waitFor(() => expect(saveSettings).toHaveBeenCalledExactlyOnceWith('DAW', 'global', { 'backups.retention_days': '365' }));
  });

  // #3877 B1 of the second qa pass: a save re-read the rows and cleared every box, so what was typed in the other box vanished. It still
  // must not; what changed (CS-N1) is that the value past the range is then saved as the limit, not held.
  it('a value typed in one box survives a save of the other box, and is saved as the nearest limit when its box is left', async () => {
    const { saveSettings } = renderSection();
    const window = await windowBox();
    fireEvent.change(window, { target: { value: '5' } });
    const days = await retentionBox();
    fireEvent.change(days, { target: { value: '30' } });
    fireEvent.blur(days);
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith('DAW', 'global', { 'backups.retention_days': '30' }));
    await act(async () => undefined);
    expect((window as HTMLInputElement).value).toBe('5');
    fireEvent.blur(window);
    await waitFor(() => expect(saveSettings).toHaveBeenLastCalledWith('DAW', 'global', { 'backups.window_seconds': '10' }));
  });
});
