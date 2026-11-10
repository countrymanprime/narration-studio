// @vitest-environment jsdom
// The create button on a Chapter links row (#2840, part 2): the DAW adds a track (a folder with a Narrator track in Voice folders) named after
// a chapter with no link, and the chapter is linked to it.
//
// State matrix, each cell tested below unless it says why not:
// | Cell                                   | What the row does                                                                     |
// | -------------------------------------- | ------------------------------------------------------------------------------------- |
// | empty: no tracks to choose             | "No REAPER tracks to link" and the create button is the row's one action               |
// | empty: no chapters                     | no table at all (ChapterLinksTable.test.tsx, "lists every narration chapter")          |
// | one unlinked row                       | one create button, on that row                                                         |
// | many rows                              | one button per unlinked row; a linked row and a missing-track row have none           |
// | busy                                   | the button spins (aria-busy) and Confirm is off until the DAW answers                 |
// | done, flat                             | row Linked with the track's name before the track list re-reads; toast; live refresh |
// | done, Voice folders                    | folder label and tooltip; row "<title> · 1 voice"; toast names the folder and Narrator |
// | refused: recording                     | the host's sentence as an error toast; row unchanged; no live refresh                 |
// | refused: REAPER gone (standalone)      | the host's sentence as an error toast; row unchanged                                  |
// | refused: not answering                 | the host's sentence as an error toast; row unchanged                                  |
// | failed (the call rejects)              | "The track could not be added: ..." toast; row unchanged                              |
// | double press                           | one host call, one track                                                              |
// | press on another row while busy        | every other create button is off (aria-disabled) and a press does nothing (F1)        |
// | press within 600 ms of an answer       | ignored: the rows moved under the pointer (F1); a press after it goes through          |
// | remount while a create is pending      | the new mount shows the row busy and cannot press again; one host call (B2)            |
// | already linked (a second create)       | the host's already_linked sentence as an error toast (B2)                             |
// | name taken                             | the host's name_taken sentence as an error toast (F2)                                 |
// | link not saved after the DAW added it  | the host's link_failed sentence as an error toast, and the live tracks read again (B6) |
// | RTL and emoji title                    | the toast and the row keep the title exactly                                          |
// | long title                             | the row's track cell truncates with the full name as its title                        |
// | layout switched mid-press              | the host's answer decides: a flat button press that made a folder says folder         |
// | track list re-read without the track   | the row stays Linked until the list lists it (shown from the answer)                  |
// | track deleted after the list read it   | the row shows Track missing (the answer's copy is dropped once listed)                |
// | a read after the answer lacks it       | the row shows Track missing (the answer's copy is dropped, B4)                        |
// | reload mid-action, leave mid-action    | not tested: the host call is not cancellable; the link is the host's and is re-read   |
// |                                        | on the next mount (useChapterLinks reads the mapping on mount)                        |
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterLinksTable } from './ChapterLinksTable';
import { CREATE_QUIET_MS, resetChapterTrackCreateGuard, useChapterLinks } from './useChapterLinks';
import { VoiceLayoutContext } from './voiceLayout';
import type { LiveTracks } from './useLiveTracks';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_TRACKS_PROJECT } from '../../api/mockFixtures';
import type { ChapterTrackCreateResult } from '../../api/contracts/chapterTrackMap';
import { headingName } from '../../chapterHeading';
import { chapterName } from '../../chapterName';
import type { NarrationApi, Track, VoiceTracksLayout } from '../../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetChapterTrackCreateGuard();
});

/** The name the host gives a chapter's new track: its display title, the subtitle joined on. */
const trackNameOf = (index: number) => {
  const chapter = WIRE_CHAPTERS[index];
  return chapter.subtitle ? `${chapter.title}: ${chapter.subtitle}` : chapter.title;
};

function liveStub(): LiveTracks {
  return { reason: '', message: '', readAt: Date.now(), busy: false, refreshing: false, stale: false, error: '', refresh: vi.fn(), recheck: vi.fn(async () => undefined), join: vi.fn() };
}

