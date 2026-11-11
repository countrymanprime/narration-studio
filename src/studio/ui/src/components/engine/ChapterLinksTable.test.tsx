// @vitest-environment jsdom
import { ChapterTrackStateProvider } from '../chapterTracks/ChapterTrackState';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterLinksTable, UNPLAYABLE } from './ChapterLinksTable';
import { CREATE_QUIET_MS, useChapterLinks } from './useChapterLinks';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_TRACKS_PROJECT, wireLink } from '../../api/mockFixtures';
import { headingName } from '../../chapterHeading';

afterEach(cleanup);

// A narrator takes longer than this between linking and pressing Change; a double click does not (CREATE_QUIET_MS).
const pastQuiet = () => new Promise((resolve) => setTimeout(resolve, CREATE_QUIET_MS + 30));

const notify = vi.fn();

// The table as the engine panel mounts it: drawn from the one chapter-links reader.
function Table({ onChanged = () => {} }: { onChanged?: () => void }) {
  const links = useChapterLinks(WIRE_TRACKS_PROJECT.tracks, 0, onChanged);
  return <ChapterLinksTable links={links} notify={notify} />;
}

function renderTable(onChanged?: () => void) {
  const api = createMockApi();
  render(
    <ApiProvider api={api}>
      <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
        <MemoryRouter initialEntries={['/production']}>
          <Table onChanged={onChanged} />
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </ChapterTrackStateProvider>
    </ApiProvider>,
  );
  return api;
}

function Where() {
  return <output aria-label="Location">{useLocation().pathname}</output>;
}

// A chapter's row, found by its first cell (the chapter title), not a bare text match: several track names in the
// fixture happen to equal chapter titles ("Chapter 1", "Chapter 2"), so `getByText` alone would match more than one
// element once a track name appears in the row too.
function chapterRow(table: HTMLElement, title: string): HTMLTableRowElement {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByRole('cell', { name: title }));
  if (!row) throw new Error(`No row found for chapter "${title}"`);
  return row as HTMLTableRowElement;
}

