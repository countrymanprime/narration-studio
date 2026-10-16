// @vitest-environment jsdom
// One list, one count (#1707): the rail's Pickups badge, Production's Open pickups tile and Next up, Schedule's pickup hours and the
// Pickups page's per-chapter "<n> open" all count the lines `pickupsList` answers. The DAW's marker count (`pickupsState.remaining`)
// is made to disagree on purpose, so a page that still reads it fails here.
import { renderHook, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { PickupList } from '../../api/contracts/pickups';
import { CommandRouter, CommandScope } from '../../input/router';
import { createJournal } from '../../studio/journal/createJournal';
import type { NarrationApi } from '../../types';
import { useNavCounts } from '../layout/useNavCounts';
import { ProductionPage } from '../production/ProductionPage';
import { hm } from '../schedule/dates';
import { PICKUP_HOURS } from '../schedule/estimates';
import { SchedulePage } from '../schedule/SchedulePage';
import { TooltipProvider } from '../primitives/Tooltip';
import { CHAPTERS, MIXED } from './list/pickupFixtures';
import { openPickups } from './list/pickupRows';
import { PickupsPage } from './PickupsPage';

afterEach(cleanup);

const LIST: PickupList = { pickups: MIXED, leftOut: [] };
const OPEN = openPickups(MIXED).length;

/** An api whose list has `OPEN` open lines and whose DAW marker count says 0 of 0. */
const apiWith = () => {
  const base = createMockApi(
    {
      pickupsList: async () => LIST,
      pickupsState: async () => ({ phase: 'counted', message: '', remaining: 0, total: 0, csv: '' }) as never,
    },
    {},
  );
  return base;
};
const wrap = (api: NarrationApi) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <ApiProvider api={api}>
          <TooltipProvider>
            <CommandRouter>
              <CommandScope kind="page">{children}</CommandScope>
            </CommandRouter>
          </TooltipProvider>
        </ApiProvider>
      </MemoryRouter>
    );
  };

describe('every pickup count comes from the Pickups list', () => {
  it('has lines open and some done, so the count is not the length of the list', () => {
    expect(OPEN).toBeGreaterThan(0);
    expect(OPEN).toBeLessThan(MIXED.length);
  });

  it("the rail's badge is the list's open lines", async () => {
    const { result } = renderHook(() => useNavCounts('/'), { wrapper: wrap(apiWith()) });
    await waitFor(() => expect(result.current.pickups).toBe(OPEN));
  });

  it('Production\'s "Open pickups" tile is the list\'s open lines, and Next up names them', async () => {
    const api = apiWith();
    const data = await api.bootstrap();
    const Page = wrap(api);
    render(
      <Page>
        <ProductionPage
          data={data}
          go={() => undefined}
          notify={() => undefined}
          goToScript={() => undefined}
          goToEditing={() => undefined}
          goToBooth={() => undefined}
          refreshBootstrap={async () => {}}
        />
      </Page>,
    );
    const kpis = await screen.findByRole('list', { name: 'Production figures' });
    const tile = within(kpis).getByText('Open pickups').closest('li') as HTMLElement;
    await waitFor(() => expect(within(tile).getByText(String(OPEN))).toBeTruthy());
    expect(await screen.findByText(new RegExp(`${OPEN} lines`))).toBeTruthy();
  });

  it("Schedule's Pickups hours are the list's open lines at the estimate", async () => {
    const api = apiWith();
    const Page = wrap(api);
    render(
      <Page>
        <SchedulePage journal={createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' })} today={new Date(2026, 9, 1)} />
      </Page>,
    );
    const term = await screen.findByText('Pickups', { selector: 'dt' });
    await waitFor(() => expect(term.parentElement?.querySelector('dd')?.textContent).toBe(hm(OPEN * PICKUP_HOURS)));
  });

  it("the Pickups page's chapter groups add up to the same count", async () => {
    const api = apiWith();
    const chapters = CHAPTERS.map((chapter, index) => ({ id: chapter.id, title: chapter.name, index, wordCount: 100, status: 'recording' }) as never);
    api.manuscriptChapters = async () => chapters;
    const Page = wrap(api);
    render(
      <Page>
        <PickupsPage hasManuscript goTo={() => undefined} goToScript={() => undefined} />
      </Page>,
    );
    await screen.findByRole('heading', { name: 'Pickup session' });
    await waitFor(() => {
      const open = [...document.querySelectorAll('td, th, span, div')]
        .map((node) => /· (\d+) open$/.exec(node.children.length === 0 ? (node.textContent ?? '') : ''))
        .filter((match): match is RegExpExecArray => match !== null)
        .reduce((sum, match) => sum + Number(match[1]), 0);
      expect(open).toBe(OPEN);
    });
  });

  it("Production's pipeline Pickups cells are the same lines, chapter by chapter", async () => {
    const api = createMockApi({}, {});
    const list = await api.pickupsList();
    const open = openPickups(list.pickups);
    expect(open.length).toBeGreaterThan(0);
    const data = await api.bootstrap();
    const Page = wrap(api);
    render(
      <Page>
        <ProductionPage
          data={data}
          go={() => undefined}
          notify={() => undefined}
          goToScript={() => undefined}
          goToEditing={() => undefined}
          goToBooth={() => undefined}
          refreshBootstrap={async () => {}}
        />
      </Page>,
    );
    const table = await screen.findByRole('table', { name: 'Chapter pipeline' });
    const cells = await waitFor(() => {
      const found = within(table).getAllByRole('button', { name: /: Pickups \d+ open$/ });
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    expect(cells.reduce((sum, cell) => sum + Number(cell.textContent), 0)).toBe(open.length);
  });
});