type Harness = {
  api: NarrationApi;
  notify: ReturnType<typeof vi.fn>;
  live: LiveTracks;
  setTracks: (tracks: Track[], readAt?: number | null) => void;
  unmount: () => void;
};

function renderTable({
  api = createMockApi(),
  tracks = WIRE_TRACKS_PROJECT.tracks,
  layout = 'flat',
}: { api?: NarrationApi; tracks?: Track[]; layout?: VoiceTracksLayout } = {}): Harness {
  const notify = vi.fn();
  const live = liveStub();
  const harness = { api, notify, live } as Harness;
  function Table() {
    const [read, setRead] = useState<{ tracks: Track[]; readAt: number | null }>({ tracks, readAt: null });
    harness.setTracks = (next, readAt = null) => setRead({ tracks: next, readAt });
    const links = useChapterLinks(read.tracks, 0, () => {}, read.readAt);
    return <ChapterLinksTable links={links} notify={notify} live={live} />;
  }
  const { unmount } = render(
    <ApiProvider api={api}>
      <MemoryRouter>
        <VoiceLayoutContext.Provider value={layout}>
          <Table />
        </VoiceLayoutContext.Provider>
      </MemoryRouter>
    </ApiProvider>,
  );
  harness.unmount = unmount;
  return harness;
}

function chapterRow(table: HTMLElement, title: string): HTMLTableRowElement {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByRole('cell', { name: title }));
  if (!row) throw new Error(`No row found for chapter "${title}"`);
  return row as HTMLTableRowElement;
}

const short = (index: number) => chapterName(WIRE_CHAPTERS[index], 'short');

