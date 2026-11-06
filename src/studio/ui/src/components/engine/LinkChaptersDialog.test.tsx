// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LinkChaptersDialog } from './LinkChaptersDialog';
import { useChapterLinks } from './useChapterLinks';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_LINE_IDENTITY_LINES, WIRE_TRACKS_PROJECT } from '../../api/mockFixtures';
import type { NarrationApi, Track } from '../../types';

afterEach(cleanup);

// The dialog as the engine panel mounts it: drawn from the one chapter-links reader.
function Dialog({ onClose, tracks = WIRE_TRACKS_PROJECT.tracks }: { onClose: () => void; tracks?: Track[] }) {
  const links = useChapterLinks(tracks, 0, () => {});
  return <LinkChaptersDialog links={links} onClose={onClose} />;
}

function renderDialog(overrides: Partial<NarrationApi> = {}, initial: Parameters<typeof createMockApi>[1] = {}, onClose = vi.fn(), tracks?: Track[]) {
  const api = createMockApi(overrides, initial);
  render(
    <ApiProvider api={api}>
      <Dialog onClose={onClose} tracks={tracks} />
    </ApiProvider>,
  );
  return { api, onClose };
}

describe('LinkChaptersDialog', () => {
  it('lists every chapter with a track selector and nothing to stamp until one is chosen', async () => {
    renderDialog();

    for (const chapter of WIRE_CHAPTERS) {
      expect(await screen.findByRole('combobox', { name: `Track for ${chapter.title}` })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Stamp 0 items' })).toBeTruthy();
  });

  // #3043: a chapter linked to a folder of voices has its audio on the folder's children.
  it('counts and stamps the items of every voice inside a folder linked to a chapter', async () => {
    const user = userEvent.setup();
    const item = (guid: string) => ({ ...WIRE_TRACKS_PROJECT.tracks[0].items[0], guid });
    const track = (guid: string, name: string, depth: number, isFolder: boolean, items: string[]): Track => ({
      ...WIRE_TRACKS_PROJECT.tracks[0],
      guid,
      name,
      depth,
      isFolder,
      items: items.map(item),
    });
    const voices = [
      track('{F0000000-0000-4000-8000-0000000000F1}', 'Chapter 1', 0, true, []),
      track('{F0000000-0000-4000-8000-0000000000F2}', 'Narrator', 1, false, ['{I1}', '{I2}']),
      track('{F0000000-0000-4000-8000-0000000000F3}', 'Hero', 1, false, ['{I3}']),
      track('{F0000000-0000-4000-8000-0000000000F4}', 'Chapter 2', 0, false, ['{I4}']),
    ];
    const { api } = renderDialog({}, {}, vi.fn(), voices);
    const stamp = vi.spyOn(api, 'lineIdentityStamp');
    const chapter = WIRE_CHAPTERS[0];

    await user.selectOptions(await screen.findByRole('combobox', { name: `Track for ${chapter.title}` }), voices[0].guid);

    const stampButton = await screen.findByRole('button', { name: 'Stamp 3 items' });
    const mapping = screen.getByRole('table', { name: 'Chapter to track mapping' });
    expect(
      within(mapping)
        .getAllByRole('cell')
        .some((cell) => cell.textContent === '3'),
    ).toBe(true);
    await user.click(stampButton);
    await waitFor(() =>
      expect(stamp).toHaveBeenCalledWith(
        ['{I1}', '{I2}', '{I3}'].map((guid) => ({ itemGuid: guid, lineId: chapter.id, text: chapter.title })),
        false,
      ),
    );
  });

  it('counts and stamps an item once when an outer folder and a track inside it are both linked, for the chapter linked nearest', async () => {
    const user = userEvent.setup();
    const item = (guid: string) => ({ ...WIRE_TRACKS_PROJECT.tracks[0].items[0], guid });
    const track = (guid: string, name: string, depth: number, isFolder: boolean, items: string[]): Track => ({
      ...WIRE_TRACKS_PROJECT.tracks[0],
      guid,
      name,
      depth,
      isFolder,
      items: items.map(item),
    });
    const tracks = [
      track('{F0000000-0000-4000-8000-0000000000F1}', 'Narration', 0, true, []),
      track('{F0000000-0000-4000-8000-0000000000F2}', 'Chapter 1', 1, false, ['{I1}', '{I2}']),
      track('{F0000000-0000-4000-8000-0000000000F3}', 'Chapter 2', 1, false, ['{I3}']),
    ];
    const { api } = renderDialog({}, {}, vi.fn(), tracks);
    const stamp = vi.spyOn(api, 'lineIdentityStamp');
    const [first, second] = WIRE_CHAPTERS;

    await user.selectOptions(await screen.findByRole('combobox', { name: `Track for ${first.title}` }), tracks[1].guid);
    await user.selectOptions(await screen.findByRole('combobox', { name: `Track for ${second.title}` }), tracks[0].guid);

    // Chapter 2's folder owns what is not under Chapter 1's own track: 1 item, not 3.
    const stampButton = await screen.findByRole('button', { name: 'Stamp 3 items' });
    await user.click(stampButton);
    await waitFor(() => expect(stamp).toHaveBeenCalled());
    const rows = stamp.mock.calls[0][0];
    expect(rows.map((row) => row.itemGuid).sort()).toEqual(['{I1}', '{I2}', '{I3}']);
    expect(rows.filter((row) => row.lineId === first.id).map((row) => row.itemGuid)).toEqual(['{I1}', '{I2}']);
    expect(rows.filter((row) => row.lineId === second.id).map((row) => row.itemGuid)).toEqual(['{I3}']);
  });

  it('previews every item of a mapped track and stamps only once approved', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog();
    const stamp = vi.spyOn(api, 'lineIdentityStamp');
    const chapter = WIRE_CHAPTERS[0];
    const track = WIRE_TRACKS_PROJECT.tracks[0];

    await user.selectOptions(await screen.findByRole('combobox', { name: `Track for ${chapter.title}` }), track.guid);

    const expectedCount = track.items.length;
    const stampButton = await screen.findByRole('button', { name: `Stamp ${expectedCount} item${expectedCount === 1 ? '' : 's'}` });
    expect(stamp).not.toHaveBeenCalled();

    await user.click(stampButton);

    await waitFor(() =>
      expect(stamp).toHaveBeenCalledWith(
        track.items.map((item) => ({ itemGuid: item.guid, lineId: chapter.id, text: chapter.title })),
        false,
      ),
    );
  });

  it('shows nothing is written until approval: mapping alone sends no request', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog();
    const stamp = vi.spyOn(api, 'lineIdentityStamp');

    await user.selectOptions(await screen.findByRole('combobox', { name: `Track for ${WIRE_CHAPTERS[0].title}` }), WIRE_TRACKS_PROJECT.tracks[0].guid);

    expect(stamp).not.toHaveBeenCalled();
  });

  it('reports a stale item and a conflict after stamping', async () => {
    renderDialog({}, { lineIdentity: 'conflict' });

    expect(await screen.findByText(/Stamped 1 line, 1 stale item, 1 conflict\./)).toBeTruthy();
    expect(screen.getByText(/Stale items/)).toBeTruthy();
    expect(screen.getByText(/Already stamped with a different chapter/)).toBeTruthy();
  });

  it('shows a REAPER error state', async () => {
    renderDialog({}, { lineIdentity: 'error' });

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((alert) => alert.textContent?.includes('app’s script'))).toBe(true);
  });

  // Alignment audit ENX-22: the same error was printed under the checkbox and again under "Currently stamped".
  it('shows a failure once, beside the action that failed', async () => {
    renderDialog({}, { lineIdentity: 'error' });
    await screen.findAllByRole('alert');
    expect(screen.getAllByText(/app’s script in REAPER sent a message/)).toHaveLength(1);
    cleanup();

    const user = userEvent.setup();
    renderDialog({ lineIdentityRead: async () => Promise.reject(new Error('REAPER did not answer')) });
    await user.click(screen.getByRole('button', { name: 'Read current stamps' }));
    const stamps = screen.getByRole('region', { name: 'Currently stamped in REAPER' });
    expect(await within(stamps).findByRole('alert')).toBeTruthy();
    expect(screen.getAllByText(/REAPER did not answer/)).toHaveLength(1);
  });

  // ENX-17, ENX-18, R3EN2-9: the track picker floated mid-row and headers broke over two lines.
  it('lays both tables on fixed columns with short headers', async () => {
    const user = userEvent.setup();
    renderDialog();
    const mapping = screen.getByRole('table', { name: 'Chapter to track mapping' });
    expect(mapping.className).toContain('table-fixed');
    expect(within(mapping).getByRole('columnheader', { name: 'To stamp' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Read current stamps' }));
    const stamped = await screen.findByRole('table', { name: 'Stamped lines' });
    expect(stamped.className).toContain('table-fixed');
    expect(within(stamped).getByRole('columnheader', { name: 'Entity' })).toBeTruthy();
  });

  it("keeps both tables' column headers in view while the dialog body scrolls (alignment audit ENX-23)", async () => {
    const user = userEvent.setup();
    renderDialog();
    const mapping = screen.getByRole('table', { name: 'Chapter to track mapping' });
    expect(mapping.querySelector('thead')?.className).toContain('sticky');

    await user.click(screen.getByRole('button', { name: 'Read current stamps' }));
    const stamped = await screen.findByRole('table', { name: 'Stamped lines' });
    expect(stamped.querySelector('thead')?.className).toContain('sticky');
  });

  it('reads current stamps and shows a status for every row, including drift and removed', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Read current stamps' }));

    for (const line of WIRE_LINE_IDENTITY_LINES) {
      expect(await screen.findByText(line.itemGuid)).toBeTruthy();
    }
    expect(screen.getByText('Text changed since stamping')).toBeTruthy();
    expect(screen.getByText('Chapter no longer in the manuscript')).toBeTruthy();
  });

  it('disables Cancel and Close while a stamp is running', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog();
    await user.selectOptions(await screen.findByRole('combobox', { name: `Track for ${WIRE_CHAPTERS[0].title}` }), WIRE_TRACKS_PROJECT.tracks[0].guid);
    const trackItemCount = WIRE_TRACKS_PROJECT.tracks[0].items.length;

    void api.lineIdentityStamp(
      WIRE_TRACKS_PROJECT.tracks[0].items.map((item) => ({ itemGuid: item.guid, lineId: WIRE_CHAPTERS[0].id, text: WIRE_CHAPTERS[0].title })),
      false,
    );
    void trackItemCount;

    await waitFor(() => expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true));
  });
});
