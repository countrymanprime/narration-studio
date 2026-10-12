// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { PickupList } from '../../api/contracts/pickups';
import { createMockApi } from '../../api/mockApi';
import { OverlayHost } from '../../overlay/OverlayHost';
import type { NarrationApi } from '../../types';
import { TooltipProvider } from '../primitives/Tooltip';
import * as checkRecordings from '../recordingcheck/openCheckRecordings';
import { CHAPTERS, MIXED } from './list/pickupFixtures';
import { boothSessionPath, PickupsPage } from './PickupsPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LIST: PickupList = { pickups: MIXED, leftOut: [{ chapterId: 'c2', state: 'stale', reasons: [] }] };

function renderPage(api: NarrationApi = createMockApi({ pickupsList: () => Promise.resolve(LIST) })) {
  vi.spyOn(api, 'manuscriptChapters').mockResolvedValue(
    CHAPTERS.map((chapter, index) => ({ id: chapter.id, title: chapter.name, index, wordCount: 100, status: 'recording' }) as never),
  );
  const goTo = vi.fn();
  const goToScript = vi.fn();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <TooltipProvider>
          <PickupsPage hasManuscript goTo={goTo} goToScript={goToScript} />
          <OverlayHost />
        </TooltipProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, goTo, goToScript };
}

describe('pickups-route-draws-the-mock-page', () => {
  it('draws the list grouped by chapter and the pickup session panel', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Pickups' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Pickup session' })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Open in Booth at this line' }).length).toBeGreaterThan(0));
  });

  it('"Open in Booth at this line" goes to the Booth with that pickup', async () => {
    const { goTo } = renderPage();
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: 'Open in Booth at this line' }))[0]);
    expect(goTo).toHaveBeenCalledWith(boothSessionPath([MIXED[0]]));
    expect(goTo.mock.calls[0][0]).toContain(`pickups=${encodeURIComponent(MIXED[0].id)}`);
  });

  it('"Open N in Booth" goes to the Booth with the open lines of the session', async () => {
    const { goTo } = renderPage();
    const user = userEvent.setup();
    const open = await screen.findByRole('button', { name: /^Open \d+ in Booth$/ });
    await user.click(open);
    const ids = MIXED.filter((p) => !p.done && p.included).map((p) => p.id);
    expect(goTo).toHaveBeenCalledWith(boothSessionPath(MIXED.filter((p) => ids.includes(p.id))));
  });

  it('has no Punch and no Next pickup', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Pickup session' });
    expect(screen.queryByRole('button', { name: /punch/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /next pickup/i })).toBeNull();
  });

  it('marking a line recorded goes through the host and draws its answer', async () => {
    const api = createMockApi({ pickupsList: () => Promise.resolve(LIST) });
    const setDone = vi.spyOn(api, 'pickupsSetDone').mockResolvedValue({ ...LIST, pickups: LIST.pickups.map((p) => ({ ...p, done: true })) });
    renderPage(api);
    const user = userEvent.setup();
    const row = (await screen.findAllByRole('button', { name: 'Mark recorded' }))[0];
    await user.click(row);
    expect(setDone).toHaveBeenCalledWith(expect.any(String), true);
    await waitFor(() => expect(screen.queryAllByRole('button', { name: 'Mark recorded' })).toHaveLength(0));
  });
});

describe('check-recordings-opens-from-pickups', () => {
  it('opens the Check recordings dialog with the chapters whose check is not current', async () => {
    const open = vi.spyOn(checkRecordings, 'openCheckRecordings').mockReturnValue(() => {});
    renderPage();
    const user = userEvent.setup();
    const head = await screen.findByRole('heading', { name: 'Pickups' });
    await user.click(within(head.closest('section') ?? document.body).getByRole('button', { name: /Check recordings/ }));
    expect(open).toHaveBeenCalledWith(['c2']);
  });
});
