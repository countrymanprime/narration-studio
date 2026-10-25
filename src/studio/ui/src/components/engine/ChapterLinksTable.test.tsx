// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterLinksTable } from './ChapterLinksTable';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_TRACKS_PROJECT } from '../../api/mockFixtures';
import { chapterName } from '../../chapterName';

afterEach(cleanup);

const notify = vi.fn();

function renderTable(onChanged?: () => void) {
  const api = createMockApi();
  render(
    <ApiProvider api={api}>
      <MemoryRouter initialEntries={['/production']}>
        <ChapterLinksTable tracks={WIRE_TRACKS_PROJECT.tracks} notify={notify} onChanged={onChanged} />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
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
  it('lists every narration chapter as not linked when nothing is confirmed', async () => {
    renderTable();

    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, chapterName(WIRE_CHAPTERS[0]));
    expect(within(firstRow).getByText('Not linked')).toBeTruthy();
  });

  // Alignment audit R3EN2-1 and R3EN1-4: every unlinked row opened on the first track with a live Confirm, so one press linked the wrong track.
  it('opens every unlinked row on "Choose a track" with Confirm off until a track is picked', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const secondRow = chapterRow(table, chapterName(WIRE_CHAPTERS[1]));
    const select = within(secondRow).getByRole('combobox') as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe('Choose a track');
    const confirm = within(secondRow).getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    await user.selectOptions(select, WIRE_TRACKS_PROJECT.tracks[1].guid);
    expect(confirm.disabled).toBe(false);
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
    const status = within(chapterRow(table, chapterName(WIRE_CHAPTERS[1]))).getByText('Not linked');
    expect(status.closest('td')?.className).toContain('whitespace-nowrap');
    expect(status.closest('td')?.getAttribute('style') ?? '').not.toContain('color');
  });

  it('names a track another chapter holds, so it is not linked twice by mistake', async () => {
    const api = createMockApi();
    await api.chapterTrackMapConfirm(WIRE_TRACKS_PROJECT.tracks[0].guid, WIRE_CHAPTERS[0].id);
    render(
      <ApiProvider api={api}>
        <MemoryRouter>
          <ChapterLinksTable tracks={WIRE_TRACKS_PROJECT.tracks} notify={notify} />
        </MemoryRouter>
      </ApiProvider>,
    );
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const secondRow = chapterRow(table, chapterName(WIRE_CHAPTERS[1]));
    await waitFor(() =>
      expect(within(secondRow).getByRole('option', { name: new RegExp(`^${WIRE_TRACKS_PROJECT.tracks[0].name} \\(linked to `) })).toBeTruthy(),
    );
  });

  it('opens a linked chapter in Editing or Proof from the row’s More actions menu', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, chapterName(WIRE_CHAPTERS[0]));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(within(firstRow).getByText('Linked')).toBeTruthy());

    await user.click(within(firstRow).getByRole('button', { name: /^More actions for / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Open in Proof' }));

    expect(screen.getByRole('status', { name: 'Location' }).textContent).toBe(`/proof/${encodeURIComponent(WIRE_CHAPTERS[0].id)}`);
  });

  // ENX-10: the editing check opened from here covers the wide engine panel whole and offers Back, rather than a 20 rem panel cutting it.
  it('opens the editing check as wide as the engine panel, with Back to it', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, chapterName(WIRE_CHAPTERS[0]));
    await user.click(within(firstRow).getByRole('button', { name: /^More actions for / }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editing check…' }));
    const check = await screen.findByRole('dialog', { name: /^Editing check: / });
    expect(check.className).toMatch(/44rem/);
    await user.click(within(check).getByRole('button', { name: 'Back to the audio engine' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Editing check: / })).toBeNull());
  });

  it('tells the panel when a link changes, so the Tracks card re-reads it', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    renderTable(onChanged);
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, chapterName(WIRE_CHAPTERS[0]));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('confirms a link, then shows it as Linked with the track name', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, chapterName(WIRE_CHAPTERS[0]));

    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(within(firstRow).getByText('Linked')).toBeTruthy());
    expect(within(firstRow).getAllByText(WIRE_TRACKS_PROJECT.tracks[0].name).length).toBeGreaterThan(0);
  });

  it('clears a confirmed link back to Not linked', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, chapterName(WIRE_CHAPTERS[0]));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(within(firstRow).getByText('Linked')).toBeTruthy());

    await user.click(within(firstRow).getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(within(firstRow).getByText('Not linked')).toBeTruthy());
  });

  it('Change to another track leaves one link, not two', async () => {
    const user = userEvent.setup();
    const api = renderTable();
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, chapterName(WIRE_CHAPTERS[0]));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[0].guid);
    await user.click(within(firstRow).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(within(firstRow).getByText('Linked')).toBeTruthy());

    await user.click(within(firstRow).getByRole('button', { name: 'Change' }));
    await user.selectOptions(within(firstRow).getByRole('combobox'), WIRE_TRACKS_PROJECT.tracks[1].guid);
    await user.click(within(firstRow).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(within(firstRow).getAllByText(WIRE_TRACKS_PROJECT.tracks[1].name).length).toBeGreaterThan(0));
    const { mappings } = await api.chapterTrackMapList();
    expect(mappings.filter((mapping) => mapping.chapterId === WIRE_CHAPTERS[0].id).map((mapping) => mapping.trackGuid)).toEqual([
      WIRE_TRACKS_PROJECT.tracks[1].guid,
    ]);
  });

  it('Clear removes every link a chapter holds, including a double link left by an older Change', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    await api.chapterTrackMapConfirm(WIRE_TRACKS_PROJECT.tracks[0].guid, WIRE_CHAPTERS[0].id);
    await api.chapterTrackMapConfirm(WIRE_TRACKS_PROJECT.tracks[1].guid, WIRE_CHAPTERS[0].id);
    render(
      <ApiProvider api={api}>
        <MemoryRouter>
          <ChapterLinksTable tracks={WIRE_TRACKS_PROJECT.tracks} notify={notify} />
        </MemoryRouter>
      </ApiProvider>,
    );
    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, chapterName(WIRE_CHAPTERS[0]));
    await waitFor(() => expect(within(firstRow).getByText('Linked')).toBeTruthy());

    await user.click(within(firstRow).getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(within(firstRow).getByText('Not linked')).toBeTruthy());
    const { mappings } = await api.chapterTrackMapList();
    expect(mappings.filter((mapping) => mapping.chapterId === WIRE_CHAPTERS[0].id)).toHaveLength(0);
  });

  it('shows a link to a track that no longer exists as Track missing', async () => {
    const api = createMockApi();
    await api.chapterTrackMapConfirm('{NOT-A-REAL-TRACK-GUID}', WIRE_CHAPTERS[0].id);
    render(
      <ApiProvider api={api}>
        <MemoryRouter>
          <ChapterLinksTable tracks={WIRE_TRACKS_PROJECT.tracks} notify={notify} />
        </MemoryRouter>
      </ApiProvider>,
    );

    const table = await screen.findByRole('table', { name: 'Chapter links' });
    const firstRow = chapterRow(table, chapterName(WIRE_CHAPTERS[0]));
    await waitFor(() => expect(within(firstRow).getByText('Track missing')).toBeTruthy());
    expect(within(firstRow).getByText('Linked track is missing from this project')).toBeTruthy();
  });
});
