// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi, type MockUpdateSeed } from '../../../api/mockApi';
import { StudioProvider } from '../../../studio/StudioProvider';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { THEME_STORAGE_KEY } from '../../../theme/theme';
import { MOTION_STORAGE_KEY } from '../../../motion';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { TEXT_PREFS_STORAGE_KEY } from '../../script/page/tools/text/readerText';
import { SettingsPage } from '../page/SettingsPage';
import { brand } from '../../../brand.gen';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

async function renderPage({
  api = createMockApi(),
  initialCategory,
  go = vi.fn(),
  notify = vi.fn(),
  onProjectDataCleared = vi.fn(async () => undefined),
}: {
  api?: NarrationApi;
  initialCategory?: string;
  go?: (path: string) => void;
  notify?: (message: string) => void;
  onProjectDataCleared?: () => Promise<void>;
} = {}) {
  const data = await api.bootstrap();
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
          <StudioProvider>
            <TooltipProvider>
              <SettingsPage
                data={data}
                notify={notify}
                onDirtyChange={vi.fn()}
                registerActions={vi.fn()}
                onProjectDataCleared={onProjectDataCleared}
                onLinkDawFile={vi.fn()}
                go={go}
                refreshBootstrap={async () => undefined}
                initialCategory={initialCategory}
              />
            </TooltipProvider>
          </StudioProvider>
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  return { api, data, go, notify, onProjectDataCleared };
}

const nav = () => screen.getByRole('navigation', { name: 'Settings categories' });
async function open(category: string, heading = category) {
  fireEvent.click(within(nav()).getByRole('button', { name: new RegExp(`^${category}`) }));
  await screen.findByRole('heading', { level: 2, name: heading });
}
const row = (id: string) => document.querySelector<HTMLElement>(`[data-row="${id}"]`)!;
const openAdvanced = async () => fireEvent.click(await screen.findByRole('button', { name: /Advanced/ }));

