// @vitest-environment jsdom
// SN-B94: the Story Bible list and frame as the Studio Next mock draws them (tests/bible.test.tsx): kind chips over the list, two-line rows,
// the type colour on chips and rows, and the page's own ask for a manuscript.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { cellsOf, chooseKind, entryRows, rowName } from './entryTableTestKit';
import { Guide } from './Guide';

afterEach(cleanup);

function renderGuide(
  props: { hasManuscript?: boolean; onImport?: () => void } = {},
  prepare: (api: ReturnType<typeof createMockApi>) => Promise<void> | void = () => {},
) {
  window.localStorage.clear();
  const api = createMockApi();
  const ready = Promise.resolve(prepare(api));
  const loadEntities = vi.spyOn(api, 'guideEntities');
  return ready.then(() => {
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <StudioProvider>
            <OverlayProvider>
              <CommandRouter>
                <Guide notify={vi.fn()} goToManuscript={vi.fn()} {...props} />
              </CommandRouter>
            </OverlayProvider>
          </StudioProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    return { api, loadEntities };
  });
}

const rows = entryRows;

describe('asks-for-a-manuscript-when-there-is-none', () => {
  it('asks for a manuscript when there is none', async () => {
    const onImport = vi.fn();
    const { loadEntities } = await renderGuide({ hasManuscript: false, onImport });
    expect(screen.getByRole('heading', { name: 'Story Bible' })).toBeTruthy();
    expect(screen.getByText('This project has no manuscript yet. Import one to begin.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Import manuscript' }));
    expect(onImport).toHaveBeenCalledTimes(1);
    // The page has nothing to read yet, so it asks the host for nothing and draws no list.
    expect(loadEntities).not.toHaveBeenCalled();
    expect(screen.queryByRole('table', { name: 'Story Bible entries' })).toBeNull();
  });
});

describe('the-list-is-a-filter-menu-over-a-table-of-entries', () => {
  it('lists entries as table rows under a Filter menu that counts each kind, and there are no tabs', async () => {
    const { api } = await renderGuide();
    await screen.findAllByText('Alice');
    const types = await api.guideTypes();
    const entries = await api.guideEntities();
    // The Filter menu (SNB-D3) lists every kind with its count, none ticked: every kind is shown.
    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const boxes = await screen.findAllByRole('menuitemcheckbox');
    expect(boxes.map((box) => box.textContent)).toEqual(types.map((type) => `${type.name}, ${entries.filter((e) => e.category === type.name).length}`));
    expect(boxes.every((box) => box.getAttribute('aria-checked') === 'false')).toBe(true);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // The app is for one book: no Series tab, and no tabs at all on this page.
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText('Series')).toBeNull();

    const alice = rows().find((row) => rowName(row) === 'Alice')!;
    // The third cell is the Hear button, which has a name but no text.
    expect(cellsOf(alice).map((cell) => cell.textContent)).toEqual(['Alice', 'Character', '']);

    await chooseKind('Place');
    const shown = rows();
    expect(shown.length).toBeGreaterThan(0);
    shown.forEach((row) => expect(cellsOf(row)[1]!.textContent).toBe('Place'));
    await chooseKind('All');
    expect(rows().length).toBeGreaterThan(shown.length);
  });

  it('says so when no entry matches the kind', async () => {
    await renderGuide();
    await screen.findAllByText('Alice');
    await chooseKind('Event');
    expect(screen.getByText('No entries match.')).toBeTruthy();
  });

  it('selects an entry when its row is pressed and marks it current', async () => {
    await renderGuide();
    await screen.findAllByText('Alice');
    const rabbit = rows().find((row) => rowName(row) === 'White Rabbit')!;
    await userEvent.click(rabbit);
    expect(rabbit.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('heading', { name: 'White Rabbit' })).toBeTruthy();
  });
});

describe('the-type-colour-tints-the-rows', () => {
  const swatchOf = (element: Element) => element.querySelector<HTMLElement>('[aria-hidden="true"]')!.style.background;

  it('colours each row from the type colour', async () => {
    await renderGuide({}, async (api) => api.guideTypeSetColour('Character', 'rose'));
    await screen.findAllByText('Alice');
    const alice = rows().find((row) => rowName(row) === 'Alice')!;
    expect(swatchOf(alice)).toBe('var(--event)');
    expect(swatchOf(rows().find((row) => rowName(row) === 'Queen’s garden')!)).toBe('var(--place)');
  });

  it('draws a row the build was unsure of in the amber (D7)', async () => {
    await renderGuide();
    await screen.findAllByText('Alice');
    const unsure = (await createMockApi().guideEntities()).find((row) => row.category === 'Needs Review')!;
    const row = rows().find((r) => rowName(r) === unsure.canonical_name)!;
    await waitFor(() => expect(swatchOf(row)).toBe('var(--warn)'));
    // The review state is the row's badge, not the type word.
    expect(cellsOf(row)[1]!.textContent).toBe('Type not set');
  });
});
