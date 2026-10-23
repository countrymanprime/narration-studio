// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_TRACKS_PROJECT } from '../../api/mockFixtures';
import { SyncActivityLog } from './SyncActivityLog';

afterEach(cleanup);

describe('SyncActivityLog', () => {
  it('lists the Sync activity, newest first, with Undo on a link sync made that still stands', async () => {
    const api = createMockApi({}, { chapterSync: 'activity' });
    const undo = vi.spyOn(api, 'chapterSyncUndo');
    const notify = vi.fn();
    render(
      <ApiProvider api={api}>
        <SyncActivityLog notify={notify} />
      </ApiProvider>,
    );
    const lines = within(await screen.findByRole('list', { name: 'Sync activity' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/Linked “Chapter 1” to .+Undo$/);
    expect(lines[1]).toMatch(/New track “Room tone”, not a chapter$/);
    expect(lines[2]).toMatch(/First sync: 1 chapter linked$/);
    fireEvent.click(screen.getByRole('button', { name: /^Undo: Linked “Chapter 1”/ }));
    await waitFor(() => expect(undo).toHaveBeenCalledWith(WIRE_TRACKS_PROJECT.tracks[0].guid));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Link undone. Sync will not make it again.'));
    // The link is gone, so its line no longer offers Undo.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Undo:/ })).toBeNull());
  });

  it('says so when no sync has run', async () => {
    const base = await createMockApi({}, {}).chapterSyncState();
    const api = createMockApi({ chapterSyncState: async () => ({ ...base, activity: [] }) }, {});
    render(
      <ApiProvider api={api}>
        <SyncActivityLog notify={() => {}} />
      </ApiProvider>,
    );
    await screen.findByText('No sync has run in this project yet.');
    expect(screen.queryByRole('list', { name: 'Sync activity' })).toBeNull();
  });

  it('reports a failed Undo as an error toast', async () => {
    const api = createMockApi({ chapterSyncUndo: async () => Promise.reject(new Error('host said no')) }, { chapterSync: 'activity' });
    const notify = vi.fn();
    render(
      <ApiProvider api={api}>
        <SyncActivityLog notify={notify} />
      </ApiProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Undo:/ }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('host said no'), 'error'));
  });
});
