// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { ThemeProvider } from '../../../theme/ThemeContext';
import type { NarrationApi } from '../../../types';
import { SettingsPage } from './SettingsPage';
import { brand } from '../../../brand.gen';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function renderPage({
  api = createMockApi(),
  initialCategory,
  cameFrom,
  go = vi.fn(),
  notify = vi.fn(),
}: { api?: NarrationApi; initialCategory?: string; cameFrom?: string; go?: (path: string) => void; notify?: (message: string) => void } = {}) {
  const data = await api.bootstrap();
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
          <SettingsPage
            data={data}
            notify={notify}
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
const waitForRow = (id: string) =>
  waitFor(() => {
    const found = row(id);
    if (!found) throw new Error(`no row ${id}`);
    return found;
  });

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

  it('draws the magnifier inside the search box, none outside it, and the search row spans a narrow page', async () => {
    await renderPage();
    const find = screen.getByRole('search');
    expect(find.querySelector(':scope > svg')).toBeNull();
    // The magnifier sits inside the box, at its left (SearchField leadingIcon).
    expect(find.querySelector('[data-search-icon] svg')).toBeTruthy();
    expect(find.className).toContain('@max-[760px]:w-full');
    expect(within(find).getByRole('textbox', { name: 'Search settings' }).closest('[class*="flex-[1_1_180px]"]')).toBeTruthy();
  });

  it('has one page title: the section title is smaller than "Settings" and no breadcrumb repeats it (R25, rule 2)', async () => {
    await renderPage();
    const page = await screen.findByRole('heading', { level: 1, name: 'Settings' });
    const section = await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
    expect(page.className).toContain('--font-size-page-title');
    // A section title does not wear the page title's size or face.
    expect(section.className).not.toMatch(/Barlow|1\.875rem|font-size-page-title/);
    expect(screen.queryByLabelText('Breadcrumb')).toBeNull();
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

// Alignment audit, App & updates (XSE1-7, R3SE2-18): the version and the updates are rows under a section label, not boxes in a box.
describe('Settings: This version', () => {
  it('draws the version and the updates as two labelled rows under a This version section label', async () => {
    await renderPage();
    pick('App & updates');
    const section = await screen.findByRole('region', { name: 'This version' });
    expect(within(section).getByRole('heading', { level: 3, name: 'This version' })).toBeTruthy();
    const version = section.querySelector<HTMLElement>('[data-about="version"]')!;
    expect(version.textContent).toContain(brand.name);
    expect(version.textContent).toContain('GNU Affero General Public License');
    expect(version.textContent).toMatch(/Version \S+/);
    expect(version.className).toContain('@min-[860px]:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]');
    const updates = section.querySelector<HTMLElement>('[data-about="updates"]')!;
    expect(within(updates).getByText('Updates')).toBeTruthy();
    expect(section.querySelector('[style*="surface-2"]')).toBeNull();
  });
});

// Alignment audit XSE2-1, XSE2-2: a text box takes its column's width up to its cap, so it never runs past the card in a narrow column
// (tests/visual/settings-fields.spec.ts measures it in a browser at 1024 and 390 px).
describe('Settings: field widths', () => {
  it('caps the REAPER program box at 26rem of its row instead of fixing it at 26rem', async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Advanced/ }));
    const box = await within(row('daw.reaperPath')).findByRole('textbox', { name: 'REAPER program' });
    expect(box.className).toContain('w-full');
    expect(box.className).toContain('max-w-[26rem]');
    expect(box.className).not.toMatch(/(^| )w-\[26rem\]/);
    expect(box.parentElement!.className).toContain('w-full');
  });
});

