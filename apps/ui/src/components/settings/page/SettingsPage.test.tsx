// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { CommandDescriptor } from '../../../input/commands.catalog';
import { COMMAND_CATALOG } from '../../../input/commands.catalog';
import { commandsFor } from '../../../input/surfaces';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { THEME_STORAGE_KEY } from '../../../theme/theme';
import type { NarrationApi } from '../../../types';
import { deliveryProfileKey } from '../../master/deliveryProfile';
import { settingsSectionsFor } from '../sections';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function renderPage({ api = createMockApi(), initialCategory }: { api?: NarrationApi; initialCategory?: string } = {}) {
  const data = await api.bootstrap();
  const view = render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
          <SettingsPage
            data={data}
            notify={vi.fn()}
            onDirtyChange={vi.fn()}
            registerActions={vi.fn()}
            onProjectDataCleared={async () => undefined}
            onLinkDawFile={vi.fn()}
            go={vi.fn()}
            refreshBootstrap={async () => undefined}
            initialCategory={initialCategory}
          />
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  return { api, view };
}

const panel = (name: string) => screen.getByRole('region', { name });
const keptSettings = () => screen.getByRole('region', { name: 'More settings' });

describe('Settings page (SN-M52)', () => {
  it('the-delivery-profile-is-changed-here: a select over the profile list, saved with deliverySelectProfile', async () => {
    const api = createMockApi({}, { deliveryProfile: 'custom' });
    const state = await api.deliveryProfiles();
    const select = vi.spyOn(api, 'deliverySelectProfile');
    await renderPage({ api });
    const field = await within(panel('Delivery profile')).findByRole('combobox', { name: 'Delivery profile' });
    const options = within(field).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(state.profiles.map((profile) => profile.name));
    expect((field as HTMLSelectElement).value).toBe(state.projectProfile);

    const other = state.profiles.find((profile) => deliveryProfileKey(profile) !== state.projectProfile)!;
    fireEvent.change(field, { target: { value: deliveryProfileKey(other) } });
    await waitFor(() => expect(select).toHaveBeenCalledWith('project', other.id, other.builtIn ? other.version : ''));
    await waitFor(() => expect((field as HTMLSelectElement).value).toBe(deliveryProfileKey(other)));
  });

  it('the-delivery-profile-is-changed-here: a refused choice shows the host sentence and keeps the select', async () => {
    const api = createMockApi({}, { deliveryProfile: 'custom' });
    api.deliverySelectProfile = async () => {
      throw new Error('no project is open');
    };
    await renderPage({ api });
    const field = await within(panel('Delivery profile')).findByRole('combobox', { name: 'Delivery profile' });
    const before = (field as HTMLSelectElement).value;
    const other = within(field)
      .getAllByRole('option')
      .find((option) => (option as HTMLOptionElement).value !== before) as HTMLOptionElement;
    fireEvent.change(field, { target: { value: other.value } });
    expect((await within(panel('Delivery profile')).findByRole('alert')).textContent).toContain('no project is open');
    expect((field as HTMLSelectElement).value).toBe(before);
  });

  it('theme-radios-save-the-choice: system, light, dark', async () => {
    await renderPage();
    const appearance = panel('Appearance');
    expect(within(appearance).getByRole('radio', { name: 'Match my system' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(appearance).getByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark'));
    fireEvent.click(within(appearance).getByRole('radio', { name: 'Light' }));
    await waitFor(() => expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light'));
    expect(within(appearance).getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
  });

  it('keys-list-is-generated-from-the-catalogue: one row per settings command, remapped keys shown, nothing to type', async () => {
    const api = createMockApi();
    const first = commandsFor('settings')[0]!;
    // A remap saved in `Keymap.overrides` (the document KeyboardPanel writes): the list shows it, not the default.
    const overrides = JSON.stringify({ version: 1, bindings: { [first.id]: ['F9'] } });
    const settingsForScope = api.settingsForScope;
    api.settingsForScope = async (scope) => {
      const settings = await settingsForScope(scope);
      return {
        ...settings,
        Keymap: [
          {
            key: 'overrides',
            label: 'Overrides',
            kind: 'text',
            choices: [],
            value: overrides,
            isSet: true,
            effectiveValue: overrides,
            effectiveSource: 'global',
          },
        ],
      };
    };
    await renderPage({ api });
    const keys = panel('Keyboard shortcuts');
    const rows = within(keys).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('[data-command-label]')?.textContent)).toEqual(commandsFor('settings').map((command) => command.label));
    await waitFor(() => expect(within(rows[0]!).getAllByRole('img', { name: 'F9' }).length).toBeGreaterThan(0));
    expect(keys.querySelectorAll('input, button, select, textarea')).toHaveLength(0);
  });

  it('keys-list-is-generated-from-the-catalogue: a row added to the catalogue shows with no other edit', async () => {
    const extra: CommandDescriptor = { ...commandsFor('settings')[0]!, id: 'test.extra' as CommandDescriptor['id'], label: 'A command added for the test' };
    const { KeysPanel } = await import('./KeysPanel');
    render(
      <ApiProvider api={createMockApi()}>
        <KeysPanel catalog={[...COMMAND_CATALOG, extra]} />
      </ApiProvider>,
    );
    expect(screen.getByText('A command added for the test')).toBeTruthy();
  });

  it('manuscript-panel-replaces-in-its-one-place: mounts ManuscriptSection unchanged', async () => {
    await renderPage();
    const manuscript = panel('Manuscript');
    expect(await within(manuscript).findByRole('button', { name: 'Replace manuscript' })).toBeTruthy();
    const source = readFileSync(join(__dirname, 'SettingsPage.tsx'), 'utf8');
    expect(source).toMatch(/<ManuscriptSection\b/);
  });

  it('capability-backups-and-analysis-sections-are-mounted-not-rewritten: registered into the kept DAW and Story Bible categories', async () => {
    await renderPage();
    expect(settingsSectionsFor('Daw').map(({ id }) => id)).toEqual(['capabilities', 'backups']);
    expect(settingsSectionsFor('ManuscriptGuide').map(({ id }) => id)).toEqual(['analysis-tools']);

    const kept = keptSettings();
    fireEvent.click(within(kept).getByRole('tab', { name: 'DAW Integration' }));
    expect(await within(kept).findByRole('heading', { name: 'What the DAW can do' })).toBeTruthy();
    fireEvent.click(within(kept).getByRole('tab', { name: 'Story Bible' }));
    expect(await within(kept).findByRole('heading', { name: 'Story Bible analysis' })).toBeTruthy();

    // PRD metric "Settings rows hand-written for a capability: 0": no file of the page names a capability.
    for (const file of ['SettingsPage.tsx', 'DeliveryProfileField.tsx', 'AppearancePanel.tsx', 'KeysPanel.tsx']) {
      expect(readFileSync(join(__dirname, file), 'utf8'), file).not.toMatch(/capabilities\[|capability\./);
    }
  });

  it('kept-categories-stay-reachable: every category of the old page is there, in both scopes', async () => {
    await renderPage();
    const kept = keptSettings();
    const global = within(kept)
      .getAllByRole('tab')
      .map((tab) => tab.textContent);
    for (const label of [
      'General',
      'Recording check',
      'Silence cleanup',
      'Proof',
      'Preview',
      'Stage suggestions',
      'Story Bible',
      'Delivery',
      'DAW Integration',
      'TTS',
      'Booth',
      'Local assets',
      'About & updates',
    ]) {
      expect(global, label).toContain(label);
    }
    fireEvent.click(within(kept).getByRole('tab', { name: 'This Project' }));
    const project = within(kept)
      .getAllByRole('tab')
      .map((tab) => tab.textContent);
    for (const label of ['Project data', 'Credits']) expect(project, label).toContain(label);
  });

  it.each([
    ['#credits', 'Credits'],
    ['#delivery', 'Delivery'],
    ['#booth', 'Booth'],
  ])('kept-categories-stay-reachable: the %s anchor lands on %s', async (_anchor, label) => {
    const category = { Credits: 'Credits', Delivery: 'Delivery', Booth: 'Teleprompter' }[label]!;
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    await renderPage({ initialCategory: category });
    expect(within(keptSettings()).getByRole('tab', { name: label }).getAttribute('aria-selected')).toBe('true');
    expect(scrolled).toHaveBeenCalled();
  });

  it('reflow-at-390: the column has no fixed width wider than the window', () => {
    // jsdom lays nothing out: the measured check is the atlas's (the stories, at 390 px) and SN-M5's visual rows. Here the
    // page's own classes are held to a max width with no min width, so nothing forces it past 390 px.
    const source = readFileSync(join(__dirname, 'SettingsPage.tsx'), 'utf8');
    expect(source).toMatch(/max-w-\[860px\]/);
    expect(source).not.toMatch(/(?<!max-)\b(min-)?w-\[\d/);
  });
});
