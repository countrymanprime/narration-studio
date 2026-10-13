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

async function renderPage({
  api = createMockApi(),
  initialCategory,
  onDirtyChange = vi.fn(),
  registerActions = vi.fn(),
}: {
  api?: NarrationApi;
  initialCategory?: string;
  onDirtyChange?: (dirty: boolean) => void;
  registerActions?: (actions: { save: () => Promise<void>; discard: () => Promise<void> }) => void;
} = {}) {
  const data = await api.bootstrap();
  const view = render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
          <SettingsPage
            data={data}
            notify={vi.fn()}
            onDirtyChange={onDirtyChange}
            registerActions={registerActions}
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

  it('recording panel: lists every engine, chooses the built-in recorder or a DAW, and shows the DAW chosen while it is off', async () => {
    const api = createMockApi({}, { daw: { connected: false } });
    const choose = vi.spyOn(api, 'dawChoose');
    await renderPage({ api });
    const recording = panel('Recording');
    const group = await within(recording).findByRole('radiogroup', { name: 'Recording' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    // The project's DAW is not running: it stays chosen.
    await waitFor(() =>
      expect(
        within(recording)
          .getByRole('radio', { name: /^REAPER\./ })
          .getAttribute('aria-checked'),
      ).toBe('true'),
    );
    // The panel comes first, as the mock orders it.
    expect(screen.getAllByRole('region')[0]).toBe(recording);

    fireEvent.click(within(recording).getByRole('radio', { name: /^Built-in recorder/ }));
    await waitFor(() => expect(choose).toHaveBeenCalledWith('Built-in'));
    await waitFor(() =>
      expect(
        within(recording)
          .getByRole('radio', { name: /^Built-in recorder/ })
          .getAttribute('aria-checked'),
      ).toBe('true'),
    );
    fireEvent.click(within(recording).getByRole('radio', { name: /^Audacity\./ }));
    await waitFor(() => expect(choose).toHaveBeenCalledWith('Audacity'));
    await waitFor(() =>
      expect(
        within(recording)
          .getByRole('radio', { name: /^Audacity\./ })
          .getAttribute('aria-checked'),
      ).toBe('true'),
    );
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

  it("capability-backups-and-analysis-sections-are-mounted-not-rewritten: DAW sections in DAW Integration, analysis as the mock's own panel", async () => {
    await renderPage();
    expect(settingsSectionsFor('Daw').map(({ id }) => id)).toEqual(['capabilities', 'backups']);
    expect(await within(panel('DAW Integration')).findByRole('heading', { name: 'What the DAW can do' })).toBeTruthy();
    // The mock draws Story Bible analysis as its own panel, straight after Story Bible types.
    const regions = screen.getAllByRole('region').filter((region) => region.parentElement?.closest('section') === null);
    const names = regions.map((region) => region.querySelector('h2')?.textContent);
    expect(names.indexOf('Story Bible analysis')).toBe(names.indexOf('Story Bible types') + 1);
    // Its "offer better analysis" checkbox is the one control for `analysis_prompt`: the Story Bible fields leave it out.
    expect(await within(panel('Story Bible')).findByText('spaCy model')).toBeTruthy();
    expect(within(panel('Story Bible')).queryByText('Offer better analysis tools')).toBeNull();
    expect(within(panel('Story Bible analysis')).getByRole('checkbox', { name: 'Offer better analysis when scanning' })).toBeTruthy();

    // PRD metric "Settings rows hand-written for a capability: 0": no file of the page names a capability.
    for (const file of ['SettingsPage.tsx', 'DeliveryProfileField.tsx', 'AppearancePanel.tsx', 'KeysPanel.tsx', 'DawPanel.tsx']) {
      expect(readFileSync(join(__dirname, file), 'utf8'), file).not.toMatch(/capabilities\[|capability\./);
    }
  });

  it('one-page: one heading, no second page wrapper, no category tabs and no scope tabs', async () => {
    await renderPage();
    await within(panel('General')).findByText('Log verbosity');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })[0]!.textContent).toBe('Settings');
    expect(screen.queryByRole('region', { name: 'More settings' })).toBeNull();
    expect(screen.queryAllByRole('tablist')).toHaveLength(0);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    // Every panel sits in the one column, at most inside its anchor: no panel nests in another or in a second page.
    const column = screen.getByRole('heading', { level: 1 }).closest('.max-w-\\[860px\\]') as HTMLElement;
    const panels = screen.getAllByRole('region').filter((region) => region.parentElement?.closest('section') === null);
    expect(panels.length).toBeGreaterThan(20);
    for (const region of panels) {
      const host = region.parentElement === column ? region : region.parentElement!;
      expect(host.parentElement, region.querySelector('h2')?.textContent ?? '').toBe(column);
    }
    expect(column.querySelector('[class*="overflow-auto"], [class*="overflow-y-auto"]')).toBeNull();
  });

  it('kept-settings-stay-reachable: every setting the old page offered has its panel', async () => {
    await renderPage();
    for (const title of [
      'General',
      'Keyboard & pedals',
      'Note colour',
      'Recording check',
      'Silence cleanup',
      'Proof',
      'Preview suggestion',
      'Stage suggestions',
      'Story Bible',
      'Delivery profiles',
      'DAW Integration',
      'TTS',
      'Booth',
      'Local assets',
      'Project data',
      'Credits',
      'About & updates',
    ]) {
      expect(panel(title), title).toBeTruthy();
    }
    expect(await within(panel('Silence cleanup')).findByText('Hold kept at each side of a cut silence')).toBeTruthy();
    expect(await within(panel('Booth')).findByText('Microphone')).toBeTruthy();
    expect(await within(panel('Story Bible')).findByText('Online dictionary (Merriam-Webster)')).toBeTruthy();
    expect(within(panel('Project data')).getByRole('button', { name: 'Clear derived project data…' })).toBeTruthy();
    expect(await within(panel('About & updates')).findByText('Check for updates on startup')).toBeTruthy();
    expect(await within(panel('DAW Integration')).findByRole('button', { name: 'Launch REAPER' })).toBeTruthy();
  });

  it('kept-settings-stay-reachable: a two-scope panel switches scope in its own header and saves in that scope', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api });
    const proof = panel('Proof');
    const scope = within(proof).getByRole('group', { name: 'Proof scope' });
    expect(within(scope).getByRole('button', { name: 'Global' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(scope).getByRole('button', { name: 'This project' }));
    await waitFor(() => expect(within(scope).getByRole('button', { name: 'This project' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.change(await within(proof).findByRole('combobox', { name: 'Default Whisper model' }), { target: { value: 'large-v3' } });
    expect(within(proof).getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(within(proof).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('TranscriptCompare', 'project', { model_size: 'large-v3' }));
    await waitFor(() => expect(within(proof).queryByText('Unsaved changes')).toBeNull());
  });

  it('kept-settings-stay-reachable: an edit asks before its panel switches scope', async () => {
    await renderPage();
    const cleanupPanel = panel('Silence cleanup');
    fireEvent.change(await within(cleanupPanel).findByRole('textbox', { name: 'Hold kept at each side of a cut silence' }), { target: { value: '0.3' } });
    const scope = within(cleanupPanel).getByRole('group', { name: 'Silence cleanup scope' });
    fireEvent.click(within(scope).getByRole('button', { name: 'This project' }));
    expect(await screen.findByText('Save or discard changes before continuing?')).toBeTruthy();
    expect(within(scope).getByRole('button', { name: 'Global', hidden: true }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Discard & continue' }));
    await waitFor(() => expect(within(scope).getByRole('button', { name: 'This project' }).getAttribute('aria-pressed')).toBe('true'));
  });

  it('dirty-and-actions: edits in any panel make the page dirty, and the registered Save saves every edited panel', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    const onDirtyChange = vi.fn();
    let actions: { save: () => Promise<void>; discard: () => Promise<void> } | undefined;
    await renderPage({ api, onDirtyChange, registerActions: (next) => (actions = next) });
    fireEvent.change(await within(panel('General')).findByDisplayValue('normal'), { target: { value: 'verbose' } });
    fireEvent.change(await within(panel('Silence cleanup')).findByRole('textbox', { name: 'Hold kept at each side of a cut silence' }), {
      target: { value: '0.3' },
    });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    await actions!.save();
    expect(save).toHaveBeenCalledWith('General', 'global', { log_verbosity: 'verbose' });
    expect(save).toHaveBeenCalledWith('Cleanup', 'global', { pad_seconds: '0.3' });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it.each([
    ['#credits', 'Credits', 'Credits'],
    ['#delivery', 'Delivery', 'Delivery profiles'],
    ['#cleanup', 'Cleanup', 'Silence cleanup'],
    ['#booth', 'Teleprompter', 'Booth'],
    ['#recording', 'Recording', 'Recording'],
  ])('deep-links: the %s anchor scrolls to the %s panel', async (_anchor, category, title) => {
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    await renderPage({ initialCategory: category });
    expect(scrolled).toHaveLength(1);
    expect(within(scrolled[0] as HTMLElement).getByRole('heading', { level: 2, name: title })).toBe(
      within(panel(title)).getByRole('heading', { level: 2, name: title }),
    );
  });

  it('reflow-at-390: the column has no fixed width wider than the window', () => {
    // jsdom lays nothing out: the measured check is the atlas's (the stories, at 390 px) and SN-M5's visual rows. Here the
    // page's own classes are held to a max width with no min width, so nothing forces it past 390 px.
    const source = readFileSync(join(__dirname, 'SettingsPage.tsx'), 'utf8');
    expect(source).toMatch(/max-w-\[860px\]/);
    expect(source).not.toMatch(/(?<!max-)\b(min-)?w-\[\d/);
  });
});
