// @vitest-environment jsdom
// Settings with no project open (issue 3024): every category draws, the rows that are this computer's work, and the rows that need a project
// say so and stay where they are, disabled. Nothing throws, nothing is blank, nothing asks the host for a project's data.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { ThemeProvider } from '../../../theme/ThemeContext';
import type { NarrationApi } from '../../../types';
import { CATEGORIES } from '../registry/categories';
import { PAGE_SETTINGS } from '../registry/pageSettings';
import { ROWS } from '../registry/rows';
import { needsProject, NEEDS_PROJECT_REASON } from '../registry/projectNeeds';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function renderPage({
  api = createMockApi({}, { projectFolder: '' }),
  notify = vi.fn(),
  go = vi.fn(),
  cameFrom,
}: { api?: NarrationApi; notify?: () => void; go?: (path: string) => void; cameFrom?: string } = {}) {
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
            cameFrom={cameFrom}
          />
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  return { api, notify, go };
}

const nav = () => screen.getByRole('navigation', { name: 'Settings categories' });
const pick = (name: string) => fireEvent.click(within(nav()).getByRole('button', { name: new RegExp(`^${name}`) }));
const rowEl = (id: string) => document.querySelector<HTMLElement>(`[data-row="${id}"]`);
const everyControl = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>('input, select, textarea, button[role="switch"], [role="radio"], [role="combobox"]'),
];

describe('Settings with no project: every category', () => {
  const rowsOf = (id: string) => ROWS.filter((row) => row.cat === id);

  for (const category of CATEGORIES) {
    it(`${category.label} draws without an error and keeps its project rows, disabled, with the reason`, async () => {
      const { notify } = await renderPage();
      pick(category.label);
      await screen.findByRole('heading', { level: 2, name: category.label });
      if (category.id !== 'models') await waitFor(() => expect(screen.queryByText('Reading your settings…')).toBeNull());
      // (jsdom has no audio outputs to list, so an alert about those is not this test's.)
      expect(screen.queryAllByRole('alert').filter((alert) => !/outputs/.test(alert.textContent ?? ''))).toEqual([]);
      for (const row of rowsOf(category.id).filter((candidate) => !candidate.advanced && needsProject(candidate))) {
        const drawn = rowEl(row.id);
        // A row the registry hides for another recording tool is not a project row that vanished.
        if (!drawn) {
          expect(row.needs).toBeDefined();
          continue;
        }
        expect(within(drawn).getByText(NEEDS_PROJECT_REASON)).toBeTruthy();
        expect(drawn.getAttribute('data-needs-project')).toBe('true');
        for (const control of everyControl(drawn))
          expect((control as HTMLInputElement).disabled || control.getAttribute('aria-disabled') === 'true').toBe(true);
      }
      expect(notify).not.toHaveBeenCalled();
    });
  }

  it('Set on a page draws every entry; the panels that read project data are held back with the reason, the rest edit the computer', async () => {
    const { notify } = await renderPage();
    pick('Set on a page');
    for (const item of PAGE_SETTINGS) {
      const entry = await waitFor(() => {
        const found = document.querySelector<HTMLElement>(`[data-page-setting="${item.id}"]`);
        if (!found) throw new Error(`no entry ${item.id}`);
        return found;
      });
      expect(entry.textContent).toContain(item.label);
      fireEvent.click(within(entry).getByRole('button', { name: /Change it here for now/ }));
      await waitFor(() => expect(within(entry).queryByText('Reading the settings…')).toBeNull());
      if (item.panel === 'backups') expect(within(entry).getByText(NEEDS_PROJECT_REASON)).toBeTruthy();
      // The scope switch has no "This project" to offer.
      expect(within(entry).queryByRole('radio', { name: 'This project' })).toBeNull();
    }
    expect(notify).not.toHaveBeenCalled();
  });

  it("keeps this computer's rows editable: a setting saves to the computer's file", async () => {
    const { api } = await renderPage();
    const save = vi.spyOn(api, 'saveSettings');
    pick('App & updates');
    const channel = await screen.findByRole('combobox', { name: /Update channel/ });
    expect((channel as HTMLSelectElement).disabled).toBe(false);
    fireEvent.change(channel, { target: { value: 'stable' } });
    await waitFor(() => expect(save).toHaveBeenCalledWith('Updates', 'global', { channel: 'stable' }));
  });

  it("does not ask for a project's data: no schedule, chapter sync or credits-values read", async () => {
    const api = createMockApi({}, { projectFolder: '' });
    const reads = {
      productionPlan: vi.spyOn(api, 'productionPlan'),
      creditsProjectValues: vi.spyOn(api, 'creditsProjectValues'),
      creditsStatuses: vi.spyOn(api, 'creditsStatuses'),
      manuscriptChapters: vi.spyOn(api, 'manuscriptChapters'),
      guideEntities: vi.spyOn(api, 'guideEntities'),
    };
    await renderPage({ api });
    for (const category of CATEGORIES) {
      pick(category.label);
      await screen.findByRole('heading', { level: 2, name: category.label });
    }
    await userEvent.click(within(nav()).getByRole('button', { name: /^Set on a page/ }));
    // Let the Changed probes run.
    await new Promise((resolve) => setTimeout(resolve, 50));
    for (const [name, spy] of Object.entries(reads)) expect(spy, name).not.toHaveBeenCalled();
  });
});

