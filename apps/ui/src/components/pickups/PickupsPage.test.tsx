// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { PickupList } from '../../api/contracts/pickups';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayHost } from '../../overlay/OverlayHost';
import type { NarrationApi } from '../../types';
import { TooltipProvider } from '../primitives/Tooltip';
import * as checkRecordings from '../recordingcheck/openCheckRecordings';
import { onPickupListChanged } from './pickupListChanged';
import { readBoothQuery, readPickupIds } from '../booth/page/boothQuery';
import { CHAPTERS, MIXED, pickup } from './list/pickupFixtures';
import { boothSessionPath, PickupsPage } from './PickupsPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LIST: PickupList = { pickups: MIXED, leftOut: [{ chapterId: 'c2', state: 'stale', reasons: [] }] };

function renderPage(
  api: NarrationApi = createMockApi({ pickupsList: () => Promise.resolve(LIST) }),
  chapters: readonly object[] = CHAPTERS.map((chapter, index) => ({ id: chapter.id, title: chapter.name, index, wordCount: 100, status: 'recording' })),
) {
  vi.spyOn(api, 'manuscriptChapters').mockResolvedValue(chapters as never);
  const goTo = vi.fn();
  const goToScript = vi.fn();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <TooltipProvider>
          <CommandRouter>
            <PickupsPage hasManuscript goTo={goTo} goToScript={goToScript} />
          </CommandRouter>
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
    expect(await screen.findByText('Not in the DAW yet')).toBeTruthy();
  });
});

describe('names-a-chapter-as-the-manuscript-heads-it', () => {
  it('draws the group row with the heading label, then the title', async () => {
    const chapters = CHAPTERS.map((chapter, index) => ({
      id: chapter.id,
      title: `CHAPTER ${index + 1}`,
      subtitle: `Title ${index + 1}`,
      index,
      wordCount: 100,
      status: 'recording',
    }));
    renderPage(createMockApi({ pickupsList: () => Promise.resolve(LIST) }), chapters);
    expect(await screen.findByText('CHAPTER 1 Title 1')).toBeTruthy();
  });
});

describe('absurd-text-in-a-line', () => {
  it('draws right-to-left, emoji and 500 unbroken characters in the line without markup or overflow classes missing', async () => {
    const odd = [
      { ...MIXED[0], id: 'you:rtl', script: 'مرحبا بالعالم 🦎🍺 שלום' },
      { ...MIXED[1], id: 'you:long', script: 'x'.repeat(500) },
      { ...MIXED[2], id: 'you:tags', script: '<script>alert(1)</script> <b>ok</b>' },
    ];
    renderPage(createMockApi({ pickupsList: () => Promise.resolve({ ...LIST, pickups: odd }) }));
    const rtl = await screen.findByText('مرحبا بالعالم 🦎🍺 שלום');
    expect(rtl.getAttribute('dir')).toBe('auto');
    expect(screen.getByText('x'.repeat(500)).className).toContain('overflow-wrap');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeTruthy();
  });
});

describe('the-booth-hand-off-address', () => {
  it('no lines is the Booth with no session; one line names its chapter and id', () => {
    expect(boothSessionPath([])).toBe('/booth');
    const params = new URLSearchParams(boothSessionPath([pickup({ id: 'finding:f-1', chapterId: 'c9' })]).split('?')[1]);
    expect(readBoothQuery(params)).toEqual({ chapter: 'c9' });
    expect(readPickupIds(params)).toEqual(['finding:f-1']);
  });

  it("two thousand lines survive the address in order, and the chapter is the first line's", () => {
    const many = Array.from({ length: 2000 }, (_, index) => pickup({ id: `speech:c${index % 7}:g${index}`, chapterId: `c${index % 7}` }));
    const params = new URLSearchParams(boothSessionPath(many).split('?')[1]);
    expect(readPickupIds(params)).toEqual(many.map((p) => p.id));
    expect(readBoothQuery(params)).toEqual({ chapter: 'c0' });
  });
});

