// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { DawCapabilities } from '../../api/contracts/daw';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../fixtures/daw';
import { createMockDawClient, type DawClient } from '../../ports/daw';
import { PortOverrides } from '../../ports/usePort';
import type { NarrationApi, Scope, ScopedSettingField } from '../../types';
import { BackupsSection } from './BackupsSection';
import type { SettingsSection } from './sections';

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
  setup = 'audacity-backups',
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
        <BackupsSection />
      </PortOverrides>
    </ApiProvider>,
  );
  return { ...view, saveSettings };
}

const windowBox = () => screen.findByRole('textbox', { name: 'Audio kept either side of a punch or an edit (s)' });
const retentionBox = () => screen.findByRole('textbox', { name: 'Keep backups for (days)' });

describe('BackupsSection', () => {
  it.each<DawSetupId>(['reaper', 'builtin'])('hidden-when-the-daw-lacks-the-capability: %s renders nothing', async (setup) => {
    const capabilities = vi.fn(() => Promise.resolve(DAW_SETUPS[setup]));
    const { container } = renderSection({ setup, daw: { capabilities } });
    await waitFor(() => expect(capabilities).toHaveBeenCalled());
    await Promise.resolve();
    expect(container.innerHTML).toBe('');
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

  it("edits-save-through-scoped-settings: a value outside the store's bounds shows the store's sentence and is not saved", async () => {
    const { saveSettings } = renderSection();
    const box = await windowBox();
    fireEvent.change(box, { target: { value: '600' } });
    fireEvent.blur(box);
    expect(screen.getByText('Enter a value from 10 to 300 s.')).toBeTruthy();
    const days = await retentionBox();
    fireEvent.change(days, { target: { value: '400' } });
    fireEvent.blur(days);
    expect(screen.getByText('Enter a value from 1 to 365 days.')).toBeTruthy();
    expect(saveSettings).not.toHaveBeenCalled();
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
    renderSection({ setup: 'audacity' });
    expect(await screen.findByRole('heading', { name: 'Backups' })).toBeTruthy();
    expect(await screen.findByText(DAW_SETUPS.audacity.capabilities.backups!.message!)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('the-wording-names-the-daw-from-the-report', async () => {
    // A report from another DAW that has backups: the help names that DAW, never Audacity.
    const reaper = DAW_SETUPS.reaper;
    const caps: DawCapabilities = { ...reaper, capabilities: { ...reaper.capabilities, backups: DAW_SETUPS['audacity-backups'].capabilities.backups! } };
    renderSection({ caps });
    expect(await screen.findByText(/^REAPER keeps a copy of the audio around an edit/)).toBeTruthy();
    expect(screen.queryByText(/Audacity/)).toBeNull();
  });

  it('a failed capability read says why and reads again on Retry', async () => {
    let fail = true;
    const capabilities = vi.fn(() => (fail ? Promise.reject(new Error('the DAW did not answer')) : Promise.resolve(DAW_SETUPS['audacity-backups'])));
    renderSection({ daw: { capabilities } });
    expect((await screen.findByRole('alert')).textContent).toContain('the DAW did not answer');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await windowBox()).toBeTruthy();
  });

  it('standalone-and-self-contained: it takes no props, the shape of a SettingsSection', async () => {
    const section: SettingsSection = { id: 'backups', component: BackupsSection, order: 20 };
    const Section = section.component;
    render(
      <ApiProvider api={createMockApi({ settingsForScope: async (scope) => ({ DAW: defaults()[scope] }) })}>
        <PortOverrides clients={{ daw: createMockDawClient(DAW_SETUPS['audacity-backups']) }}>
          <Section />
        </PortOverrides>
      </ApiProvider>,
    );
    expect(await windowBox()).toBeTruthy();
  });
});