// Alignment audit, the row itself (settings/row/**): a wide body under the label, a Changed row that keeps its first line, a gap when the row
// stacks, a placeholder for the narrator, one number box width, and a download note in two fixed lines named like the select.
describe('Settings: row layout', () => {
  const openAdvanced = async () => fireEvent.click(await screen.findByRole('button', { name: /Advanced/ }));
  const wideBody = (id: string) => {
    const body = row(id)?.querySelector<HTMLElement>('[data-row-body="wide"]');
    expect(body).toBeTruthy();
    return body!;
  };

  it('draws the Capabilities table under its label across the whole row (XSE2-4, R4SE2-6)', async () => {
    await renderPage();
    await openAdvanced();
    const body = await waitFor(() => wideBody('daw.capabilities'));
    expect(body.className).toContain('col-span-full');
    expect(within(body).getByRole('table')).toBeTruthy();
  });

  it('draws the Credits body across the whole row (XSE2-11)', async () => {
    await renderPage();
    pick('Project');
    const body = await waitFor(() => wideBody('project.credits'));
    expect(body.className).toContain('col-span-full');
    fireEvent.click(await within(body).findByRole('button', { name: /^Edit credits/ }));
    const fields = await waitFor(() => {
      const found = body.querySelector<HTMLElement>('[data-credits-fields]');
      expect(found).toBeTruthy();
      return found!;
    });
    expect(fields.className).toContain('max-w-[32rem]');
    expect(within(fields).getByRole('combobox', { name: 'Template' })).toBeTruthy();
  });

  it("keeps a Changed row's title line one height, its bar the full row and Saved beside Reset (XSE1-22, XSE2-34, R3SE1-16)", async () => {
    await renderPage();
    pick('App & updates');
    fireEvent.change(await screen.findByRole('combobox', { name: /Update channel/ }), { target: { value: 'stable' } });
    const changed = row('app.channel');
    await waitFor(() => expect(within(changed).getByText('Saved')).toBeTruthy());
    expect(within(changed).getByText('Changed').closest('[data-title-line]')!.className).toContain('min-h-6');
    expect(changed.querySelector('[data-changed-bar]')!.className).toContain('inset-y-0');
    const reset = within(changed).getByRole('button', { name: /^Reset Update channel/ });
    expect(within(changed).getByText('Saved').closest('[data-control-line]')).toBe(reset.closest('[data-control-line]'));
  });

  it('leaves a gap between the label and the control when the row stacks (R3SE2-15)', async () => {
    await renderPage();
    pick('App & updates');
    await screen.findByRole('combobox', { name: /Update channel/ });
    expect(row('app.channel').className).toMatch(/(^| )gap-y-3( |$)/);
    expect(row('app.channel').className).toContain('@min-[761px]:gap-y-1.5');
  });

  it('says what goes in an empty Narrator name box (R3SE1-17)', async () => {
    await renderPage();
    pick('Project');
    const box = await waitFor(() => within(row('project.narrator')).getByRole('textbox', { name: /Narrator name/ }));
    expect(box.getAttribute('placeholder')).toBe('Your name as the narrator');
  });

  it('draws a number box 10rem wide with its range in the 13 px note size (XSE2-37)', async () => {
    await renderPage();
    pick('Speech to text');
    await openAdvanced();
    const box = await waitFor(() => within(row('stt.workers')).getByRole('textbox'));
    expect(box.className).toContain('w-40');
    const hint = within(row('stt.workers')).getByText(/^From \d+ to \d+/);
    expect(hint.className).toContain('text-[0.8125rem]');
  });

  it('says under Parallel processes what the value shown runs on this computer, and reads it again when the value changes', async () => {
    const api = createMockApi();
    const asked = vi.spyOn(api, 'coverageWorkerPlan');
    await renderPage({ api });
    pick('Speech to text');
    await openAdvanced();
    const live = await waitFor(() => {
      const found = row('stt.workers').querySelector<HTMLElement>('[data-live="workerPlan"]');
      expect(found?.textContent).toMatch(/^Automatic: \d+ transcriptions? at once, using \d+ of 8 processors for the .+ model\./);
      return found!;
    });
    expect(asked).toHaveBeenLastCalledWith({ workers: 0 });
    const box = within(row('stt.workers')).getByRole('textbox');
    fireEvent.change(box, { target: { value: '3' } });
    fireEvent.blur(box);
    await waitFor(() => expect(live.textContent).toMatch(/^3 transcriptions at once, using 6 of 8 processors/));
    expect(asked).toHaveBeenLastCalledWith({ workers: 3 });
  });

  it('says so under Parallel processes when the host cannot work the count out', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'coverageWorkerPlan').mockRejectedValue(new Error('the settings could not be read'));
    await renderPage({ api });
    pick('Speech to text');
    await openAdvanced();
    await waitFor(() =>
      expect(row('stt.workers').querySelector('[data-live="workerPlan"]')?.textContent).toMatch(
        /^Could not work out how many run at once: .*the settings could not be read$/,
      ),
    );
  });

  it('draws a download note as a status line then an action line, naming the voice as the select does (XSE2-14, R3SE2-20)', async () => {
    await renderPage();
    pick('Voice & pronunciation');
    const note = await waitFor(() => {
      const found = row('voice.id').querySelector<HTMLElement>('[data-asset-note]');
      expect(found).toBeTruthy();
      return found!;
    });
    const [status, actions] = Array.from(note.children) as HTMLElement[];
    expect(note.children).toHaveLength(2);
    expect(within(status).getByText('Not on this computer')).toBeTruthy();
    expect(status.textContent).toContain('LJ Speech (US English, high) must be downloaded before it is used.');
    expect(within(actions).getByRole('button', { name: 'Download LJ Speech (US English, high)' })).toBeTruthy();
    expect(within(actions).getByRole('button', { name: 'Models & downloads' })).toBeTruthy();
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
    expect(row('daw.capabilities')).toBeFalsy();
    fireEvent.click(advanced);
    expect(row('daw.capabilities')).toBeTruthy();
  });

  // Alignment audit (XSE2-18): the opened Advanced sections sit behind a rule, so a section named like one above reads as its advanced part.
  it('draws the opened Advanced sections behind a rule', async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Advanced/ }));
    expect(document.getElementById('advanced-recording')!.className).toContain('border-l-2');
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

  // Alignment audit (XSE2-21): Open <page> and Change it here for now share one line, the button one width for every page.
  it('puts Open <page> on the line of Change it here for now', async () => {
    await renderPage();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Search settings' }), 'preroll');
    const punch = document.querySelector<HTMLElement>('[data-page-setting="ps.punch"]')!;
    const open = within(punch).getByRole('button', { name: /^Open Booth/ });
    const change = within(punch).getByRole('button', { name: 'Change it here for now' });
    expect(open.parentElement).toBe(change.parentElement);
    expect(open.className).toContain('min-w-[9.5rem]');
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

  // Issue 2636: Changed read only the host's files, so a setting this window keeps (Start tone) never showed under it. One change of every
  // kind of row, so a row kind that Changed cannot see fails here.
  it('Changed lists a changed row of every kind, custom bodies included', async () => {
    await renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });

    // This project (a custom body): record with the built-in recorder, not REAPER.
    fireEvent.click(await screen.findByRole('radio', { name: /^Built-in recorder/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to the built-in recorder' }));
    await waitFor(() => expect(within(row('daw.engine')).getByText('Changed')).toBeTruthy());

    // This window (browser scope): Start tone and Theme.
    fireEvent.click(within(row('daw.startTone')).getByRole('radio', { name: 'On' }));
    // The row says so at once, and the category count follows without another interaction.
    expect(within(row('daw.startTone')).getByText('Changed')).toBeTruthy();
    expect(within(nav()).getByRole('button', { name: /^Recording & DAW.*2 changed/ })).toBeTruthy();
    pick('Appearance');
    fireEvent.click(await within(await waitForRow('look.theme')).findByRole('radio', { name: 'Dark' }));
    fireEvent.click(within(row('look.motion')).getByRole('radio', { name: 'Reduce' }));
    fireEvent.change(within(row('look.waveScrollStep')).getByRole('slider', { name: 'Waveform arrow step' }), { target: { value: '27' } });
    const font = within(row('look.reader')).getByRole('combobox', { name: 'Reader font' });
    fireEvent.change(font, { target: { value: 'Verdana' } });

    // This computer (a custom body): the window zoom.
    fireEvent.change(await within(await waitForRow('look.zoom')).findByRole('combobox', { name: 'Zoom' }), { target: { value: '1.25' } });
    await waitFor(() => expect(within(row('look.zoom')).getByText('Changed')).toBeTruthy());

    // This project overrides the computer's value.
    pick('Speech');
    fireEvent.click(await within(await waitForRow('stt.model')).findByRole('button', { name: /Override for this project/ }));

    // The computer's file.
    pick('App & updates');
    fireEvent.change(await screen.findByRole('combobox', { name: /Update channel/ }), { target: { value: 'stable' } });
    await waitFor(() => expect(within(row('app.channel')).getByText('Changed')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Changed' }));
    for (const id of [
      'daw.engine',
      'daw.startTone',
      'look.theme',
      'look.motion',
      'look.waveScrollStep',
      'look.reader',
      'look.zoom',
      'stt.model',
      'app.channel',
    ])
      expect(row(id), id).toBeTruthy();
  }, 60_000);
});

describe('Settings: putting Changed rows back while the Changed list is open', () => {
  // ux-review of the Changed list saw one crash ("useSettingsStore needs a SettingsStoreProvider") after resetting Zoom. Repeated so a race shows.
  it.each(Array.from({ length: 5 }, (_, n) => n + 1))(
    'Zoom, Start tone and the recorder leave the list when put back (run %i)',
    async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await renderPage();
        await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
        fireEvent.click(within(row('daw.startTone')).getByRole('radio', { name: 'On' }));
        pick('Appearance');
        fireEvent.change(await within(await waitForRow('look.zoom')).findByRole('combobox', { name: 'Zoom' }), { target: { value: '1.25' } });
        await waitFor(() => expect(within(row('look.zoom')).getByText('Changed')).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: 'Changed' }));
        await waitFor(() => expect(row('look.zoom')).toBeTruthy());
        expect(row('daw.startTone')).toBeTruthy();

        fireEvent.click(within(row('look.zoom')).getByRole('button', { name: 'Reset zoom to 100%' }));
        await waitFor(() => expect(row('look.zoom')).toBeNull());
        fireEvent.click(within(row('daw.startTone')).getByRole('radio', { name: 'Off' }));
        await waitFor(() => expect(row('daw.startTone')).toBeNull());

        expect(screen.queryByText(/Something went wrong/)).toBeNull();
        expect(screen.getByText('Nothing is changed from the defaults')).toBeTruthy();
        expect(errors.mock.calls.flat().join(' ')).not.toMatch(/SettingsStoreProvider/);
      } finally {
        errors.mockRestore();
      }
    },
    60_000,
  );
});