describe('a-huge-list', () => {
  it('300 lines draw, with one row in the tab order and the session counting every open one', async () => {
    const huge = Array.from({ length: 300 }, (_, index) => pickup({ id: `you:c1-${index}`, chapterId: 'c1', time: index, script: `Line ${index}` }));
    renderPage(createMockApi({ pickupsList: () => Promise.resolve({ pickups: huge, leftOut: [] }) }));
    await screen.findByText('Line 299', undefined, { timeout: 15000 });
    expect(document.querySelectorAll('tr[data-pk]')).toHaveLength(300);
    expect(document.querySelectorAll('tr[data-pk][tabindex="0"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Open 300 in Booth' })).toBeTruthy();
  }, 30000);
});

describe('narrator-walkthrough-fixes', () => {
  it('Alt+Down and Alt+Up step the chapter, as the stepper tips say', async () => {
    renderPage();
    await screen.findAllByRole('button', { name: 'Open in Booth at this line' });
    const user = userEvent.setup();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await screen.findByRole('button', { name: /^Chapter: Chapter 1/ });
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await screen.findByRole('button', { name: /^Chapter: Chapter 2/ });
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    await screen.findByRole('button', { name: /^Chapter: Chapter 1/ });
  });

  it('tells the rail when the list changes, so its badge follows the page', async () => {
    const heard = vi.fn();
    const stop = onPickupListChanged(heard);
    renderPage();
    await screen.findAllByRole('button', { name: 'Open in Booth at this line' });
    expect(heard).toHaveBeenCalled();
    stop();
  });

  it('a line already in the chapter is refused in words, not closed in silence', async () => {
    const api = createMockApi({ pickupsList: () => Promise.resolve(LIST), pickupsAdd: () => Promise.resolve(LIST) });
    renderPage(api);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add a pickup by hand' }));
    await user.type(screen.getByRole('textbox', { name: 'Time in the recording' }), '01:00');
    await user.type(screen.getByRole('textbox', { name: 'Line to re-record' }), 'Again');
    await user.click(screen.getByRole('button', { name: 'Add pickup' }));
    expect(await screen.findByText('That line is already in this chapter’s list.')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Line to re-record' })).toBeTruthy();
  });

  it('a line the narrator typed shows and copies exactly as typed, and lines list by time', async () => {
    const typed = pickup({ id: 'you:t', source: 'you', script: '<b>x</b> and <i>y</i>', time: 5 });
    const early = pickup({ id: 'you:e', source: 'you', script: 'Early', time: 1 });
    renderPage(createMockApi({ pickupsList: () => Promise.resolve({ pickups: [typed, early], leftOut: [] }) }));
    expect(await screen.findByText('<b>x</b> and <i>y</i>')).toBeTruthy();
    const times = [...document.querySelectorAll('tr[data-pk] td:nth-child(2)')].map((cell) => cell.textContent);
    expect(times).toEqual(['00:01.0', '00:05.0']);
  });
});

describe('narrator-walkthrough-fixes-2', () => {
  const unreadable = () => createMockApi({ pickupsList: () => Promise.reject(new Error('nope')) });

  it('an unreadable list says the session is not known, not that it is empty, and offers no add form', async () => {
    renderPage(unreadable());
    await screen.findByText('The pickup list could not be read');
    expect(screen.getByText('The list could not be read, so the session is not known yet.')).toBeTruthy();
    expect(screen.queryByText(/tick a line to include it/)).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a pickup by hand' }));
    expect(await screen.findByText(/A pickup can be added once the list has been read/)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Line to re-record' })).toBeNull();
  });

  it('copy with nothing in the session says so and leaves the clipboard alone', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderPage(unreadable());
    await screen.findByText('The pickup list could not be read');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Copy the pickup script' }));
    expect(await screen.findByText('The list could not be read, so there is nothing to copy yet.')).toBeTruthy();
    expect(write).not.toHaveBeenCalled();
  });

  it('Check again shows it is working', async () => {
    let finish: () => void = () => {};
    let attempt = 0;
    renderPage(
      createMockApi({
        pickupsList: () => (++attempt === 1 ? Promise.reject(new Error('nope')) : new Promise<PickupList>((resolve) => (finish = () => resolve(LIST)))),
      }),
    );
    const again = await screen.findByRole('button', { name: 'Check again' });
    await userEvent.setup().click(again);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check again' }).getAttribute('aria-busy')).toBe('true'));
    finish();
  });
});
