// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { StudioProvider } from '../../studio/StudioProvider';
import { createJournal, type Journal } from '../../studio/journal/createJournal';
import type { PickupList } from '../../api/contracts/pickups';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayHost } from '../../overlay/OverlayHost';
import type { NarrationApi } from '../../types';
import { PortOverrides } from '../../ports/usePort';
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
  journal: Journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' }),
) {
  vi.spyOn(api, 'manuscriptChapters').mockResolvedValue(chapters as never);
  const goTo = vi.fn();
  const goToScript = vi.fn();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <StudioProvider journal={journal}>
          <TooltipProvider>
            <CommandRouter>
              <PickupsPage hasManuscript goTo={goTo} goToScript={goToScript} />
            </CommandRouter>
            <OverlayHost />
          </TooltipProvider>
        </StudioProvider>
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

describe('fine-not-a-pickup-and-show-where', () => {
  const fromNote = pickup({
    id: 'finding:f9',
    chapterId: 'c1',
    source: 'proof',
    findingId: 'f9',
    time: 12,
    paragraphId: 'p-2',
    script: 'a <b>White Rabbit</b> ran',
  });
  const fromGap = pickup({ id: 'speech:c1:g7', chapterId: 'c1', source: 'speech', findingId: 'f7', time: 30 });

  async function setupFine(line = fromNote) {
    const api = createMockApi({ pickupsList: () => Promise.resolve({ pickups: [line], leftOut: [] }) });
    const base = (await api.findingsList({})).findings[0]!;
    const note = { ...base, id: line.findingId!, review: { status: 'accepted' as const, note: 'mine' } };
    vi.spyOn(api, 'findingsGet').mockResolvedValue(note);
    const review = vi.spyOn(api, 'findingsReview').mockImplementation(async (request) => ({ ...note, review: { status: request.status, note: request.note } }));
    const remove = vi.spyOn(api, 'pickupsRemove').mockResolvedValue({ pickups: [], leftOut: [] });
    vi.spyOn(api, 'manuscriptParagraphs').mockResolvedValue([
      { id: 'p-1', chapterId: 'c1', chapter: 'One', index: 0, text: 'Before it.', entityIds: [] },
      { id: 'p-2', chapterId: 'c1', chapter: 'One', index: 1, text: 'Then a White Rabbit ran close by her.', entityIds: [] },
      { id: 'p-3', chapterId: 'c1', chapter: 'One', index: 2, text: 'After it.', entityIds: [] },
    ]);
    const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
    renderPage(api, undefined, journal);
    const user = userEvent.setup();
    const cell = await screen.findByText(line === fromNote ? '00:12.0' : '00:30.0', { selector: 'td' });
    await user.click(cell);
    return { api, review, remove, user, note, journal };
  }

  it('a selected line shows its paragraph with the ones before and after', async () => {
    await setupFine();
    const where = await screen.findByRole('region', { name: 'In the script' });
    expect(where.querySelector('[data-around=at] mark')?.textContent).toBe('White Rabbit');
    expect(where.querySelector('[data-around=before]')?.textContent).toBe('Before it.');
    expect(where.querySelector('[data-around=after]')?.textContent).toBe('After it.');
  });

  it('Fine, not a pickup dismisses the note with its note kept, and Undo puts it back as it was', async () => {
    const { review, remove, user, note } = await setupFine();
    await user.click(screen.getByRole('button', { name: 'Fine, not a pickup' }));
    await waitFor(() => expect(review).toHaveBeenCalledWith({ id: 'f9', evidenceVersion: note.evidence_version ?? '', status: 'dismissed', note: 'mine' }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(review).toHaveBeenLastCalledWith({ id: 'f9', evidenceVersion: note.evidence_version ?? '', status: 'accepted', note: 'mine' }));
  });

  it('Fine, not a pickup is the newest journal entry, so Ctrl+Z and History take it back, not an earlier decision', async () => {
    const { review, user, note, journal } = await setupFine();
    await user.click(screen.getByRole('button', { name: 'Fine, not a pickup' }));
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    const entries = await journal.entries();
    expect(entries.at(-1)?.label).toBe('Fine, not a pickup at 00:12.0');
    await act(async () => void (await journal.undo(entries.at(-1)!.id)));
    await waitFor(() => expect(review).toHaveBeenLastCalledWith({ id: 'f9', evidenceVersion: note.evidence_version ?? '', status: 'accepted', note: 'mine' }));
  });

  it('a check’s gap with a note is also taken off the list', async () => {
    const { review, remove, user } = await setupFine(fromGap);
    await user.click(screen.getByRole('button', { name: 'Fine, not a pickup' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('speech:c1:g7'));
    expect(review).toHaveBeenCalledWith(expect.objectContaining({ id: 'f7', status: 'dismissed' }));
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
  it('failed: says why the list could not be read and offers Retry, never "No pickups queued"', async () => {
    let read: () => Promise<PickupList> = () => Promise.reject(new Error('the project folder is not reachable'));
    const again = vi.fn(() => read());
    renderPage(createMockApi({ pickupsList: again }));
    const alert = (await screen.findByText('The pickup list could not be read')).closest('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('The project folder is not reachable.');
    expect(screen.queryByText('No pickups queued')).toBeNull();
    read = () => Promise.resolve(LIST);
    const before = again.mock.calls.length;
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(again.mock.calls.length).toBe(before + 1);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Open in Booth at this line' }).length).toBeGreaterThan(0));
    expect(screen.queryByText('The pickup list could not be read')).toBeNull();
  });

  it('loading: says it is reading, not that nothing is queued', async () => {
    renderPage(createMockApi({ pickupsList: () => new Promise<PickupList>(() => {}) }));
    expect(await screen.findByText('Reading the pickup list…')).toBeTruthy();
    expect(screen.queryByText('No pickups queued')).toBeNull();
  });

  it('loading: keeps the page title and shows one busy region in the table, however long it takes', async () => {
    renderPage(createMockApi({ pickupsList: () => new Promise<PickupList>(() => {}) }));
    const region = await screen.findByRole('group', { name: 'Loading the pickups' });
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('heading', { level: 1, name: 'Pickups' })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.queryByRole('group', { name: 'Loading the pickups' })).toBeTruthy();
  });

  it('loaded: the busy region is gone', async () => {
    renderPage(createMockApi({ pickupsList: () => Promise.resolve(LIST) }));
    await screen.findAllByRole('button', { name: 'Open in Booth at this line' });
    expect(screen.queryByRole('group', { name: 'Loading the pickups' })).toBeNull();
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
    // #2251 item 24: the shared display standard joins a non-numbered heading with the em dash, as every other page does.
    expect(await screen.findByText('CHAPTER 1: Title 1')).toBeTruthy();
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

  // The host's list skips the credits (a credits file has no line to re-read), but they are chapters: the stepper reaches them, with an empty list.
  it('steps to the credits chapters by their titles, and keeps hand-added pickups off them', async () => {
    const credits = (id: string, title: string) => ({ id, title, index: -2, wordCount: 6, status: 'recording', isCredits: true });
    const chapters = [
      credits('credits-opening', 'Opening credits'),
      ...CHAPTERS.map((chapter, index) => ({ id: chapter.id, title: chapter.name, index, wordCount: 100, status: 'recording' })),
      credits('credits-closing', 'Closing credits'),
    ];
    renderPage(undefined, chapters);
    await screen.findAllByRole('button', { name: 'Open in Booth at this line' });
    const user = userEvent.setup();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await screen.findByRole('button', { name: /^Chapter: Chapter 1/ });
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    await screen.findByRole('button', { name: /^Chapter: Opening credits/ });
    expect(screen.queryByText('credits-opening')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add a pickup by hand' }));
    expect(await screen.findByText('Chapter 1 · The Orchard')).toBeTruthy();
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
    // Add is off until the list is read (XPK-15).
    await screen.findByRole('table', { name: 'Pickups' });
    await user.click(screen.getByRole('button', { name: 'Add a pickup by hand' }));
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
    // Add is off with its reason rather than opening a form that cannot be used (XPK-15).
    const add = screen.getByRole('button', { name: 'Add a pickup by hand' });
    expect(add.getAttribute('aria-disabled')).toBe('true');
    await user.click(add);
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

  it('Retry shows it is working', async () => {
    let finish: () => void = () => {};
    let attempt = 0;
    renderPage(
      createMockApi({
        pickupsList: () => (++attempt === 1 ? Promise.reject(new Error('nope')) : new Promise<PickupList>((resolve) => (finish = () => resolve(LIST)))),
      }),
    );
    const again = await screen.findByRole('button', { name: 'Retry' });
    await userEvent.setup().click(again);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' }).getAttribute('aria-busy')).toBe('true'));
    finish();
  });
});

describe('adding-lines-as-markers-says-what-happened', () => {
  const markersDaw = (changed: boolean) =>
    ({ addPickupMarkers: vi.fn().mockResolvedValue({ ok: true, changed, message: 'Imported 2 pickups.', undoSteps: changed ? 1 : 0 }) }) as never;
  const renderWith = (changed: boolean) => {
    const api = createMockApi({ pickupsList: () => Promise.resolve(LIST) });
    vi.spyOn(api, 'manuscriptChapters').mockResolvedValue(
      CHAPTERS.map((c, index) => ({ id: c.id, title: c.name, index, wordCount: 100, status: 'recording' })) as never,
    );
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <StudioProvider>
            <PortOverrides clients={{ daw: markersDaw(changed) }}>
              <TooltipProvider>
                <CommandRouter>
                  <PickupsPage hasManuscript goTo={vi.fn()} goToScript={vi.fn()} />
                </CommandRouter>
                <OverlayHost />
              </TooltipProvider>
            </PortOverrides>
          </StudioProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
  };

  it('says markers were added, not that pickups were imported', async () => {
    renderWith(true);
    await userEvent.setup().click(await screen.findByRole('button', { name: /^Add \d+ as markers in / }));
    expect(await screen.findByText(/^Pickup markers for \d+ lines are in .+\.$/)).toBeTruthy();
    expect(screen.queryByText(/Imported/)).toBeNull();
  });

  it('says the markers were already there when nothing changed', async () => {
    renderWith(false);
    await userEvent.setup().click(await screen.findByRole('button', { name: /^Add \d+ as markers in / }));
    expect(await screen.findByText(/^Those markers were already in .+\.$/)).toBeTruthy();
  });
});

describe('coming-back-from-the-booth', () => {
  it('puts the selection and focus back on the line that was opened', async () => {
    const first = renderPage();
    const user = userEvent.setup();
    const rows = await screen.findAllByRole('row', { selected: false });
    const line = rows.filter((row) => row.hasAttribute('data-pk'))[1];
    line.focus();
    await user.keyboard('{Enter}');
    const id = line.getAttribute('data-pk');
    expect(first.goTo).toHaveBeenCalled();
    cleanup();
    renderPage();
    await waitFor(() => expect(document.activeElement?.getAttribute('data-pk')).toBe(id));
    expect(document.activeElement?.getAttribute('aria-selected')).toBe('true');
  });
});
