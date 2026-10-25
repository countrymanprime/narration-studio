// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { ThemeProvider } from '../../../theme/ThemeContext';
import type { NarrationApi } from '../../../types';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function renderPage({
  api = createMockApi(),
  initialCategory,
  cameFrom,
  go = vi.fn(),
}: { api?: NarrationApi; initialCategory?: string; cameFrom?: string; go?: (path: string) => void } = {}) {
  const data = await api.bootstrap();
  render(
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
            go={go}
            refreshBootstrap={async () => undefined}
            initialCategory={initialCategory}
            cameFrom={cameFrom}
          />
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  return { api, go };
}

const nav = () => screen.getByRole('navigation', { name: 'Settings categories' });
const pick = (name: string) => fireEvent.click(within(nav()).getByRole('button', { name: new RegExp(`^${name}`) }));
const row = (id: string) => document.querySelector<HTMLElement>(`[data-row="${id}"]`)!;

describe('Settings: structure', () => {
  it('lists every category in labelled groups, with Set on a page apart', async () => {
    await renderPage();
    for (const group of ['Shared tools', 'This project', 'This computer', 'Elsewhere']) expect(within(nav()).getByRole('group', { name: group })).toBeTruthy();
    expect(
      within(within(nav()).getByRole('group', { name: 'Shared tools' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Recording & DAW', 'Speech to text', 'Voice & pronunciation', 'Models & downloads', 'Delivery']);
    expect(within(within(nav()).getByRole('group', { name: 'Elsewhere' })).getByRole('button', { name: /Set on a page/ })).toBeTruthy();
  });

  it('shows one category at a time and marks it current', async () => {
    await renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
    expect(
      within(nav())
        .getByRole('button', { name: /^Recording & DAW/ })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(row('stt.model')).toBeFalsy();
    pick('Speech to text');
    expect(await screen.findByRole('heading', { level: 2, name: 'Speech to text' })).toBeTruthy();
    expect(row('stt.model')).toBeTruthy();
    expect(row('daw.mic')).toBeFalsy();
  });

  it('says whose each setting is and who uses it, and a Used by link goes to that page', async () => {
    const { go } = await renderPage();
    pick('Speech to text');
    await screen.findByRole('heading', { level: 2, name: 'Speech to text' });
    const model = row('stt.model');
    expect(model.textContent).toContain('All projects');
    fireEvent.click(within(model).getByRole('button', { name: 'Used by Proof. Go to Proof' }));
    expect(go).toHaveBeenCalledWith('/proof');
  });

  // Alignment audit cause E: rows were two equal halves, and selects and text boxes came in different widths.
  it('lays every row out as a label column and a control column, and gives a select and a text box one width', async () => {
    await renderPage();
    pick('Speech to text');
    await screen.findByRole('heading', { level: 2, name: 'Speech to text' });
    const model = row('stt.model');
    expect(model.className).toContain('@min-[860px]:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]');
    expect(model.className).not.toContain('grid-cols-2');
    expect(within(model).getByRole('combobox').className).toContain('w-80');
  });
});

// Alignment audit, Settings page frame (XSE1-16, XSE2-32, R4SE2-1, XSE1-19, XSE2-31, R3SE2-3, XSE2-20, XSE1-26, R4SE2-7, R3SE2-2, XSE2-36).
describe('Settings: page frame', () => {
  it('fills the page to its gutter instead of stopping at 1180 px', async () => {
    await renderPage();
    expect(screen.getByTestId('settings-page').className).not.toMatch(/max-w-\[/);
  });

  it('draws no magnifier outside the search box, and the search row spans a narrow page', async () => {
    await renderPage();
    const find = screen.getByRole('search');
    expect(find.querySelector(':scope > svg')).toBeNull();
    expect(find.className).toContain('@max-[760px]:w-full');
    expect(within(find).getByRole('textbox', { name: 'Search settings' }).closest('[class*="flex-[1_1_180px]"]')).toBeTruthy();
  });

  it('puts Reset to defaults in the title line as a small button, not a 16 px link', async () => {
    await renderPage();
    pick('App & updates');
    fireEvent.change(await screen.findByRole('combobox', { name: /Update channel/ }), { target: { value: 'stable' } });
    const reset = await screen.findByRole('button', { name: 'Reset to defaults' });
    expect(reset.className).toContain('min-h-[var(--button-height-sm)]');
    expect(reset.className).not.toContain('underline');
  });

  it('the folded Category button says Search results while results show, with a drawn chevron', async () => {
    await renderPage();
    const toggle = await screen.findByRole('button', { name: /^Category/ });
    expect(toggle.textContent).toContain('Recording & DAW');
    expect(toggle.textContent).not.toMatch(/[▴▾]/);
    expect(toggle.querySelector('svg')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'whisper' } });
    expect(toggle.textContent).toContain('Search results');
  });

  it('spaces the category groups apart, the same for Elsewhere, and attaches each label to its group', async () => {
    await renderPage();
    const groups = within(nav()).getAllByRole('group');
    expect(new Set(groups.map((group) => group.className)).size).toBe(1);
    expect(groups[0]!.className).toContain('first:mt-0');
    expect(new Set(groups.map((group) => (group.firstElementChild as HTMLElement).className)).size).toBe(1);
  });

  it('the current category keeps a straight accent edge (no left radius)', async () => {
    await renderPage();
    expect(within(nav()).getByRole('button', { name: /^Recording & DAW/ }).className).toContain('aria-[current=page]:rounded-l-none');
  });

  it('Show the whole category is a button at the end of the group header, not a link inside the label', async () => {
    await renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'whisper' } });
    const show = (await screen.findAllByRole('button', { name: 'Show the whole category' }))[0]!;
    expect(show.closest('h3')).toBeNull();
    expect(show.className).toContain('min-h-[var(--button-height-sm)]');
  });

  it('says so when nothing matches in a left-aligned card like the rest of the page', async () => {
    await renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'zzzz' } });
    const empty = document.querySelector<HTMLElement>('[data-empty-results]')!;
    expect(empty.className).not.toContain('text-center');
    expect(empty.className).not.toContain('border-dashed');
  });
});

