// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

describe('the-list-read-failing-and-going-stale', () => {
  it('failed: says why the list could not be read and offers Check again, never "No pickups queued"', async () => {
    let read: () => Promise<PickupList> = () => Promise.reject(new Error('the project folder is not reachable'));
    const again = vi.fn(() => read());
    renderPage(createMockApi({ pickupsList: again }));
    const alert = (await screen.findByText('The pickup list could not be read')).closest('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('The project folder is not reachable.');
    expect(screen.queryByText('No pickups queued')).toBeNull();
    read = () => Promise.resolve(LIST);
    const before = again.mock.calls.length;
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Check again' }));
    expect(again.mock.calls.length).toBe(before + 1);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Open in Booth at this line' }).length).toBeGreaterThan(0));
    expect(screen.queryByText('The pickup list could not be read')).toBeNull();
  });

  it('loading: says it is reading, not that nothing is queued', async () => {
    renderPage(createMockApi({ pickupsList: () => new Promise<PickupList>(() => {}) }));
    expect(await screen.findByText('Reading the pickup list…')).toBeTruthy();
    expect(screen.queryByText('No pickups queued')).toBeNull();
  });

  it('stale: a later read that fails keeps the list and says when it was read', async () => {
    let read: () => Promise<PickupList> = () => Promise.resolve(LIST);
    renderPage(createMockApi({ pickupsList: () => read() }));
    await screen.findAllByRole('button', { name: 'Open in Booth at this line' });
    read = () => Promise.reject(new Error('the DAW did not answer'));
    act(() => {
      fireEvent.focus(window);
    });
    const note = await screen.findByText(/Can’t tell if this list is current\. The DAW did not answer\./);
    expect(note.textContent).toMatch(/Last read at /);
    expect(screen.getAllByRole('button', { name: 'Open in Booth at this line' }).length).toBeGreaterThan(0);
    read = () => Promise.resolve(LIST);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.queryByText(/Can’t tell if this list is current/)).toBeNull());
  });

  it('out of order: an answer to an older request does not overwrite a newer one', async () => {
    const api = createMockApi({ pickupsList: () => Promise.resolve(LIST) });
    renderPage(api);
    const rows = await screen.findAllByRole('button', { name: 'Mark recorded' });
    let late: (list: PickupList) => void = () => {};
    const first = new Promise<PickupList>((resolve) => (late = resolve));
    const second = { ...LIST, pickups: LIST.pickups.filter((p) => p.id !== MIXED[0].id) };
    vi.spyOn(api, 'pickupsSetDone').mockReturnValueOnce(first).mockResolvedValueOnce(second);
    const user = userEvent.setup();
    await user.click(rows[0]);
    await user.click(rows[1]);
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeLessThan(LIST.pickups.length + 4));
    const shown = screen.getAllByRole('row').length;
    await act(async () => late(LIST));
    expect(screen.getAllByRole('row').length).toBe(shown);
  });
});

describe('the-recorded-state-the-daw-has-not-taken', () => {
  it('says a recorded line is not in the DAW yet while the host holds it back', async () => {
    const waiting = { ...LIST, pickups: LIST.pickups.map((p, index) => (index === 0 ? { ...p, done: true, waiting: true } : p)) };
    renderPage(createMockApi({ pickupsList: () => Promise.resolve(waiting) }));
    expect(await screen.findByText('Recorded, not in the DAW yet')).toBeTruthy();
  });
});
