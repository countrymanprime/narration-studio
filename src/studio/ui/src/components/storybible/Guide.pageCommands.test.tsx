// @vitest-environment jsdom
// What the Story Bible offers the jump menu under "On this page" (Ctrl+F): its entries, found by any of their names (#2251 item 23).
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { currentPageContext, type PageItem } from '../../input/pageCommands';
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
const items = (): readonly PageItem[] => currentPageContext()?.items ?? [];
const heading = () => screen.getAllByRole('heading').map((h) => h.textContent);

describe('the-story-bible-offers-its-entries-to-the-jump-menu', () => {
  it('registers as the Story Bible page', async () => {
    await renderGuide();
    expect(currentPageContext()).toMatchObject({ id: 'story-bible', label: 'Story Bible' });
  });

  it('lists every entry by name, with its kind and its other names to match', async () => {
    const api = await renderGuide();
    const all = (await api.guideEntities()).filter((e) => e.category !== 'Draft');
    await waitFor(() => expect(items()).toHaveLength(all.length));
    const hatter = items().find((i) => i.label === 'Hatter')!;
    expect(hatter).toMatchObject({ group: 'Entries', hint: 'Character', keywords: ['Mad Hatter'] });
  });

  it('opens the chosen entry, clearing a search that hides it', async () => {
    await renderGuide();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search entries' }), 'alice');
    expect(rowNames()).not.toContain('Hatter');
    act(() =>
      items()
        .find((i) => i.label === 'Hatter')!
        .run(),
    );
    expect(rowNames()).toContain('Hatter');
    expect(heading()).toContain('Hatter');
  });

  it('removes its entries when the page goes', async () => {
    await renderGuide();
    cleanup();
    expect(currentPageContext()).toBeNull();
  });
});
