// @vitest-environment jsdom
// SN-B94: the Story Bible list and frame as the Studio Next mock draws them (tests/bible.test.tsx): kind chips over the list, two-line rows,
// the type colour on chips and rows, and the page's own ask for a manuscript.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { cellsOf, entryRows, rowName } from './entryTableTestKit';
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

const kindGroup = () => screen.getByRole('group', { name: 'Kind' });
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

describe('the-list-is-kind-chips-over-a-table-of-entries', () => {
  it('lists entries as table rows under kind chips that count their entries', async () => {
    const { api } = await renderGuide();
    await screen.findAllByText('Alice');
    const types = await api.guideTypes();
    const entries = await api.guideEntities();
    const chips = within(kindGroup()).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'All' + entries.length,
      ...types.map((type) => type.name + entries.filter((e) => e.category === type.name).length),
    ]);
    expect(within(kindGroup()).getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true');
    // No category tabs: the kind chips replace them. The Series view stays a tab beside the entries.
    expect(screen.queryByRole('tab', { name: /^Characters/ })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Series' })).toBeTruthy();

    const alice = rows().find((row) => rowName(row) === 'Alice')!;
    const cells = cellsOf(alice).map((cell) => cell.textContent);
    expect(cells[1]).toBe('Character');
    expect(cells[3]).toMatch(/^\d+$/);
    expect(cells[4]).toMatch(/^\d+$/);

    await userEvent.click(within(kindGroup()).getByRole('button', { name: /^Place/ }));
    expect(
      within(kindGroup())
        .getByRole('button', { name: /^Place/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    const shown = rows();
    expect(shown.length).toBeGreaterThan(0);
    shown.forEach((row) => expect(cellsOf(row)[1]!.textContent).toBe('Place'));
    await userEvent.click(within(kindGroup()).getByRole('button', { name: /^All/ }));
    expect(rows().length).toBeGreaterThan(shown.length);
  });

  it('says so when no entry matches the chip', async () => {
    await renderGuide();
    await screen.findAllByText('Alice');
    await userEvent.click(within(kindGroup()).getByRole('button', { name: /^Event/ }));
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

describe('the-type-colour-tints-the-chips-and-rows', () => {
  const swatchOf = (element: Element) => element.querySelector<HTMLElement>('[aria-hidden="true"]')!.style.background;

  it('colours the list border and chips from the type colour', async () => {
    await renderGuide({}, async (api) => api.guideTypeSetColour('Character', 'rose'));
    await screen.findAllByText('Alice');
    const alice = rows().find((row) => rowName(row) === 'Alice')!;
    expect(swatchOf(alice)).toBe('var(--event)');
    expect(swatchOf(within(kindGroup()).getByRole('button', { name: /^Character/ }))).toBe('var(--event)');
    expect(swatchOf(within(kindGroup()).getByRole('button', { name: /^Place/ }))).toBe('var(--place)');
    // The "All" chip is no kind, so it carries no swatch.
    expect(within(kindGroup()).getByRole('button', { name: /^All/ }).querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('draws a row the build was unsure of in the amber (D7)', async () => {
    await renderGuide();
    await screen.findAllByText('Alice');
    const unsure = (await createMockApi().guideEntities()).find((row) => row.category === 'Needs Review')!;
    const row = rows().find((r) => rowName(r) === unsure.canonical_name)!;
    await waitFor(() => expect(swatchOf(row)).toBe('var(--warn)'));
    // The review state is the row's badge, not the type word.
    expect(cellsOf(row)[5]!.textContent).toBe('Review');
    expect(cellsOf(row)[1]!.textContent).toBe('Type not set');
    expect(cellsOf(row)[2]!.textContent).toBe('');
  });
});
