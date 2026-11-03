// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_TRACKS_PROJECT } from '../../api/mockFixtures';
import { ChapterLinksTable } from './ChapterLinksTable';
import { useChapterLinks } from './useChapterLinks';
import type { Notify } from '../primitives/Toast';

afterEach(cleanup);

function Table({ notify }: { notify: Notify }) {
  const links = useChapterLinks(WIRE_TRACKS_PROJECT.tracks, 0, () => {});
  return <ChapterLinksTable links={links} notify={notify} />;
}

function renderTable(api: ReturnType<typeof createMockApi>) {
  const notify = vi.fn<Notify>();
  render(
    <ApiProvider api={api}>
      <MemoryRouter>
        <Table notify={notify} />
      </MemoryRouter>
    </ApiProvider>,
  );
  return notify;
}

describe("the Chapter links panel's nested-chapters repair (#2838)", () => {
  it('says which chapters sit inside which chapter folder in REAPER, and nothing when none do', async () => {
    renderTable(createMockApi({}, { nestedChapters: true }));
    expect(await screen.findByText('2 chapters nested')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move them out…' }).getAttribute('title')).toMatch(/sit inside .*’s folder/);
    expect(screen.getByRole('button', { name: 'Move them out…' })).toBeTruthy();
    cleanup();
    renderTable(createMockApi());
    await screen.findByRole('table', { name: 'Chapter links' });
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByRole('button', { name: 'Move them out…' })).toBeNull();
  });

  it('shows every track the move changes before anything is written, and Cancel writes nothing', async () => {
    const api = createMockApi({}, { nestedChapters: true });
    const repair = vi.spyOn(api, 'chapterFoldersRepair');
    renderTable(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Move them out…' }));
    const dialog = await screen.findByRole('alertdialog');
    const listed = within(dialog).getByRole('list', { name: 'Tracks that move' });
    expect(within(listed).getAllByRole('listitem')).toHaveLength(2);
    expect(listed.textContent).toContain('to the top level');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(repair).not.toHaveBeenCalled();
  });

  it('a confirmed move sends exactly the chapters the check listed, says what it did, and checks again', async () => {
    const api = createMockApi({}, { nestedChapters: true });
    const repair = vi.spyOn(api, 'chapterFoldersRepair');
    const notify = renderTable(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Move them out…' }));
    const first = (await api.chapterFoldersCheck()).expected;
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Move them out' }));
    await waitFor(() => expect(repair).toHaveBeenCalledWith(first));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^Moved 2 chapters out of .* One Undo in REAPER takes it back/), 'info'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Move them out…' })).toBeNull());
  });

  it('a project that changed since the check moves nothing, says so, and checks again', async () => {
    const api = createMockApi({}, { nestedChapters: true });
    api.chapterFoldersRepair = async () => ({
      outcome: 'stale',
      message: 'The tracks in REAPER changed since they were checked, so nothing was moved. Check again.',
      moves: [],
      expected: [],
    });
    const check = vi.spyOn(api, 'chapterFoldersCheck');
    const notify = renderTable(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Move them out…' }));
    const before = check.mock.calls.length;
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Move them out' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('changed since they were checked'), 'info'));
    await waitFor(() => expect(check.mock.calls.length).toBeGreaterThan(before));
  });

  it('a refused move (REAPER recording) is an error toast and the notice stays', async () => {
    const api = createMockApi({}, { nestedChapters: true });
    api.chapterFoldersRepair = async () => ({
      outcome: 'refused',
      reason: 'recording',
      message: 'REAPER is recording. Stop the take, then move the chapters.',
      moves: [],
      expected: [],
    });
    const notify = renderTable(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Move them out…' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Move them out' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('REAPER is recording. Stop the take, then move the chapters.', 'error'));
    expect(screen.getByRole('button', { name: 'Move them out…' })).toBeTruthy();
  });

  it('the panel checks REAPER again when the window gets focus, since folders change in REAPER', async () => {
    const api = createMockApi({}, { nestedChapters: true });
    const check = vi.spyOn(api, 'chapterFoldersCheck');
    renderTable(api);
    await screen.findByRole('button', { name: 'Move them out…' });
    const before = check.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(check.mock.calls.length).toBe(before + 1);
  });
});