describe('Settings: editing', () => {
  it('applies at once, says Saved, marks the row Changed and offers Reset', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api });
    pick('App & updates');
    const channel = await screen.findByRole('combobox', { name: /Update channel/ });
    fireEvent.change(channel, { target: { value: 'stable' } });
    await waitFor(() => expect(save).toHaveBeenCalledWith('Updates', 'global', { channel: 'stable' }));
    await waitFor(() => expect(within(row('app.channel')).getByText('Saved')).toBeTruthy());
    expect(within(row('app.channel')).getByText('Changed')).toBeTruthy();
    fireEvent.click(within(row('app.channel')).getByRole('button', { name: 'Reset Update channel to Candidates and stable' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('Updates', 'global', { channel: null }));
    await waitFor(() => expect(within(row('app.channel')).queryByText('Changed')).toBeNull());
  });

  it('a value equal to the default clears the setting instead of pinning it', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api });
    pick('App & updates');
    const channel = await screen.findByRole('combobox', { name: /Update channel/ });
    fireEvent.change(channel, { target: { value: 'candidates' } });
    await waitFor(() => expect(save).toHaveBeenCalledWith('Updates', 'global', { channel: null }));
  });

  it('turns a switch on and off', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api });
    pick('App & updates');
    const toggle = await screen.findByRole('switch', { name: /Check for updates on startup/ });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => expect(save).toHaveBeenCalledWith('Updates', 'global', { check_on_startup: 'false' }));
  });

  it('asks before a costly change and says what happens', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api });
    pick('Speech to text');
    const model = await screen.findByRole('combobox', { name: /Transcription model \(all projects\)/ });
    fireEvent.change(model, { target: { value: 'medium' } });
    const dialog = await screen.findByRole('alertdialog', { name: 'Change the transcription model?' });
    expect(dialog.textContent).toContain('marked out of date');
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change model' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('TranscriptCompare', 'global', { model_size: 'medium' }));
  });

  it('a project can override a shared setting and go back to the computer value', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api });
    pick('Project');
    const build = row('project.build');
    expect(build.textContent).toContain('This project uses the computer setting.');
    fireEvent.click(within(build).getByRole('button', { name: 'Override for this project: Build the Story Bible after import' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('ManuscriptGuide', 'project', { build_after_import: 'true' }));
    await waitFor(() => expect(within(row('project.build')).getByText('overridden here', { exact: false })).toBeTruthy());
    fireEvent.click(within(row('project.build')).getByRole('button', { name: 'Use computer setting for Build the Story Bible after import' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('ManuscriptGuide', 'project', { build_after_import: null }));
    await waitFor(() => expect(row('project.build').textContent).toContain('This project uses the computer setting.'));
  });

  it('keeps the previous value and says why when the host refuses', async () => {
    const api = createMockApi();
    api.saveSettings = async () => {
      throw new Error('the settings file is read-only');
    };
    await renderPage({ api });
    pick('App & updates');
    const channel = (await screen.findByRole('combobox', { name: /Update channel/ })) as HTMLSelectElement;
    fireEvent.change(channel, { target: { value: 'stable' } });
    expect((await within(row('app.channel')).findByText(/read-only/)).textContent).toContain('read-only');
    expect(screen.getByText('Changes cannot be saved right now.')).toBeTruthy();
    expect(channel.value).toBe('candidates');
  });

  it('Advanced is closed until opened, and says how many settings it holds', async () => {
    await renderPage();
    const advanced = await screen.findByRole('button', { name: /Advanced/ });
    expect(advanced.getAttribute('aria-expanded')).toBe('false');
    expect(advanced.textContent).toMatch(/\(\d+\)/);
    expect(row('daw.experimental')).toBeFalsy();
    fireEvent.click(advanced);
    expect(row('daw.experimental')).toBeTruthy();
  });

  it('a category shows how many are changed and resets them together', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    await renderPage({ api });
    pick('App & updates');
    fireEvent.change(await screen.findByRole('combobox', { name: /Update channel/ }), { target: { value: 'stable' } });
    await waitFor(() => expect(within(nav()).getByLabelText('1 changed')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('Updates', 'global', { channel: null }));
    await waitFor(() => expect(within(nav()).queryByLabelText('1 changed')).toBeNull());
  });
});

