// @vitest-environment jsdom
// SN-B94 (G2): the search box over the entries narrows the list by name and by alias.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
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

const names = () =>
  within(screen.getByRole('list', { name: 'Story Bible entries' }))
    .queryAllByRole('button')
    .map((row) => row.querySelector('[data-line="name"]')!.textContent);

describe('the-search-box-narrows-the-list', () => {
  it('Search entries narrows the list by name and by alias', async () => {
    const api = await renderGuide();
    const all = await api.guideEntities();
    const box = screen.getByRole('textbox', { name: 'Search entries' });

    await userEvent.type(box, 'alice');
    expect(names()).toContain('Alice');
    expect(names().length).toBeLessThan(all.length);

    // An alias that is not part of the entry's own name finds the entry.
    await userEvent.clear(box);
    const withAlias = all.find((entry) => entry.aliases.some((alias) => !entry.canonical_name.toLowerCase().includes(alias.text.toLowerCase())))!;
    const alias = withAlias.aliases.find((a) => !withAlias.canonical_name.toLowerCase().includes(a.text.toLowerCase()))!.text;
    await userEvent.type(box, alias.toUpperCase());
    expect(names()).toContain(withAlias.canonical_name);

    await userEvent.clear(box);
    await userEvent.type(box, 'zzzz');
    expect(names()).toEqual([]);
    expect(screen.getByText('No entries match.')).toBeTruthy();
  });

  it('searches within the kind chip that is on', async () => {
    await renderGuide();
    await userEvent.click(within(screen.getByRole('group', { name: 'Kind' })).getByRole('button', { name: 'Place' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Search entries' }), 'alice');
    expect(names()).toEqual([]);
  });
});
