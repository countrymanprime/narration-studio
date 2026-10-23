// @vitest-environment jsdom
// The right-click menu of an entry row (the mock's registerContext for the Bible page): what it offers, and that each item does what the
// entry's own button does.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { contextItemsFor } from '../../registries/context';
import { StudioProvider } from '../../studio/StudioProvider';
import { Guide } from './Guide';

afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

async function mount(flag?: string) {
  window.localStorage.clear();
  const api = createMockApi();
  if (flag) {
    const rows = await api.guideEntities();
    vi.spyOn(api, 'guideEntities').mockResolvedValue(
      rows.map((entry) => (entry.canonical_name === flag ? { ...entry, review: { entry: true, aliases: [] } } : entry)),
    );
  }
  render(
    <MemoryRouter initialEntries={['/story-bible']}>
      <ApiProvider api={api}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
              <Where />
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findAllByText('Alice');
  return api;
}
const row = (name: string) =>
  within(screen.getByRole('list', { name: 'Story Bible entries' }))
    .getAllByRole('button')
    .find((button) => button.querySelector('[data-line="name"] .truncate')?.textContent === name)!;
const items = (name: string) => contextItemsFor(row(name))!;
const labels = (name: string) => items(name).map((item) => item.label);

describe('the entry row menu', () => {
  it('offers Open, Find in the manuscript and Delete entry on any entry', async () => {
    await mount();
    expect(labels('Alice')).toEqual(['Open', 'Find in the manuscript', 'Delete entry']);
  });

  it('offers Mark reviewed only on an entry that needs review', async () => {
    await mount('Hatter');
    expect(labels('Hatter')).toContain('Mark reviewed');
    expect(labels('Alice')).not.toContain('Mark reviewed');
  });

  it('Open selects the entry', async () => {
    await mount();
    items('Hatter')
      .find((item) => item.label === 'Open')!
      .onSelect();
    expect(await screen.findByRole('heading', { name: 'Hatter' })).toBeTruthy();
    expect(row('Hatter').getAttribute('aria-current')).toBe('true');
  });

  it("Find in the manuscript opens the Script's Find on the name", async () => {
    await mount();
    items('Hatter')
      .find((item) => item.label === 'Find in the manuscript')!
      .onSelect();
    await vi.waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/script/));
    expect(decodeURIComponent(screen.getByTestId('where').textContent!)).toContain('Hatter');
  });

  it("Delete entry opens the entry's own confirm, and deletes nothing until it is confirmed", async () => {
    const api = await mount();
    const del = vi.spyOn(api, 'guideDelete');
    items('Hatter')
      .find((item) => item.label === 'Delete entry')!
      .onSelect();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Hatter');
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(del).not.toHaveBeenCalled();
  });

  it('Delete entry on a locked entry says why it is off instead of vanishing', async () => {
    await mount();
    const locked = items('Queen of Hearts').find((item) => item.label === 'Delete entry')!;
    expect(locked.unavailable).toBe('A locked entry cannot be deleted. Unlock it first.');
  });

  it("Mark reviewed runs the entry's own Mark reviewed, once", async () => {
    const api = await mount('Hatter');
    const mark = vi.spyOn(api, 'guideMarkReviewed');
    items('Hatter')
      .find((item) => item.label === 'Mark reviewed')!
      .onSelect();
    await vi.waitFor(() => expect(mark).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mark.mock.calls[0][0]).toBeTruthy();
  });

  it('is not offered on anything that is not an entry row', async () => {
    await mount();
    expect(contextItemsFor(screen.getByRole('textbox', { name: 'Search entries' }))).toBeNull();
  });
});