describe('Settings: arriving from another page', () => {
  it('opens on the setting and focuses it', async () => {
    await renderPage({ api: createMockApi({}, { recording: { engine: 'builtin' } }), initialCategory: 'Teleprompter' });
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
    expect(within(busy).getByRole('heading', { level: 2, name: 'Recording & DAW' }).className).toContain('text-[1.125rem]');
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
    failing = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
    await waitFor(() => expect(screen.queryByText('Your settings could not be read.')).toBeNull());
  });

  it('does not toast a read failure the alert already says, and toasts a project read failure it does not (alignment audit R3SE2-4)', async () => {
    const api = createMockApi();
    api.settingsForScope = async () => {
      throw new Error('the settings file is damaged');
    };
    const notify = vi.fn();
    await renderPage({ api, notify });
    await screen.findByText('Your settings could not be read.');
    // Both reads have ended by now; let the last one's handler run.
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20))));
    expect(notify.mock.calls.flat().filter((message) => String(message).includes('the settings file is damaged'))).toEqual([]);

    cleanup();
    const other = createMockApi();
    const read = other.settingsForScope.bind(other);
    other.settingsForScope = async (scope) => {
      if (scope === 'project') throw new Error('the project file is locked');
      return read(scope);
    };
    const told = vi.fn();
    await renderPage({ api: other, notify: told });
    await waitFor(() => expect(told).toHaveBeenCalledWith(expect.stringContaining('the project file is locked')));
    expect(screen.queryByText('Your settings could not be read.')).toBeNull();
  });

  it('has a Category button that opens the list', async () => {
    await renderPage();
    const toggle = await screen.findByRole('button', { name: /Category/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