describe('Settings: search and filters', () => {
  it('finds a setting by a word that is not in its name, across categories', async () => {
    await renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Search settings' }), 'whisper');
    expect(row('stt.model')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /Speech to text/ })).toBeTruthy();
  });

  it('finds a setting that moved to a page', async () => {
    await renderPage();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Search settings' }), 'breath');
    expect(document.querySelector('[data-page-setting="ps.cleanup"]')).toBeTruthy();
  });

  it('keeps the punch pre-roll and the Audacity backups editable here, with the page shortcut beside them', async () => {
    await renderPage();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Search settings' }), 'preroll');
    const punch = document.querySelector<HTMLElement>('[data-page-setting="ps.punch"]');
    expect(punch).toBeTruthy();
    expect(within(punch!).getByRole('button', { name: /^Open Booth/ })).toBeTruthy();
    expect(within(punch!).getByRole('button', { name: 'Change it here for now' })).toBeTruthy();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Search settings' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Search settings' }), 'retention');
    const backups = document.querySelector<HTMLElement>('[data-page-setting="ps.backups"]');
    expect(backups).toBeTruthy();
    expect(within(backups!).getByRole('button', { name: /^Open Editing/ })).toBeTruthy();
    expect(within(backups!).getByRole('button', { name: 'Change it here for now' })).toBeTruthy();
  });

  it('lists the favourite effects with a way to Editing and the panel that edits them here', async () => {
    await renderPage();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Search settings' }), 'plugin');
    const entry = document.querySelector<HTMLElement>('[data-page-setting="ps.fx"]');
    expect(entry).toBeTruthy();
    expect(within(entry!).getByRole('button', { name: /^Open Editing/ })).toBeTruthy();
    expect(within(entry!).getByRole('button', { name: 'Change it here for now' })).toBeTruthy();
  });

  it('Escape clears the search', async () => {
    await renderPage();
    const box = (await screen.findByRole('textbox', { name: 'Search settings' })) as HTMLInputElement;
    await userEvent.type(box, 'zzzz');
    expect(screen.getByText('No settings match “zzzz”')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(box.value).toBe('');
    expect(screen.queryByText('No settings match “zzzz”')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    await renderPage();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Search settings' }), 'zzzz');
    expect(screen.getByText('No settings match “zzzz”')).toBeTruthy();
    expect(screen.getByText(/Try a word from the setting’s name/)).toBeTruthy();
  });

  it('Changed lists what differs from the default, wherever it is, and says when nothing does', async () => {
    const api = createMockApi();
    await renderPage({ api });
    await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
    fireEvent.click(screen.getByRole('button', { name: 'Changed' }));
    expect(screen.getByText('Nothing is changed from the defaults')).toBeTruthy();
    // No search was typed, so there is no word to try instead.
    expect(screen.queryByText(/Try a word from the setting’s name/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    pick('App & updates');
    fireEvent.change(await screen.findByRole('combobox', { name: /Update channel/ }), { target: { value: 'stable' } });
    await waitFor(() => expect(within(row('app.channel')).getByText('Changed')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Changed' }));
    expect(row('app.channel')).toBeTruthy();
  });
});

describe('Settings: arriving from another page', () => {
  it('opens on the setting and focuses it', async () => {
    await renderPage({ initialCategory: 'Teleprompter' });
    const mic = await screen.findByRole('combobox', { name: /Microphone/ });
    await waitFor(() => expect(document.activeElement).toBe(mic));
    expect(
      within(nav())
        .getByRole('button', { name: /^Recording & DAW/ })
        .getAttribute('aria-current'),
    ).toBe('page');
  });
});

describe('Settings: Back to the page a link came from', () => {
  it('offers Back to the page named by the path, and goes there', async () => {
    const { go } = await renderPage({ cameFrom: '/booth?target=x', initialCategory: 'Teleprompter' });
    fireEvent.click(await screen.findByRole('button', { name: /Back to Booth/ }));
    expect(go).toHaveBeenCalledWith('/booth?target=x');
  });

  it('offers no Back when the narrator came by the navigation rail', async () => {
    await renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull();
  });
});

describe('Settings: states', () => {
  it('loading shows placeholders and marks the pane busy', async () => {
    const api = createMockApi();
    api.settingsForScope = () => new Promise(() => undefined);
    await renderPage({ api });
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.getByText('Reading your settings…')).toBeTruthy();
  });

  it('loading keeps the title and blurb of the loaded page and draws section cards of label and control rows', async () => {
    const api = createMockApi();
    api.settingsForScope = () => new Promise(() => undefined);
    await renderPage({ api });
    const busy = document.querySelector<HTMLElement>('[aria-busy="true"]')!;
    expect(within(busy).getByRole('heading', { level: 2, name: 'Recording & DAW' }).className).toContain('leading-[1.1]');
    expect(busy.textContent).toContain('How the app records');
    expect(busy.querySelectorAll('.rounded-\\[var\\(--radius-card\\)\\]').length).toBeGreaterThan(1);
    expect(busy.querySelector('[class*="grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]"]')).toBeTruthy();
  });

  it('an unreadable settings file shows an alert, disables the controls and Retry recovers', async () => {
    const api = createMockApi();
    const read = api.settingsForScope.bind(api);
    let failing = true;
    api.settingsForScope = async (scope) => {
      if (failing) throw new Error('the settings file is damaged');
      return read(scope);
    };
    await renderPage({ api });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Your settings could not be read.');
    // The banner sits above the breadcrumb, so the breadcrumb stays on its title (R4SE2-7).
    const crumb = screen.getByLabelText('Breadcrumb');
    expect(alert.compareDocumentPosition(crumb) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    failing = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
    await waitFor(() => expect(screen.queryByText('Your settings could not be read.')).toBeNull());
  });

  it('has a Category button that opens the list', async () => {
    await renderPage();
    const toggle = await screen.findByRole('button', { name: /Category/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