describe('Settings with no project: the page', () => {
  it('searches, and a project row found by search is held back like it is in its category', async () => {
    await renderPage();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Search settings' }), { target: { value: 'record with' } });
    const row = await waitFor(() => {
      const found = rowEl('daw.engine');
      if (!found) throw new Error('not found yet');
      return found;
    });
    expect(within(row).getByText(NEEDS_PROJECT_REASON)).toBeTruthy();
  });

  it('turns the "In this project" filter off, with Changed still working', async () => {
    await renderPage();
    const filter = await screen.findByRole('group', { name: 'Show' });
    expect(within(filter).getByRole('button', { name: 'In this project' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(filter).getByRole('button', { name: 'Changed' }));
    await screen.findByText('Nothing is changed from the defaults');
  });

  it('the Used by links are plain text: the pages they name need a project', async () => {
    await renderPage();
    pick('Speech to text');
    const model = await waitFor(() => {
      const found = rowEl('stt.model');
      if (!found) throw new Error('no row');
      return found;
    });
    expect(within(model).queryByRole('button', { name: /^Used by Proof/ })).toBeNull();
    expect(model.textContent).toContain('Used by');
    expect(model.textContent).toContain('Proof');
  });

  it('Models & downloads names the pages that use a model without linking them', async () => {
    await renderPage();
    pick('Models & downloads');
    await screen.findAllByRole('button', { name: /^Download /i });
    expect(screen.queryAllByRole('button', { name: /^Used by .* Go to / })).toEqual([]);
    expect(screen.getAllByText('Story Bible').length).toBeGreaterThan(0);
  });

  it('Back goes to the project picker, named so', async () => {
    const { go } = await renderPage({ cameFrom: '/' });
    fireEvent.click(await screen.findByRole('button', { name: 'Back to project picker' }));
    expect(go).toHaveBeenCalledWith('/');
  });

  it('a project row that is a host field is drawn disabled, not hidden', async () => {
    await renderPage();
    pick('Project');
    const row = await waitFor(() => {
      const found = rowEl('project.wordsPerPage');
      if (!found) throw new Error('no row');
      return found;
    });
    expect(within(row).getByText(NEEDS_PROJECT_REASON)).toBeTruthy();
    expect((within(row).getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('a project that is open is unchanged: no reason, controls live', async () => {
    const api = createMockApi();
    await renderPage({ api });
    pick('Project');
    await waitFor(() => expect(rowEl('project.wordsPerPage')).toBeTruthy());
    expect(screen.queryByText(NEEDS_PROJECT_REASON)).toBeNull();
  });

  it('gives the disabled "In this project" filter a reason a keyboard user can reach and a screen reader hears', async () => {
    await renderPage();
    const filter = await screen.findByRole('button', { name: 'In this project' });
    expect(filter.hasAttribute('disabled')).toBe(false);
    expect(filter.getAttribute('aria-disabled')).toBe('true');
    const reason = document.getElementById(filter.getAttribute('aria-describedby')!)!;
    expect(reason.textContent).toBe('Open a project to see what it sets');
    filter.focus();
    expect(document.activeElement).toBe(filter);
    fireEvent.click(filter);
    expect(filter.getAttribute('aria-pressed')).toBe('false');
  });

  it('ties the reason to the disabled control, so a screen reader announces it', async () => {
    await renderPage();
    pick('Project');
    const row = await waitFor(() => {
      const found = rowEl('project.wordsPerPage');
      if (!found) throw new Error('no row');
      return found;
    });
    const control = within(row).getByRole('textbox');
    const described = control
      .getAttribute('aria-describedby')!
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain(NEEDS_PROJECT_REASON);
  });

  it('describes a project row without saying "this project" when none is open', async () => {
    await renderPage();
    const row = await waitFor(() => {
      const found = rowEl('daw.engine');
      if (!found) throw new Error('no row');
      return found;
    });
    expect(row.textContent).not.toContain('Where this project');
    expect(row.textContent).toContain('Where a project’s recordings live.');
  });
});
