// @vitest-environment jsdom
// The Sort menu over the entry table (SNB-D3): Name, Kind, Book order (by the chapter each entry first appears in) and Most mentioned; one
// choice closes it, the button names the order, and the choice is kept for the next visit.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { rowNames } from './entryTableTestKit';
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
const pick = async (order: string) => {
  await userEvent.click(screen.getByRole('button', { name: /^Sort:/ }));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: order }));
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
};

describe('the-sort-menu-orders-the-list', () => {
  it('orders by most mentioned, and names the order on its button', async () => {
    const api = await renderGuide();
    expect(screen.getByRole('button', { name: 'Sort: Name' })).toBeTruthy();
    await pick('Most mentioned');
    const counts = new Map((await api.guideEntities()).map((e) => [e.canonical_name, e.occurrence_count]));
    const shown = rowNames().map((name) => counts.get(name!)!);
    expect(shown).toEqual([...shown].sort((a, b) => b - a));
    expect(screen.getByRole('button', { name: 'Sort: Most mentioned' })).toBeTruthy();
    // Neither header is the sorted one while the order is not a column's.
    expect(screen.getAllByRole('columnheader').filter((header) => ['ascending', 'descending'].includes(header.getAttribute('aria-sort') ?? ''))).toHaveLength(
      0,
    );
  });

  it('orders by the chapter each entry first appears in', async () => {
    const api = await renderGuide();
    const chapters = await api.manuscriptChapters();
    const place = new Map(chapters.map((chapter, index) => [chapter.id, index]));
    const entries = await api.guideEntities();
    const first = (name: string) => {
      const entry = entries.find((e) => e.canonical_name === name)!;
      const ids = entry.appearances ? entry.appearances.map((a) => a.chapterId) : entry.occurrences.map((o) => o.chapterId ?? o.chapter);
      return Math.min(...ids.map((id) => place.get(id) ?? Number.POSITIVE_INFINITY));
    };
    // The mock book places its entries in more than one chapter, so the order is not trivially sorted.
    expect(new Set(entries.map((e) => e.canonical_name).map(first)).size).toBeGreaterThan(2);
    await pick('Book order');
    await waitFor(() => {
      const order = rowNames().map((name) => first(name!));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });
  });

  it('keeps the choice for the next visit', async () => {
    await renderGuide();
    await pick('Book order');
    cleanup();
    render(
      <MemoryRouter>
        <ApiProvider api={createMockApi()}>
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
    expect(screen.getByRole('button', { name: 'Sort: Book order' })).toBeTruthy();
  });
});