async function firstRow() {
  const table = await screen.findByRole('table', { name: 'Chapter links' });
  await waitFor(() => chapterRow(table, headingName(WIRE_CHAPTERS[0])));
  return { table, row: chapterRow(table, headingName(WIRE_CHAPTERS[0])) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('ChapterLinksTable: create a track for a chapter with no link', () => {
  it('puts one create button on each unlinked row, and none on a linked or missing-track row', async () => {
    const api = createMockApi();
    await api.chapterTrackSet(WIRE_CHAPTERS[1].id, WIRE_TRACKS_PROJECT.tracks[1].guid);
    await api.chapterTrackMapConfirm('{NOT-A-REAL-TRACK-GUID}', WIRE_CHAPTERS[2].id);
    renderTable({ api });
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    await waitFor(() => expect(within(chapterRow(table, headingName(WIRE_CHAPTERS[1]))).getByText('Linked')).toBeTruthy());
    await waitFor(() => expect(within(chapterRow(table, headingName(WIRE_CHAPTERS[2]))).getByText('Track missing')).toBeTruthy());
    expect(within(chapterRow(table, headingName(WIRE_CHAPTERS[0]))).getByRole('button', { name: `Create a track for ${short(0)}` })).toBeTruthy();
    expect(within(chapterRow(table, headingName(WIRE_CHAPTERS[1]))).queryByRole('button', { name: /^Create a/ })).toBeNull();
    expect(within(chapterRow(table, headingName(WIRE_CHAPTERS[2]))).queryByRole('button', { name: /^Create a/ })).toBeNull();
    const buttons = within(table).getAllByRole('button', { name: /^Create a track for/ });
    const unlinked = within(table).getAllByText('Not linked');
    expect(buttons).toHaveLength(unlinked.length);
  });

  it('with no tracks to choose, offers the create button as the row’s action', async () => {
    renderTable({ tracks: [] });
    const { row } = await firstRow();
    expect(within(row).getByText('No REAPER tracks to link')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /^Use this (track|folder) for/ })).toBeNull();
    expect(within(row).getByRole('button', { name: `Create a track for ${short(0)}` })).toBeTruthy();
  });

  it('links the chapter to the new track at once, toasts what was made and reads the live tracks again', async () => {
    const user = userEvent.setup();
    const { api, notify, live } = renderTable();
    const { row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    await waitFor(() => expect(within(row).getByText('Linked')).toBeTruthy());
    // The track list passed in has not read the new track yet: the row shows it from the host's answer.
    // The chapter cell and the track cell: the new track is named after the chapter's display title.
    expect(within(row).getAllByText(trackNameOf(0))).toHaveLength(2);
    expect(within(row).queryByRole('button', { name: /^Create a/ })).toBeNull();
    expect(live.refresh).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(`Created the track “${trackNameOf(0)}” and linked ${short(0)} to it. Save the project to keep it.`, 'info');
    const { mappings } = await api.chapterTrackMapList();
    expect(mappings.filter((mapping) => mapping.chapterId === WIRE_CHAPTERS[0].id)).toHaveLength(1);
  });

  it('in Voice folders, offers a folder and shows the new folder with its one voice', async () => {
    const user = userEvent.setup();
    const api = createMockApi({}, { voiceFolders: true });
    const { notify } = renderTable({ api, layout: 'folders' });
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    await waitFor(() => chapterRow(table, headingName(WIRE_CHAPTERS[1])));
    const row = chapterRow(table, headingName(WIRE_CHAPTERS[1]));
    await user.click(within(row).getByRole('button', { name: `Create a folder for ${short(1)}` }));
    await waitFor(() => expect(within(row).getByText(`${trackNameOf(1)} · 1 voice`)).toBeTruthy());
    expect(notify).toHaveBeenCalledWith(
      `Created the folder “${trackNameOf(1)}” with a Narrator track and linked ${short(1)} to it. Save the project to keep it.`,
      'info',
    );
  });

  it('is busy while the DAW answers: the button spins, Confirm is off, and a second press adds nothing', async () => {
    const user = userEvent.setup();
    const base = createMockApi();
    const answer = deferred<ChapterTrackCreateResult>();
    const create = vi.fn(() => answer.promise);
    const { notify } = renderTable({ api: { ...base, chapterTrackCreate: create } });
    const { table, row } = await firstRow();
    const button = within(row).getByRole('button', { name: `Create a track for ${short(0)}` });
    await user.click(button);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(
      within(row)
        .getByRole('button', { name: /^Use this (track|folder) for/ })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    await user.click(button);
    // Every other row's create button is off while one runs, and a press on it does nothing (walkthrough F1).
    const others = within(table)
      .getAllByRole('button', { name: /^Create a track for/ })
      .filter((other) => other !== button);
    expect(others.length).toBeGreaterThan(0);
    for (const other of others) expect(other.getAttribute('aria-disabled')).toBe('true');
    await user.click(within(chapterRow(table, headingName(WIRE_CHAPTERS[1]))).getByRole('button', { name: `Create a track for ${short(1)}` }));
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => answer.resolve(await base.chapterTrackCreate(WIRE_CHAPTERS[0].id)));
    await waitFor(() => expect(within(row).getByText('Linked')).toBeTruthy());
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['recording', 'REAPER is recording. Stop the take, then create the track.'],
    ['standalone', 'REAPER is not connected to this app, so no track can be added. Start REAPER, then try again.'],
    ['not_running', 'REAPER is not answering, so no track can be added. Check that REAPER is open, then try again.'],
  ] as const)('a refusal (%s) is the host’s sentence as an error toast, and the row is unchanged', async (reason, message) => {
    const user = userEvent.setup();
    const base = createMockApi();
    const { notify, live } = renderTable({ api: { ...base, chapterTrackCreate: async () => ({ outcome: 'refused', reason, message }) } });
    const { row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(message, 'error'));
    expect(within(row).getByText('Not linked')).toBeTruthy();
    expect(
      within(row)
        .getByRole('button', { name: `Create a track for ${short(0)}` })
        .getAttribute('aria-busy'),
    ).toBeNull();
    expect(live.refresh).not.toHaveBeenCalled();
  });

  it('a REAPER that is not connected to the mock refuses with its own sentence', async () => {
    const user = userEvent.setup();
    const { notify } = renderTable({ api: createMockApi({}, { reaperState: 'unavailable' }) });
    const { row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('REAPER is not connected to this app'), 'error'));
  });

  it('a failed call is an error toast that says the track could not be added', async () => {
    const user = userEvent.setup();
    const base = createMockApi();
    const { notify } = renderTable({ api: { ...base, chapterTrackCreate: () => Promise.reject(new Error('the host went away')) } });
    const { row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('The track could not be added: the host went away', 'error'));
    expect(within(row).getByText('Not linked')).toBeTruthy();
  });

  it('keeps a right-to-left and emoji title exactly, and truncates a long one with its full name as the title', async () => {
    const user = userEvent.setup();
    const base = createMockApi();
    const rtl = 'פרק ١ \u{1F30A} البحر';
    const long = `Chapter 2: ${'A very long chapter title that goes on '.repeat(6).trim()}`;
    const chapters = async () => {
      const list = await base.manuscriptChapters();
      return list.map((chapter) =>
        chapter.id === WIRE_CHAPTERS[0].id ? { ...chapter, title: rtl } : chapter.id === WIRE_CHAPTERS[1].id ? { ...chapter, title: long } : chapter,
      );
    };
    const create = async (chapterId: string): Promise<ChapterTrackCreateResult> => {
      const made = await base.chapterTrackCreate(chapterId);
      if (made.outcome !== 'created') return made;
      return { ...made, track: { ...made.track, name: chapterId === WIRE_CHAPTERS[0].id ? rtl : long } };
    };
    const { notify } = renderTable({ api: { ...base, manuscriptChapters: chapters, chapterTrackCreate: create } });
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    await user.click(await within(table).findByRole('button', { name: `Create a track for ${rtl}` }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(`Created the track “${rtl}” and linked ${rtl} to it. Save the project to keep it.`, 'info'));
    await waitFor(() => expect(within(table).queryByRole('button', { name: `Create a track for ${rtl}` })).toBeNull());
    // Past the quiet time after an answer (tested on its own below).
    resetChapterTrackCreateGuard();
    await user.click(within(table).getByRole('button', { name: `Create a track for ${long}` }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining(`“${long}”`), 'info'));
    await waitFor(() => expect(within(table).queryByRole('button', { name: `Create a track for ${long}` })).toBeNull());
    const names = within(table).getAllByTitle(long);
    expect(names.some((element) => element.className.includes('truncate'))).toBe(true);
    expect(
      within(table)
        .getAllByText(rtl)
        .some((element) => element.tagName === 'BDI'),
    ).toBe(true);
  });

  it('a layout switched mid-press: the host’s answer decides what the toast says was made', async () => {
    const user = userEvent.setup();
    const base = createMockApi();
    const answer = deferred<ChapterTrackCreateResult>();
    const { notify } = renderTable({ api: { ...base, chapterTrackCreate: () => answer.promise } });
    const { row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    await base.voiceTracksSetLayout('folders');
    await act(async () => answer.resolve(await base.chapterTrackCreate(WIRE_CHAPTERS[0].id)));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('Created the folder'), 'info'));
  });

  it('shows the new track from the answer until the list reads it, then a track deleted in the DAW shows as missing', async () => {
    const user = userEvent.setup();
    const harness = renderTable();
    const { row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    await waitFor(() => expect(within(row).getByText('Linked')).toBeTruthy());
    const { mappings } = await harness.api.chapterTrackMapList();
    const guid = mappings.find((mapping) => mapping.chapterId === WIRE_CHAPTERS[0].id)?.trackGuid ?? '';
    const listed: Track = { ...WIRE_TRACKS_PROJECT.tracks[0], guid, name: trackNameOf(0), index: WIRE_TRACKS_PROJECT.tracks.length };
    act(() => harness.setTracks([...WIRE_TRACKS_PROJECT.tracks, listed]));
    expect(within(row).getByText('Linked')).toBeTruthy();
    act(() => harness.setTracks(WIRE_TRACKS_PROJECT.tracks));
    await waitFor(() => expect(within(row).getByText('Track missing')).toBeTruthy());
  });
  it('ignores a create press within the quiet time after an answer, and takes one after it (F1)', async () => {
    const user = userEvent.setup();
    const base = createMockApi();
    const create = vi.fn((chapterId: string) => base.chapterTrackCreate(chapterId));
    renderTable({ api: { ...base, chapterTrackCreate: create } });
    const { table, row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    await waitFor(() => expect(within(row).getByText('Linked')).toBeTruthy());
    // The rows below moved up a line: a fast second click lands on the next row's button. It must not add a track.
    const next = within(chapterRow(table, headingName(WIRE_CHAPTERS[1]))).getByRole('button', { name: `Create a track for ${short(1)}` });
    await user.click(next);
    expect(create).toHaveBeenCalledTimes(1);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + CREATE_QUIET_MS + 1);
    await user.click(next);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('a remount while a create is pending shows the row busy and cannot press again (B2)', async () => {
    const user = userEvent.setup();
    const base = createMockApi();
    const answer = deferred<ChapterTrackCreateResult>();
    const create = vi.fn(() => answer.promise);
    const api = { ...base, chapterTrackCreate: create };
    const first = renderTable({ api });
    const { row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    first.unmount();
    renderTable({ api });
    const again = await firstRow();
    const button = within(again.row).getByRole('button', { name: `Create a track for ${short(0)}` });
    expect(button.getAttribute('aria-busy')).toBe('true');
    await user.click(button);
    await user.click(within(chapterRow(again.table, headingName(WIRE_CHAPTERS[1]))).getByRole('button', { name: `Create a track for ${short(1)}` }));
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => answer.resolve(await base.chapterTrackCreate(WIRE_CHAPTERS[0].id)));
    // The new mount reads the links again once the create ends: the chapter shows its link.
    await waitFor(() => expect(within(again.row).queryByRole('button', { name: /^Create a track for/ })).toBeNull());
  });

  it.each([
    ['already_linked', 'This chapter is already linked to “Chapter 1” in REAPER. Change or clear that link instead of adding another track.'],
    ['name_taken', 'REAPER already has a track named “Chapter 1: Down the Rabbit-Hole”. Link that one with the picker instead of adding another.'],
  ] as const)('a %s refusal is an error toast and the row is unchanged (B2, F2)', async (reason, message) => {
    const user = userEvent.setup();
    const base = createMockApi();
    const { notify, live } = renderTable({ api: { ...base, chapterTrackCreate: async () => ({ outcome: 'refused', reason, message }) } });
    const { row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(message, 'error'));
    expect(within(row).getByText('Not linked')).toBeTruthy();
    expect(live.refresh).not.toHaveBeenCalled();
  });

  it('the mock refuses a name a track already has after the chapter was unlinked, as the host does (F2)', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    await api.chapterTrackCreate(WIRE_CHAPTERS[0].id);
    await api.chapterTrackUnlink(WIRE_CHAPTERS[0].id);
    const { notify } = renderTable({ api });
    const { row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining(`already has a track named “${trackNameOf(0)}”`), 'error'));
  });

  it('a link that could not be saved after the DAW added the track is an error toast, and the live tracks are read again (B6)', async () => {
    const user = userEvent.setup();
    const base = createMockApi();
    const message = 'REAPER added the track “Chapter 1: Down the Rabbit-Hole”, but its link could not be saved: the disk is full.';
    const { notify, live } = renderTable({ api: { ...base, chapterTrackCreate: async () => ({ outcome: 'refused', reason: 'link_failed', message }) } });
    const { row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(message, 'error'));
    expect(live.refresh).toHaveBeenCalledTimes(1);
  });

  it('drops a created track that a read answered after the create leaves out, so the row says Track missing (B4)', async () => {
    const user = userEvent.setup();
    const harness = renderTable();
    const { row } = await firstRow();
    await user.click(within(row).getByRole('button', { name: `Create a track for ${short(0)}` }));
    await waitFor(() => expect(within(row).getByText('Linked')).toBeTruthy());
    // A re-read with no new answer time keeps it (the list has not read REAPER since); one that answered later does not.
    act(() => harness.setTracks([...WIRE_TRACKS_PROJECT.tracks]));
    expect(within(row).getByText('Linked')).toBeTruthy();
    act(() => harness.setTracks([...WIRE_TRACKS_PROJECT.tracks], Date.now() + 1000));
    await waitFor(() => expect(within(row).getByText('Track missing')).toBeTruthy());
  });
});
