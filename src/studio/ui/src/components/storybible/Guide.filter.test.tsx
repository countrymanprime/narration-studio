// @vitest-environment jsdom
// The Filter menu over the entry table (SNB-D3): several kinds at once, Pronunciation, Show; the filters on as chips that remove them, and
// a badge that counts them.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { cellsOf, entryRows, rowNames } from './entryTableTestKit';
import { Guide } from './Guide';

afterEach(cleanup);

async function renderGuide() {
  window.localStorage.clear();
  const api = createMockApi();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findAllByText('Alice');
  return api;
}
const openFilter = async () => {
  await userEvent.click(screen.getByRole('button', { name: /^Filter/ }));
  return screen.findByRole('menu');
};
const closeFilter = async () => {
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
};
const kindsShown = () => new Set(entryRows().map((row) => cellsOf(row)[1]!.textContent));

describe('the-filter-menu-narrows-the-list', () => {
  it('keeps several kinds at once and counts them on its button, with a chip for each', async () => {
    await renderGuide();
    await openFilter();
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /^Character/ }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: /^Place/ }));
    // The menu stays open while choices are made.
    expect(screen.getByRole('menu')).toBeTruthy();
    await closeFilter();
    expect(kindsShown()).toEqual(new Set(['Character', 'Place']));
    expect(screen.getByRole('button', { name: 'Filter, 2 on' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Character' }));
    expect(kindsShown()).toEqual(new Set(['Place']));
    expect(screen.getByRole('button', { name: 'Filter, 1 on' })).toBeTruthy();
  });

  it('says when the open entry is not among the rows the filters leave (R3SB1-2)', async () => {
    await renderGuide();
    expect(screen.queryByText('Alice is open but not in this list.')).toBeNull();
    await openFilter();
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /^Place/ }));
    await closeFilter();
    expect(screen.getByText('Alice is open but not in this list.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Place' }));
    expect(screen.queryByText('Alice is open but not in this list.')).toBeNull();
  });

  it('keeps the entries with no pronunciation yet, or only those with one', async () => {
    const api = await renderGuide();
    const entries = (await api.guideEntities()).filter((e) => e.category !== 'Draft');
    const without = entries.filter((e) => !e.pronunciation.ipa.trim()).map((e) => e.canonical_name);
    await openFilter();
    await userEvent.click(screen.getByRole('menuitemradio', { name: /^None yet/ }));
    await closeFilter();
    expect([...rowNames()].sort()).toEqual([...without].sort());
    expect(screen.getByRole('button', { name: 'Remove filter No pronunciation' })).toBeTruthy();
    await openFilter();
    await userEvent.click(screen.getByRole('menuitemradio', { name: /^Has one/ }));
    await closeFilter();
    expect(rowNames().some((name) => without.includes(name!))).toBe(false);
  });

  it('Clear all removes every filter and its chips; with none on there are no chips', async () => {
    await renderGuide();
    expect(screen.queryByRole('group', { name: 'Filters on' })).toBeNull();
    const all = rowNames().length;
    await openFilter();
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /^Place/ }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /^Has one/ }));
    await closeFilter();
    expect(rowNames().length).toBeLessThan(all);
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(rowNames()).toHaveLength(all);
    expect(screen.queryByRole('group', { name: 'Filters on' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy();
  });

  it('offers no kinds while the types cannot be read', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'guideTypes').mockRejectedValue(new Error('no answer'));
    window.localStorage.clear();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <StudioProvider>
            <OverlayProvider>
              <CommandRouter>
                <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
              </CommandRouter>
            </OverlayProvider>
          </StudioProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    await screen.findAllByText('Alice');
    await screen.findByText(/Could not read the entry types/);
    await openFilter();
    expect(screen.queryAllByRole('menuitemcheckbox')).toHaveLength(0);
    expect(screen.getAllByRole('menuitemradio').length).toBeGreaterThan(0);
  });
});