describe('ChapterLinksTable', () => {
  // The owner could not link the opening or closing credits to a track: the table listed only the manuscript's chapters. The credits are
  // chapters of that list, and the host takes their ids (credits-opening, credits-closing) in chapterTrackSet like a chapter's.
  it('lists the opening credits first and the closing credits last, and links them to a track', async () => {
    const user = userEvent.setup();
    const api = renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    await waitFor(() => expect(within(table).getByRole('cell', { name: 'Opening credits' })).toBeTruthy());
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByRole('cell', { name: 'Opening credits' })).toBeTruthy();
    expect(within(rows[rows.length - 1]).getByRole('cell', { name: 'Closing credits' })).toBeTruthy();

    const opening = chapterRow(table, 'Opening credits');
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this (track|folder) for/ }));
    await waitFor(() => expect(within(chapterRow(table, 'Opening credits')).getByRole('img', { name: 'Linked' })).toBeTruthy());
    expect((await api.chapterTrackMapList()).mappings.some((m) => m.chapterId === 'credits-opening')).toBe(true);
  });

  // qa-breaker, #3053: Opening credits took Chapter 1's track from this list and nothing on the page said Chapter 1 was now unlinked.
  it('says which chapter lost a track when a pick here takes it from another chapter', async () => {
    const user = userEvent.setup();
    notify.mockClear();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    await waitFor(() => expect(within(table).getByRole('cell', { name: 'Opening credits' })).toBeTruthy());
    const track = WIRE_TRACKS_PROJECT.tracks[0].guid;
    const link = async (title: string) => {
      const row = chapterRow(table, title);
      await user.selectOptions(within(row).getByRole('combobox'), track);
      await user.click(within(row).getByRole('button', { name: /^Use this (track|folder) for/ }));
    };
    await link('Opening credits');
    await waitFor(() => expect(within(chapterRow(table, 'Opening credits')).getByRole('img', { name: 'Linked' })).toBeTruthy());
    expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/not linked/), 'info');
    await link(headingName(WIRE_CHAPTERS[0]));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Opening credits was linked to that track and is now not linked.', 'info'));
  });

  // qa-breaker: an ignored Confirm of the pair already linked ends no change, so the flag stayed up and a later takeover made elsewhere (the dialog)
  // came as a toast beside its own warning.
  it('does not toast a takeover made elsewhere after an ignored Confirm of the already linked track', async () => {
    const user = userEvent.setup();
    notify.mockClear();
    const track = WIRE_TRACKS_PROJECT.tracks[0].guid;
    function Harness() {
      const links = useChapterLinks(WIRE_TRACKS_PROJECT.tracks, 0, () => {});
      return (
        <>
          <ChapterLinksTable links={links} notify={notify} />
          <button onClick={() => links.set(WIRE_CHAPTERS[1].id, track)}>elsewhere</button>
        </>
      );
    }
    render(
      <ApiProvider api={createMockApi()}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <MemoryRouter initialEntries={['/production']}>
            <Harness />
          </MemoryRouter>
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    await waitFor(() => expect(within(table).getByRole('cell', { name: 'Opening credits' })).toBeTruthy());
    const opening = () => chapterRow(table, 'Opening credits');
    await user.selectOptions(within(opening()).getByRole('combobox'), track);
    await user.click(within(opening()).getByRole('button', { name: /^Use this (track|folder) for/ }));
    await waitFor(() => expect(within(opening()).getByRole('img', { name: 'Linked' })).toBeTruthy());
    await pastQuiet();
    await user.click(within(opening()).getByRole('button', { name: /^Change the track for/ }));
    await user.click(within(opening()).getByRole('button', { name: /^Check the link for/ }));
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    await waitFor(() => expect(within(opening()).queryByRole('img', { name: 'Linked' })).toBeNull());
    expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/not linked/), 'info');
  });

  // The breaker double-clicked Confirm: the second press arrived before the row re-rendered busy and unlinked both rows.
  it('links once when Confirm is pressed twice in a row', async () => {
    const user = userEvent.setup();
    const api = renderTable();
    const set = vi.spyOn(api, 'chapterTrackSet');
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = await waitFor(() => chapterRow(table, 'Opening credits'));
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    const confirm = within(opening).getByRole('button', { name: /^Use this (track|folder) for/ });
    await user.dblClick(confirm);
    await waitFor(() => expect(within(chapterRow(table, 'Opening credits')).getByRole('img', { name: 'Linked' })).toBeTruthy());
    expect(set).toHaveBeenCalledTimes(1);
    expect((await api.chapterTrackMapList()).mappings.filter((m) => m.chapterId === 'credits-opening')).toHaveLength(1);
  });

  it('opens a linked credits chapter in Editing or Proof like any chapter', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = await waitFor(() => chapterRow(table, 'Opening credits'));
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this (track|folder) for/ }));
    await waitFor(() => expect(within(chapterRow(table, 'Opening credits')).getByRole('img', { name: 'Linked' })).toBeTruthy());

    await user.click(within(chapterRow(table, 'Opening credits')).getByRole('button', { name: /^More actions for / }));
    expect(await screen.findByRole('menuitem', { name: 'Open in Editing' })).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: 'Open in Proof' }));
    expect(screen.getByRole('status', { name: 'Location' }).textContent).toBe('/proof/credits-opening');
  });

  it('lists every narration chapter as not linked when nothing is confirmed', async () => {
    renderTable();

    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    expect(within(firstRow).getByRole('img', { name: 'Not linked' })).toBeTruthy();
  });

  // Alignment audit R3EN2-1 and R3EN1-4: every unlinked row opened on the first track with a live Confirm, so one press linked the wrong track.
  it('opens every unlinked row on "Choose a track" with Confirm off until a track is picked', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const secondRow = chapterRow(table, headingName(WIRE_CHAPTERS[1]));
    const select = within(secondRow).getByRole('combobox') as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe('Choose a track');
    const confirm = within(secondRow).getByRole('button', { name: /^Use this (track|folder) for/ });
    expect(confirm.getAttribute('aria-disabled')).toBe('true');

    await user.selectOptions(select, WIRE_TRACKS_PROJECT.tracks[1].guid);
    expect(confirm.getAttribute('aria-disabled')).toBeNull();
  });

  // #3275: Confirm on the track the chapter already has looked enabled and did nothing, so the narrator could not tell a resync from a dead button.
  it('acts when Confirm is pressed on the track the chapter already has: says nothing changed, writes nothing, leaves the picker', async () => {
    const user = userEvent.setup();
    notify.mockClear();
    const onChanged = vi.fn();
    const api = renderTable(onChanged);
    const set = vi.spyOn(api, 'chapterTrackSet');
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = chapterRow(table, 'Opening credits');
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this track for/ }));
    await within(opening).findByRole('button', { name: /^Change the track for/ });
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Change the track for/ }));
    expect(set).toHaveBeenCalledTimes(1);
    const changes = onChanged.mock.calls.length;

    // The picker opens on the linked track, and its check is live: pressing it is not a dead click (a narrator takes longer than the quiet period).
    await pastQuiet();
    const confirm = within(opening).getByRole('button', { name: /^Check the link for/ });
    expect(confirm.getAttribute('aria-disabled')).toBeNull();
    await user.click(confirm);

    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/is linked to “.*” \(a single track\)\.$/), 'info'));
    expect(notify.mock.calls.at(-1)?.[0]).toContain(WIRE_TRACKS_PROJECT.tracks[0].name);
    expect(set).toHaveBeenCalledTimes(1);
    expect(await within(opening).findByRole('button', { name: /^Change the track for/ })).toBeTruthy();
    // Nothing changed, so the panel is not told a change was made (it would read the links and the stages again).
    expect(onChanged).toHaveBeenCalledTimes(changes);
  });

  // UX review: the re-read closes the picker, so Change takes the check's place; a double click's second press must not reopen it.
  it('ignores a fast second press on Change right after the check closed the picker', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = chapterRow(table, 'Opening credits');
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this track for/ }));
    await within(opening).findByRole('button', { name: /^Change the track for/ });
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Change the track for/ }));
    await pastQuiet(); // a narrator takes longer than the quiet period between Change and the check
    await user.click(within(opening).getByRole('button', { name: /^Check the link for/ }));
    const change = await within(opening).findByRole('button', { name: /^Change the track for/ });
    await user.click(change);
    expect(within(opening).queryByRole('combobox')).toBeNull();
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Change the track for/ }));
    expect(within(opening).getByRole('combobox')).toBeTruthy();
  });

  // #3274: the status word took the room the track's name needed; the status is an icon with its words in a tooltip and as its name.
  it('shows a chapter\u2019s status as an icon named by its words, not as a word that takes the row\u2019s width', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = chapterRow(table, 'Opening credits');
    const mark = within(opening).getByRole('img', { name: 'Not linked' });
    expect(within(opening).queryByText('Not linked')).toBeNull();
    await user.hover(mark);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Not linked');
  });

  // #3274: "i have no fucking idea if this relink is going to work": before it is pressed the check says what it will do.
  it('says before the check is pressed what the pick will do: the track and what it is, what it replaces, and which chapter loses it', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const [first, second] = WIRE_TRACKS_PROJECT.tracks;
    const opening = chapterRow(table, 'Opening credits');
    await user.selectOptions(within(opening).getByRole('combobox'), first.guid);
    // A pick on a row with no link: the name stays short, and the hint says what the check will do: no "instead of", and the track says what it is.
    const check = () => within(opening).getByRole('button', { name: /^Use this track for/ });
    expect(check().getAttribute('aria-label')).toBe('Use this track for Opening credits');
    await user.hover(check());
    expect((await screen.findByRole('tooltip')).textContent).toBe(`links “${first.name}” (a single track)`);
    await user.unhover(check());
    await user.click(check());
    await within(opening).findByRole('img', { name: 'Linked' });
    await pastQuiet();
    // Change to another track: the link it replaces is named.
    await user.click(within(opening).getByRole('button', { name: /^Change the track for/ }));
    await pastQuiet();
    await user.selectOptions(within(opening).getByRole('combobox'), second.guid);
    await user.hover(check());
    expect((await screen.findByRole('tooltip')).textContent).toBe(`links “${second.name}” (a single track), instead of “${first.name}”`);
    await user.unhover(check());
    // A track another chapter holds: the chapter that loses it is named.
    const chapter = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await user.selectOptions(within(chapter).getByRole('combobox'), first.guid);
    await user.hover(within(chapter).getByRole('button', { name: /^Use this track for/ }));
    expect((await screen.findByRole('tooltip')).textContent).toContain('Opening credits loses its link');
  });

  // qa-breaker (#3281): a double click on Change puts the check under the second press; it must not read and toast then.
  it('ignores a fast press on the check right after Change opened the picker', async () => {
    const user = userEvent.setup();
    notify.mockClear();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = chapterRow(table, 'Opening credits');
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this track for/ }));
    await within(opening).findByRole('button', { name: /^Change the track for/ });
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Change the track for/ }));
    notify.mockClear();
    await user.click(within(opening).getByRole('button', { name: /^Check the link for/ }));
    expect(notify).not.toHaveBeenCalledWith(expect.anything(), 'info');
    expect(within(opening).getByRole('combobox')).toBeTruthy();
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Check the link for/ }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/is linked to “.*” \(a single track\)\.$/), 'info'));
  });

  // Narrator walkthrough: after Clear the select still held the old track and the check looked ready, one press from linking it again.
  it('opens a cleared row on "Choose a track" with the check off', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = chapterRow(table, 'Opening credits');
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this track for/ }));
    await within(opening).findByRole('button', { name: /^Clear the link for/ });
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Clear the link for/ }));
    const select = (await within(opening).findByRole('combobox')) as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe('Choose a track');
    expect(
      within(opening)
        .getByRole('button', { name: /^Use this track for/ })
        .getAttribute('aria-disabled'),
    ).toBe('true');
  });

  // The removed Tracks card flagged a track with a missing or unsupported item; a chapter must never be silently linked to one that cannot play.
  it('warns on a linked track whose audio cannot play, and only on that one', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = chapterRow(table, 'Opening credits');
    // tracks[1] is Chapter 2's: its source file is missing on disk.
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[1].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this track for/ }));
    await within(opening).findByRole('button', { name: /^Change the track for/ });
    expect(within(opening).getByRole('img', { name: UNPLAYABLE })).toBeTruthy();
    // The keyboard reaches it too, and the tooltip opens on focus.
    const mark = within(opening).getByRole('img', { name: UNPLAYABLE });
    expect(mark.tabIndex).toBe(0);
    mark.focus();
    expect((await screen.findByRole('tooltip')).textContent).toBe(UNPLAYABLE);

    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Change the track for/ }));
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this track for/ }));
    await within(opening).findByRole('button', { name: /^Change the track for/ });
    expect(within(opening).queryByRole('img', { name: UNPLAYABLE })).toBeNull();

    // tracks[2] is Click Track, a MIDI item the app cannot play.
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Change the track for/ }));
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[2].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this track for/ }));
    await within(opening).findByRole('button', { name: /^Change the track for/ });
    expect(within(opening).getByRole('img', { name: UNPLAYABLE })).toBeTruthy();
  });

  // QA breaker B1: Change, pick, Cancel, Change again brought back the abandoned pick, and the check linked it in one press.
  it('reopens Change on the linked track after a Cancel, not on the abandoned pick', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = chapterRow(table, 'Opening credits');
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this track for/ }));
    await pastQuiet();
    await user.click(await within(opening).findByRole('button', { name: /^Change the track for/ }));
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[1].guid);
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Cancel the edit/ }));
    await pastQuiet();
    await user.click(await within(opening).findByRole('button', { name: /^Change the track for/ }));
    expect((within(opening).getByRole('combobox') as HTMLSelectElement).value).toBe(WIRE_TRACKS_PROJECT.tracks[0].guid);
  });

  // QA breaker B2: the second press of a double click on the check lands on the Change that takes its place. Press the replacement at once.
  it("ignores a press on the Change that takes the check's place right after a link", async () => {
    const user = userEvent.setup();
    const api = renderTable();
    const set = vi.spyOn(api, 'chapterTrackSet');
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = chapterRow(table, 'Opening credits');
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this track for/ }));
    await user.click(await within(opening).findByRole('button', { name: /^Change the track for/ }));
    expect(set).toHaveBeenCalledTimes(1);
    expect(within(opening).queryByRole('combobox')).toBeNull();
    // A narrator's own press, after the quiet time, still opens the picker.
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Change the track for/ }));
    expect(within(opening).getByRole('combobox')).toBeTruthy();
  });

  // Intent review M3: the second press of a double click on Cancel lands on the Clear that takes its place.
  it("ignores a press on the Clear that takes Cancel's place right after a Cancel", async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = chapterRow(table, 'Opening credits');
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this track for/ }));
    await within(opening).findByRole('button', { name: /^Change the track for/ });
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Change the track for/ }));
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Cancel the edit/ }));
    await user.click(await within(opening).findByRole('button', { name: /^Clear the link for/ }));
    expect(within(opening).getByRole('img', { name: 'Linked' })).toBeTruthy();
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Clear the link for/ }));
    await waitFor(() => expect(within(opening).getByRole('img', { name: 'Not linked' })).toBeTruthy());
  });

  // The second press of a double click on Clear lands on the Create that takes its place, which would add a track in REAPER.
  it("ignores a press on the Create that takes Clear's place right after a Clear", async () => {
    const user = userEvent.setup();
    const api = renderTable();
    const create = vi.spyOn(api, 'chapterTrackCreate');
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const opening = chapterRow(table, 'Opening credits');
    await user.selectOptions(within(opening).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(opening).getByRole('button', { name: /^Use this track for/ }));
    await within(opening).findByRole('button', { name: /^Change the track for/ });
    await pastQuiet();
    await user.click(within(opening).getByRole('button', { name: /^Clear the link for/ }));
    await user.click(await within(opening).findByRole('button', { name: /^Create a track for/ }));
    expect(create).not.toHaveBeenCalled();
  });

  // Intent review: Change, Cancel, Change on a row whose track is gone restored a pick that does not exist and left the check ready.
  it('reopens a Track missing row on "Choose a track" with the check off after a Cancel', async () => {
    const api = createMockApi({}, { chapterTrackMappings: [wireLink('{NOT-A-REAL-TRACK-GUID}', WIRE_CHAPTERS[0].id)] });
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <MemoryRouter>
            <Table />
          </MemoryRouter>
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Track missing' })).toBeTruthy());
    await pastQuiet();
    await user.click(within(firstRow).getByRole('button', { name: /^Change the track for/ }));
    await pastQuiet();
    await user.click(within(firstRow).getByRole('button', { name: /^Cancel the edit/ }));
    await pastQuiet();
    await user.click(within(firstRow).getByRole('button', { name: /^Change the track for/ }));
    expect((within(firstRow).getByRole('combobox') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('Choose a track');
    expect(
      within(firstRow)
        .getByRole('button', { name: /^Use this track for/ })
        .getAttribute('aria-disabled'),
    ).toBe('true');
  });

  // ENX-1: the columns were sized by their content, so they moved between states and rows.
  it('lays the table out on fixed columns with a visible heading over the track', async () => {
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    expect(table.className).toContain('table-fixed');
    expect(table.querySelectorAll('col')).toHaveLength(4);
    expect(within(table).getByRole('columnheader', { name: 'Track' })).toBeTruthy();
  });

  // ENX-4: the status was coloured text that wrapped ("Not / linked") in an auto-width column.
  it('shows each status as a badge in a cell that does not wrap', async () => {
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const status = within(chapterRow(table, headingName(WIRE_CHAPTERS[1]))).getByRole('img', { name: 'Not linked' });
    expect(status.closest('td')?.className).toContain('whitespace-nowrap');
    expect(status.closest('td')?.getAttribute('style') ?? '').not.toContain('color');
  });

  it('names a track another chapter holds, so it is not linked twice by mistake', async () => {
    const api = createMockApi({}, { chapterTrackMappings: [wireLink(WIRE_TRACKS_PROJECT.tracks[0].guid, WIRE_CHAPTERS[0].id)] });
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <MemoryRouter>
            <Table />
          </MemoryRouter>
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const secondRow = chapterRow(table, headingName(WIRE_CHAPTERS[1]));
    await waitFor(() =>
      expect(within(secondRow).getByRole('option', { name: new RegExp(`^${WIRE_TRACKS_PROJECT.tracks[0].name} \\(linked to `) })).toBeTruthy(),
    );
  });

  it('opens a linked chapter in Editing or Proof from the row’s More actions menu', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: /^Use this (track|folder) for/ }));
    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Linked' })).toBeTruthy());

    await user.click(within(firstRow).getByRole('button', { name: /^More actions for / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Open in Proof' }));

    expect(screen.getByRole('status', { name: 'Location' }).textContent).toBe(`/proof/${encodeURIComponent(WIRE_CHAPTERS[0].id)}`);
  });

  // ENX-10: the editing check opened from here covers the wide engine panel whole and offers Back, rather than a 20 rem panel cutting it.
  it('opens the editing check as wide as the engine panel, with Back to it', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await user.click(within(firstRow).getByRole('button', { name: /^More actions for / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editing check…' }));
    const check = await screen.findByRole('dialog', { name: /^Editing check: / });
    expect(check.className).toMatch(/44rem/);
    await user.click(within(check).getByRole('button', { name: 'Back to the audio engine' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Editing check: / })).toBeNull());
  });

  it('tells the panel when a link changes, so the panel re-reads it', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    renderTable(onChanged);
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: /^Use this (track|folder) for/ }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('confirms a link, then shows it as Linked with the track name', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));

    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: /^Use this (track|folder) for/ }));

    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Linked' })).toBeTruthy());
    expect(within(firstRow).getAllByText(WIRE_TRACKS_PROJECT.tracks[0].name).length).toBeGreaterThan(0);
  });

  it('clears a confirmed link back to Not linked', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: /^Use this (track|folder) for/ }));
    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Linked' })).toBeTruthy());

    await pastQuiet();
    await user.click(within(firstRow).getByRole('button', { name: /^Clear the link/ }));

    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Not linked' })).toBeTruthy());
  });

  // #3272: the row must not wait for the re-read of the chapters and links to show Not linked; Unlink's own answer carries the links that remain.
  it('shows Not linked as soon as Unlink answers, before the links are read again', async () => {
    const user = userEvent.setup();
    const real = createMockApi();
    let hold = false;
    const api = { ...real, chapterTrackMapList: () => (hold ? new Promise<never>(() => {}) : real.chapterTrackMapList()) };
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <MemoryRouter initialEntries={['/production']}>
            <Table />
          </MemoryRouter>
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: /^Use this (track|folder) for/ }));
    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Linked' })).toBeTruthy());

    hold = true;
    await pastQuiet();
    await user.click(within(firstRow).getByRole('button', { name: /^Clear the link/ }));

    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Not linked' })).toBeTruthy());
  });

  // qa-breaker B5 (#2836): ten rows each offered the same "Change the track" and "Clear the link"; the name now says which chapter.
  it('names the chapter in a linked row’s Change and Clear icons', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: /^Use this (track|folder) for/ }));
    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Linked' })).toBeTruthy());
    const more = within(firstRow)
      .getByRole('button', { name: /^More actions for / })
      .getAttribute('aria-label')!;
    const chapter = more.replace('More actions for ', '');
    expect(within(firstRow).getByRole('button', { name: `Change the track for ${chapter}` })).toBeTruthy();
    expect(within(firstRow).getByRole('button', { name: `Clear the link for ${chapter}` })).toBeTruthy();
  });

  it('Change to another track leaves one link, not two', async () => {
    const user = userEvent.setup();
    const api = renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: /^Use this (track|folder) for/ }));
    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Linked' })).toBeTruthy());

    await pastQuiet();
    await user.click(within(firstRow).getByRole('button', { name: /^Change the track/ }));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[1].guid);
    await user.click(within(firstRow).getByRole('button', { name: /^Use this (track|folder) for/ }));

    await waitFor(() => expect(within(firstRow).getAllByText(WIRE_TRACKS_PROJECT.tracks[1].name).length).toBeGreaterThan(0));
    const { mappings } = await api.chapterTrackMapList();
    expect(mappings.filter((mapping) => mapping.chapterId === WIRE_CHAPTERS[0].id).map((mapping) => mapping.trackGuid)).toEqual([
      WIRE_TRACKS_PROJECT.tracks[1].guid,
    ]);
  });

  it('Clear removes every link a chapter holds, including a double link left by an older Change', async () => {
    const user = userEvent.setup();
    const api = createMockApi({}, { chapterTrackMappings: [wireLink(WIRE_TRACKS_PROJECT.tracks[0].guid, WIRE_CHAPTERS[0].id), wireLink(WIRE_TRACKS_PROJECT.tracks[1].guid, WIRE_CHAPTERS[0].id)] });
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <MemoryRouter>
            <Table />
          </MemoryRouter>
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    // Two links are several, as the Booth says; the row still offers Clear, which removes both.
    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Several tracks' })).toBeTruthy());

    await user.click(within(firstRow).getByRole('button', { name: /^Clear the link/ }));

    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Not linked' })).toBeTruthy());
    const { mappings } = await api.chapterTrackMapList();
    expect(mappings.filter((mapping) => mapping.chapterId === WIRE_CHAPTERS[0].id)).toHaveLength(0);
  });

  // #3363 (intent review): on a chapter with several links the first one was the row's "linked" track, so choosing it only re-read, and choosing
  // the second did nothing because that pair was already held: neither resolved it.
  it.each([0, 1])('Change on a chapter with several links replaces them with the track chosen, whichever of the two it is (%i)', async (which) => {
    const user = userEvent.setup();
    const api = createMockApi({}, { chapterTrackMappings: [wireLink(WIRE_TRACKS_PROJECT.tracks[0].guid, WIRE_CHAPTERS[0].id), wireLink(WIRE_TRACKS_PROJECT.tracks[1].guid, WIRE_CHAPTERS[0].id)] });
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <MemoryRouter>
            <Table />
          </MemoryRouter>
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Several tracks' })).toBeTruthy());

    await user.click(within(firstRow).getByRole('button', { name: /^Change the track/ }));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[which].guid);
    await user.click(within(firstRow).getByRole('button', { name: /^Use this track/ }));

    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Linked' })).toBeTruthy());
    const { mappings } = await api.chapterTrackMapList();
    const mine = mappings.filter((mapping) => mapping.chapterId === WIRE_CHAPTERS[0].id);
    expect(mine.map((mapping) => mapping.trackGuid)).toEqual([WIRE_TRACKS_PROJECT.tracks[which].guid]);
  });

  // #3363 (qa-breaker): the second press of a double click on Change lands on the confirm, which used to open on the first track and replace
  // the chapter's other link at once. A several row opens on "Choose a track", so that press has nothing to confirm.
  it('Change on a chapter with several links opens on no track, so a double click writes nothing', async () => {
    const user = userEvent.setup();
    const api = createMockApi({}, { chapterTrackMappings: [wireLink(WIRE_TRACKS_PROJECT.tracks[0].guid, WIRE_CHAPTERS[0].id), wireLink(WIRE_TRACKS_PROJECT.tracks[1].guid, WIRE_CHAPTERS[0].id)] });
    const set = vi.spyOn(api, 'chapterTrackSet');
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <MemoryRouter>
            <Table />
          </MemoryRouter>
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Several tracks' })).toBeTruthy());

    await user.dblClick(within(firstRow).getByRole('button', { name: /^Change the track/ }));

    expect(set).not.toHaveBeenCalled();
    expect(within(firstRow).getByRole('img', { name: 'Several tracks' })).toBeTruthy();
  });

  it('shows a link to a track that no longer exists as Track missing', async () => {
    const api = createMockApi({}, { chapterTrackMappings: [wireLink('{NOT-A-REAL-TRACK-GUID}', WIRE_CHAPTERS[0].id)] });
    render(
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <MemoryRouter>
            <Table />
          </MemoryRouter>
        </ChapterTrackStateProvider>
      </ApiProvider>,
    );

    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, headingName(WIRE_CHAPTERS[0]));
    await waitFor(() => expect(within(firstRow).getByRole('img', { name: 'Track missing' })).toBeTruthy());
    expect(within(firstRow).getByText('Linked track is missing from this project')).toBeTruthy();
  });
});