describe('Settings: Project', () => {
  it('Replace manuscript is in Settings, under Project, with when it was imported and its size', async () => {
    const { data } = await renderPage();
    await open('Project');
    const manuscript = row('project.manuscript');
    expect(within(manuscript).getByText(/^Imported .* · [\d,]+ words$/)).toBeTruthy();
    expect(data.manuscript).toBeTruthy();
    expect(within(manuscript).getByRole('button', { name: /Replace manuscript|Import manuscript/ })).toBeTruthy();
  });

  it('lists the marks and opens the marks dialog', async () => {
    const api = createMockApi();
    const types = (await api.marksList()).types;
    await renderPage({ api });
    await open('Project');
    const marks = row('project.marks');
    await within(marks).findByText(types[0].name);
    expect(
      within(marks)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(types.map((type) => (type.asks ? `${type.name} · tracks a reply` : type.name)));
    await userEvent.click(within(marks).getByRole('button', { name: 'Edit marks…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Define how you mark up' });
    await waitFor(() => expect(within(dialog).getAllByLabelText('Mark name')).toHaveLength(types.length));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  // Alignment audit (XSE2-23, XSE2-24): Edit marks sits beside the pills, and the manuscript line is above its button at every width.
  it('keeps Edit marks at the top right beside the pills, and the manuscript line above its button', async () => {
    await renderPage();
    await open('Project');
    const marks = row('project.marks');
    const edit = await within(marks).findByRole('button', { name: 'Edit marks…' });
    const grid = within(marks).getByRole('list').parentElement!;
    expect(grid.className).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(grid.contains(edit)).toBe(true);
    const manuscript = row('project.manuscript');
    expect(within(manuscript).getByText(/^Imported /).parentElement!.className).toContain('flex-col');
  });

  it('clearing derived data asks first, and clears only after the confirm', async () => {
    const api = createMockApi();
    const clear = vi.spyOn(api, 'clearProjectData');
    const { onProjectDataCleared } = await renderPage({ api });
    await open('Project');
    await openAdvanced();
    await userEvent.click(within(row('project.data')).getByRole('button', { name: 'Clear derived data…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Clear derived project data?' });
    expect(clear).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(clear).not.toHaveBeenCalled();
    await userEvent.click(within(row('project.data')).getByRole('button', { name: 'Clear derived data…' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Clear project data' }));
    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onProjectDataCleared).toHaveBeenCalled());
  });

  describe('credits', () => {
    it('summarises the opening and closing credits and the retail sample, and edits them in place', async () => {
      const api = createMockApi();
      await renderPage({ api });
      await open('Project');
      const credits = row('project.credits');
      await within(credits).findByText('Opening credits');
      expect(within(credits).getByText('Closing credits')).toBeTruthy();
      expect(within(credits).getByText('Retail sample')).toBeTruthy();
      await userEvent.click(within(credits).getByRole('button', { name: 'Edit credits…' }));
      // The real editor: the template library and the project's values.
      expect(await within(credits).findByLabelText('Title')).toBeTruthy();
      expect(within(credits).getByRole('button', { name: 'Close credits editor' })).toBeTruthy();
      await userEvent.click(within(credits).getByRole('button', { name: 'Close credits editor' }));
      expect(await within(credits).findByText('Opening credits')).toBeTruthy();
    });

    // Alignment audit (XSE2-12, XSE1-23): the summary is one small table, its labels the row's text size, every line with a badge.
    it('lays the summary out as label, badge and detail columns, the labels no bigger than the row title', async () => {
      await renderPage();
      await open('Project');
      const credits = row('project.credits');
      const label = await within(credits).findByText('Opening credits');
      expect(label.className).toContain('text-[0.875rem]');
      const summary = credits.querySelector<HTMLElement>('[data-credits-summary]')!;
      expect(summary.className).toContain('grid-cols-[minmax(0,9rem)_minmax(0,auto)_minmax(0,1fr)]');
      for (const line of summary.querySelectorAll<HTMLElement>('[data-credits]')) expect(line.className).toContain('grid-cols-subgrid');
      expect(within(summary.querySelector<HTMLElement>('[data-credits="Retail sample"]')!).getByText(/Chosen|Not chosen/)).toBeTruthy();
    });

    it('a /settings#credits link lands on the row', async () => {
      await renderPage({ initialCategory: 'Credits' });
      await screen.findByRole('heading', { level: 2, name: 'Project' });
      await waitFor(() => expect(row('project.credits')).toBeTruthy());
      expect(within(row('project.credits')).getByRole('button', { name: 'Edit credits…' })).toBeTruthy();
    });
  });

  describe('Story Bible types', () => {
    const types = () => row('project.types');
    const nameField = (type: string) => within(types()).getByRole('textbox', { name: `Type name: ${type}` }) as HTMLInputElement;
    const removeButton = (type: string) => within(types()).getByRole('button', { name: `Remove ${type}` });
    async function openTypes(api = createMockApi()) {
      await renderPage({ api });
      await open('Project');
      await within(types()).findByRole('textbox', { name: 'Type name: Character' });
      return api;
    }

    // Alignment audit (R3SE1-2, XSE2-10, XSE1-15): the list measures its own width, a type's two lines sit closer than two types, the second
    // line starts under the name box, the count keeps one width so the Remove buttons line up, and New type is as wide as a name box.
    it('lays the types out as one list with one grid: counts one width, second line under the name, New type like a name box', async () => {
      await openTypes();
      const list = types().querySelector('ul')!;
      expect(list.parentElement!.className).toContain('@container');
      expect(list.parentElement!.className).toContain('w-full');
      expect(list.className).toContain('gap-5');
      const count = types().querySelector<HTMLElement>('[data-type-count="Place"]')!;
      expect(count.className).toMatch(/(^| )min-w-\[70px\]/);
      expect(count.className).toContain('text-right');
      expect(count.parentElement!.className).toContain('pl-6');
      expect(within(types()).getByRole('textbox', { name: 'New type' }).closest('[class*="max-w-[16rem]"]')).toBeTruthy();
      expect(nameField('Place').closest('[class*="max-w-[16rem]"]')).toBeTruthy();
    });

    it('lists each type with its entry count', async () => {
      await openTypes();
      await waitFor(() => expect(types().querySelector('[data-type-count="Character"]')?.textContent).toBe('6 entries'));
      expect(types().querySelector('[data-type-count="Place"]')?.textContent).toBe('1 entry');
    });

    it('renaming a type moves its entries', async () => {
      const api = await openTypes();
      const rename = vi.spyOn(api, 'guideTypeRename');
      const field = nameField('Place');
      await userEvent.clear(field);
      await userEvent.type(field, 'Location{Enter}');
      await waitFor(() => expect(rename).toHaveBeenCalledWith('Place', 'Location'));
      expect(await within(types()).findByRole('textbox', { name: 'Type name: Location' })).toBeTruthy();
      await waitFor(() => expect(types().querySelector('[data-type-count="Location"]')?.textContent).toBe('1 entry'));
    });

    it('refuses an empty name and a taken one, and the field goes back', async () => {
      const api = await openTypes();
      const rename = vi.spyOn(api, 'guideTypeRename');
      await userEvent.clear(nameField('Place'));
      await userEvent.tab();
      expect(await within(types()).findByText('Give the type a new name.')).toBeTruthy();
      expect(rename).not.toHaveBeenCalled();
      expect(nameField('Place').value).toBe('Place');
      await userEvent.clear(nameField('Place'));
      await userEvent.type(nameField('Place'), 'Character{Enter}');
      await waitFor(() => expect(nameField('Place').value).toBe('Place'));
    });

    it('changes the colour', async () => {
      const api = await openTypes();
      const setColour = vi.spyOn(api, 'guideTypeSetColour');
      fireEvent.change(within(types()).getByRole('combobox', { name: 'Colour for Place' }), { target: { value: 'rose' } });
      await waitFor(() => expect(setColour).toHaveBeenCalledWith('Place', 'rose'));
    });

    it('Remove is disabled while a type is in use; a new type can be added and removed', async () => {
      await openTypes();
      await waitFor(() => expect(types().querySelector('[data-type-count="Character"]')?.textContent).toBe('6 entries'));
      expect(removeButton('Character').getAttribute('aria-disabled')).toBe('true');
      await userEvent.type(within(types()).getByRole('textbox', { name: 'New type' }), 'Creature');
      await userEvent.click(within(types()).getByRole('button', { name: 'Add type' }));
      await within(types()).findByRole('textbox', { name: 'Type name: Creature' });
      await waitFor(() => expect(removeButton('Creature').getAttribute('aria-disabled')).toBeNull());
      await userEvent.click(removeButton('Creature'));
      await waitFor(() => expect(within(types()).queryByRole('textbox', { name: 'Type name: Creature' })).toBeNull());
    });

    it('adding needs a name', async () => {
      const api = await openTypes();
      const add = vi.spyOn(api, 'guideTypeAdd');
      await userEvent.click(within(types()).getByRole('button', { name: 'Add type' }));
      expect(await within(types()).findByText('Give the type a new name.')).toBeTruthy();
      expect(add).not.toHaveBeenCalled();
    });

    it('the last type stays', async () => {
      const api = createMockApi();
      const only = (await api.guideTypes())[0];
      api.guideTypes = async () => [only];
      api.guideEntities = async () => [];
      await openTypes(api);
      await waitFor(() => expect(types().querySelector(`[data-type-count="${only.name}"]`)?.textContent).toBe('0 entries'));
      expect(removeButton(only.name).getAttribute('aria-disabled')).toBe('true');
    });
  });
});

describe('Settings: Appearance & keys', () => {
  it('theme radios save the choice to this browser', async () => {
    await renderPage();
    await open('Appearance & keys');
    const theme = row('look.theme');
    expect(within(theme).getByRole('radio', { name: 'Match my system' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(within(theme).getByRole('radio', { name: 'Dark' }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await userEvent.click(within(theme).getByRole('radio', { name: 'Light' }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('motion radios save the choice to this browser and set data-motion', async () => {
    await renderPage();
    await open('Appearance & keys');
    const motion = row('look.motion');
    expect(within(motion).getByRole('radio', { name: 'Follow Windows' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(within(motion).getByRole('radio', { name: 'Reduce' }));
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe('reduce');
    expect(document.documentElement.dataset.motion).toBe('reduce');
    await userEvent.click(within(motion).getByRole('radio', { name: 'Follow Windows' }));
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe('system');
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  // Alignment audit XSE2-13: Reader text is four settings rows, each titled once, not a sub-form with its own labels inside one row.
  it('reader text is four rows that change one set of saved choices, shown in the preview under Column width', async () => {
    await renderPage();
    await open('Appearance & keys');
    const font = row('look.reader');
    const size = row('look.readerSize');
    const spacing = row('look.readerSpacing');
    const width = row('look.readerWidth');
    expect(within(font).getByText('Reader font')).toBeTruthy();
    expect(within(size).getByText('Reader text size')).toBeTruthy();
    expect(within(spacing).getByText('Line spacing')).toBeTruthy();
    expect(within(width).getByText('Column width')).toBeTruthy();
    expect(within(font).getByRole('combobox', { name: 'Reader font' }).className).toContain('max-w-80');
    // No second label style in the body: the row's title names the control.
    for (const name of ['Font', 'Size']) expect(within(font.parentElement!).queryByText(name, { exact: true })).toBeNull();
    const preview = within(width).getByTestId('reader-text-preview');
    expect(preview.textContent).toContain('Off with her head!');
    expect(preview.style.fontSize).toBe('20px');
    fireEvent.change(within(size).getByRole('slider', { name: 'Reader text size' }), { target: { value: '5' } });
    fireEvent.change(within(spacing).getByRole('slider', { name: 'Line spacing' }), { target: { value: '2.2' } });
    expect(within(width).getByTestId('reader-text-preview').style.fontSize).toBe('24px');
    expect(within(width).getByTestId('reader-text-preview').style.lineHeight).toBe('2.2');
    expect(JSON.parse(localStorage.getItem(TEXT_PREFS_STORAGE_KEY)!)).toMatchObject({ size: 24, spacing: 2.2 });
  });

  it('zoom sets the window zoom, saves it, and resets', async () => {
    const api = createMockApi();
    const set = vi.spyOn(api, 'windowSetZoom');
    const save = vi.spyOn(api, 'windowSaveZoom');
    await renderPage({ api });
    await open('Appearance & keys');
    const zoom = row('look.zoom');
    const select = within(zoom).getByRole('combobox', { name: 'Zoom' }) as HTMLSelectElement;
    expect(select.value).toBe('1');
    expect(within(zoom).queryByRole('button', { name: 'Reset zoom to 100%' })).toBeNull();
    fireEvent.change(select, { target: { value: '1.25' } });
    await waitFor(() => expect(set).toHaveBeenCalledWith(1.25));
    await waitFor(() => expect(save).toHaveBeenCalledWith(1.25));
    await userEvent.click(await within(zoom).findByRole('button', { name: 'Reset zoom to 100%' }));
    await waitFor(() => expect(set).toHaveBeenLastCalledWith(1));
  });

  // Alignment audit (XSE1-3, XSE1-4, XSE2-33).
  it('shortcuts: the list grows with the card, no frame or scroller of its own, and Change keeps one right edge', async () => {
    await renderPage();
    await open('Appearance & keys');
    const list = await within(row('keys.map')).findByRole('region', { name: 'Shortcuts' });
    expect(list.className).not.toMatch(/overflow|max-h/);
    expect(list.hasAttribute('tabindex')).toBe(false);
    expect(list.parentElement!.style.borderColor).toBe('');
    const change = (await within(list).findAllByRole('button', { name: 'Change' }))[0]!;
    expect(change.parentElement!.className).toContain('ml-auto');
    expect(change.parentElement!.className).toContain('justify-end');
  });

  it('shortcuts: the recorder keeps Cancel last in its one button row, not pushed apart', async () => {
    await renderPage();
    await open('Appearance & keys');
    const list = await within(row('keys.map')).findByRole('region', { name: 'Shortcuts' });
    await userEvent.click((await within(list).findAllByRole('button', { name: 'Change' }))[0]!);
    const recorder = await within(list).findByRole('group', { name: /^Change "/ });
    const cancel = within(recorder).getByRole('button', { name: 'Cancel' });
    expect(cancel.className).not.toContain('ml-auto');
    expect([...cancel.parentElement!.querySelectorAll('button')].at(-1)).toBe(cancel);
  });

  it('zoom is a short field of 8rem, not its content width', async () => {
    await renderPage();
    await open('Appearance & keys');
    expect(within(row('look.zoom')).getByRole('combobox', { name: 'Zoom' }).className).toContain('w-32');
  });

  it('shortcuts: a find box narrows the list, and a key can be remapped', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api });
    await open('Appearance & keys');
    const list = await within(row('keys.map')).findByRole('region', { name: 'Shortcuts' });
    await waitFor(() => expect(within(list).getAllByRole('button', { name: 'Change' }).length).toBeGreaterThan(3));
    const before = within(list).getAllByRole('button', { name: 'Change' }).length;
    await userEvent.type(within(row('keys.map')).getByRole('textbox', { name: 'Find a shortcut' }), 'zzzz-nothing');
    expect(within(list).getByText('No shortcut matches.')).toBeTruthy();
    await userEvent.clear(within(row('keys.map')).getByRole('textbox', { name: 'Find a shortcut' }));
    expect(within(list).getAllByRole('button', { name: 'Change' }).length).toBe(before);

    await userEvent.click(within(list).getAllByRole('button', { name: 'Change' })[0]);
    expect(await within(list).findByRole('group', { name: /^Change "/ })).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    await userEvent.click(within(list).getByRole('button', { name: 'Unbind' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('Keymap', 'global', expect.objectContaining({ overrides: expect.any(String) })));
  });
});

describe('Settings: App & updates', () => {
  async function renderApp(seed?: MockUpdateSeed) {
    const api = createMockApi({}, seed ? { update: seed } : {});
    const page = await renderPage({ api });
    await open('App & updates');
    return page;
  }

  it('says what is running and reports Check now', async () => {
    const { data } = await renderApp();
    const about = await screen.findByRole('region', { name: 'This version' });
    expect(within(about).getByText(`${brand.name}`)).toBeTruthy();
    expect(within(about).getByText(`Version ${data.version}`)).toBeTruthy();
    await userEvent.click(await within(about).findByRole('button', { name: 'Check now' }));
    expect(await within(about).findByText(/You have the latest version/)).toBeTruthy();
  });

  it('offers a newer release and its download', async () => {
    await renderApp('available');
    const about = await screen.findByRole('region', { name: 'This version' });
    expect(await within(about).findByText('Version 0.2.7 is available')).toBeTruthy();
    await userEvent.click(within(about).getByRole('button', { name: 'Download update' }));
    expect(await screen.findByRole('alertdialog', { name: 'Download version 0.2.7?' })).toBeTruthy();
  });

  it('asks the host again when the channel changes', async () => {
    const { api } = await renderApp();
    const status = vi.spyOn(api, 'updateStatus');
    await screen.findByRole('button', { name: 'Check now' });
    const before = status.mock.calls.length;
    fireEvent.change(await screen.findByRole('combobox', { name: /Update channel/ }), { target: { value: 'stable' } });
    await waitFor(() => expect(status.mock.calls.length).toBeGreaterThan(before));
  });

  it('debug logging is under Advanced', async () => {
    await renderApp();
    expect(screen.queryByText('Debug logging')).toBeNull();
    await openAdvanced();
    expect(within(row('app.debug')).getByRole('switch', { name: /Debug logging/ })).toBeTruthy();
  });
});
