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
const entryList = () => screen.getByRole('list', { name: 'Story Bible entries' });
const rows = () => within(entryList()).getAllByRole('button');

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
    expect(screen.queryByRole('list', { name: 'Story Bible entries' })).toBeNull();
  });
});

describe('the-list-is-kind-chips-over-two-line-rows', () => {
  it('lists entries as two-line rows under kind chips', async () => {
    const { api } = await renderGuide();
    await screen.findAllByText('Alice');
    const types = await api.guideTypes();
    const chips = within(kindGroup()).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(expect.arrayContaining(['All', ...types.map((type) => type.name)]));
    expect(within(kindGroup()).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    // No category tabs: the kind chips replace them. The Series view stays a tab beside the entries.
    expect(screen.queryByRole('tab', { name: /^Characters/ })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Series' })).toBeTruthy();

    const alice = rows().find((row) => row.textContent?.includes('Alice'))!;
    const lines = alice.querySelectorAll('[data-line]');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.textContent).toContain('Alice');
    expect(lines[1]!.textContent).toMatch(/^Character · \d+ names? · \d+ chapters?$/);

    await userEvent.click(within(kindGroup()).getByRole('button', { name: 'Place' }));
    expect(within(kindGroup()).getByRole('button', { name: 'Place' }).getAttribute('aria-pressed')).toBe('true');
    const shown = rows();
    expect(shown.length).toBeGreaterThan(0);
    shown.forEach((row) => expect(row.querySelector('[data-line="kind"]')!.textContent).toMatch(/^Place · /));
    await userEvent.click(within(kindGroup()).getByRole('button', { name: 'All' }));
    expect(rows().length).toBeGreaterThan(shown.length);
  });

  it('says so when no entry matches the chip', async () => {
    await renderGuide();
    await screen.findAllByText('Alice');
    await userEvent.click(within(kindGroup()).getByRole('button', { name: 'Event' }));
    expect(screen.getByText('No entries match.')).toBeTruthy();
  });

  it('selects an entry when its row is pressed and marks it current', async () => {
    await renderGuide();
    await screen.findAllByText('Alice');
    const rabbit = rows().find((row) => row.textContent?.includes('White Rabbit'))!;
    await userEvent.click(rabbit);
    expect(rabbit.getAttribute('aria-current')).toBe('true');
    expect(await screen.findByRole('heading', { name: 'White Rabbit' })).toBeTruthy();
  });
});

describe('the-type-colour-tints-the-chips-and-rows', () => {
  const swatchOf = (element: Element) => element.querySelector<HTMLElement>('[aria-hidden="true"]')!.style.background;

  it('colours the list border and chips from the type colour', async () => {
    await renderGuide({}, async (api) => api.guideTypeSetColour('Character', 'rose'));
    await screen.findAllByText('Alice');
    const alice = rows().find((row) => row.textContent?.includes('Alice'))!;
    expect(swatchOf(alice)).toBe('var(--event)');
    expect(swatchOf(within(kindGroup()).getByRole('button', { name: 'Character' }))).toBe('var(--event)');
    expect(swatchOf(within(kindGroup()).getByRole('button', { name: 'Place' }))).toBe('var(--place)');
    // The "All" chip is no kind, so it carries no swatch.
    expect(within(kindGroup()).getByRole('button', { name: 'All' }).querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('draws a row the build was unsure of in the review hue', async () => {
    await renderGuide();
    await screen.findAllByText('Alice');
    const unsure = (await createMockApi().guideEntities()).find((row) => row.category === 'Needs Review')!;
    const row = rows().find((r) => r.textContent?.includes(unsure.canonical_name))!;
    await waitFor(() => expect(swatchOf(row)).toBe('var(--review)'));
  });
});
