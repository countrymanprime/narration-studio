// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { currentPageContext, type PageItem } from '../../../input/pageCommands';
import { ThemeProvider } from '../../../theme/ThemeContext';
import type { NarrationApi } from '../../../types';
import { CATEGORIES } from '../registry/categories';
import { PAGE_SETTINGS } from '../registry/pageSettings';
import { ROWS } from '../registry/rows';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function renderPage(api: NarrationApi = createMockApi()) {
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
          />
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
  return view;
}

const items = () => currentPageContext()?.items ?? [];
const item = (id: string): PageItem => {
  const found = items().find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no page item ${id}`);
  return found;
};
const row = (id: string) => document.querySelector<HTMLElement>(`[data-row="${id}"]`);
/** Waits for the settings read, so rows that need a host field are listed. */
const settled = () => waitFor(() => expect(row('daw.engine')).toBeTruthy());

describe('Settings: jump menu page items', () => {
  it('names the page and replaces the global Settings rows with its own category items', async () => {
    await renderPage();
    const page = currentPageContext()!;
    expect(page.label).toBe('Settings');
    expect(page.supersedes).toEqual(['Settings']);
    const categories = items().filter((entry) => entry.group === 'Categories');
    expect(categories.map((entry) => entry.label)).toEqual([...CATEGORIES.map((category) => category.label), 'Set on a page']);
  });

  it('offers one item per setting row under its category, with the description as the hint', async () => {
    await renderPage();
    await settled();
    const rows = items().filter((entry) => entry.id.startsWith('row.'));
    expect(rows).toHaveLength(ROWS.length + PAGE_SETTINGS.length);
    const model = item('row.stt.model');
    const meta = ROWS.find((candidate) => candidate.id === 'stt.model')!;
    expect(model.label).toBe(meta.label);
    expect(model.group).toBe('Speech to text');
    expect(model.hint).toBe(meta.desc);
    expect(model.keywords?.join(' ')).toContain(meta.syn!);
    expect(item('row.ps.cleanup').group).toBe('Set on a page');
  });

  it('keeps a row for another recording tool listed, off, with the reason', async () => {
    await renderPage(createMockApi({}, { dawChoice: { chosen: 'Audacity' }, daw: { daw: 'Audacity' }, recording: { engine: 'daw' } }));
    await waitFor(() => expect(row('daw.reaperPath')).toBeFalsy());
    const reaper = item('row.daw.reaperPath');
    expect(reaper.disabledReason).toMatch(/REAPER/);
    expect(item('row.stt.model').disabledReason).toBeUndefined();
  });

  it('a category item shows that category and focuses its heading', async () => {
    await renderPage();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    act(() => item('category.speech').run());
    await screen.findByRole('heading', { level: 2, name: 'Speech to text' });
    await waitFor(() => expect(focus.mock.contexts.some((el) => (el as HTMLElement).id === 'settings-heading')).toBe(true));
    focus.mockRestore();
  });

  it('a row item opens its category, scrolls to the row and focuses its control', async () => {
    await renderPage();
    await settled();
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    act(() => item('row.stt.model').run());
    await waitFor(() => expect(row('stt.model')).toBeTruthy());
    await waitFor(() => expect(document.activeElement?.id).toBe('set-stt.model'));
    expect(scroll).toHaveBeenCalled();
  });

  it('a row under Advanced is opened first', async () => {
    await renderPage();
    await settled();
    expect(row('daw.experimental')).toBeFalsy();
    act(() => item('row.daw.experimental').run());
    await waitFor(() => expect(row('daw.experimental')).toBeTruthy());
    await waitFor(() => expect(row('daw.experimental')!.contains(document.activeElement)).toBe(true));
  });

  it('a row on another tab leaves the search and filter that hid it', async () => {
    await renderPage();
    await settled();
    act(() => item('row.project.build').run());
    await waitFor(() => expect(row('project.build')).toBeTruthy());
  });

  it('a page setting opens Set on a page and focuses its entry', async () => {
    await renderPage();
    await settled();
    act(() => item('row.ps.cleanup').run());
    await waitFor(() => expect(document.querySelector('[data-page-setting="ps.cleanup"]')!.contains(document.activeElement)).toBe(true));
  });

  it('registers nothing after the page unmounts', async () => {
    const view = await renderPage();
    expect(currentPageContext()).not.toBeNull();
    view.unmount();
    expect(currentPageContext()).toBeNull();
  });

  it('has no host loader, so nothing waits on one', async () => {
    await renderPage();
    expect(currentPageContext()!.load).toBeUndefined();
  });
});
