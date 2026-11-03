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

  it('a confirmation the check stops finding a nesting for closes, and never opens again by itself (qa-breaker B2)', async () => {
    const api = createMockApi({}, { nestedChapters: true });
    const nested = await api.chapterFoldersCheck();
    let answer: typeof nested = nested;
    api.chapterFoldersCheck = async () => answer;
    renderTable(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Move them out…' }));
    await screen.findByRole('alertdialog');
    answer = { outcome: 'refused', reason: 'recording', message: 'REAPER is recording. Stop the take, then move the chapters.', moves: [], expected: [] };
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    answer = nested;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await screen.findByRole('button', { name: 'Move them out…' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('the confirmation keeps the list it opened with and sends exactly that list, whatever a newer check finds (qa-breaker B3)', async () => {
    const api = createMockApi({}, { nestedChapters: true });
    const nested = await api.chapterFoldersCheck();
    let answer: typeof nested = nested;
    api.chapterFoldersCheck = async () => answer;
    const repair = vi.spyOn(api, 'chapterFoldersRepair');
    renderTable(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Move them out…' }));
    const dialog = await screen.findByRole('alertdialog');
    const before = within(dialog).getByRole('list', { name: 'Tracks that move' }).textContent;
    answer = { ...nested, moves: nested.moves.slice(0, 1), expected: nested.expected.slice(0, 1) };
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(within(screen.getByRole('alertdialog')).getByRole('list', { name: 'Tracks that move' }).textContent).toBe(before);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Move them out' }));
    await waitFor(() => expect(repair).toHaveBeenCalledWith(nested.expected));
  });

  it('a refused or failed check says the folders were not checked, with why, and Check again asks again', async () => {
    const api = createMockApi({}, { nestedChapters: true });
    let calls = 0;
    api.chapterFoldersCheck = async () => {
      calls += 1;
      throw new Error('The host did not answer.');
    };
    renderTable(api);
    expect(await screen.findByText('Folders not checked')).toBeTruthy();
    expect(screen.getByText(/The host did not answer/)).toBeTruthy();
    const before = calls;
    await userEvent.click(screen.getByRole('button', { name: 'Check the folders again' }));
    expect(calls).toBe(before + 1);
  });

  it('a very long track name is shortened in the title and the summary, so the dialog stays usable (qa-breaker B4)', async () => {
    const api = createMockApi({}, { nestedChapters: true });
    const nested = await api.chapterFoldersCheck();
    const long = 'L'.repeat(10_000);
    api.chapterFoldersCheck = async () => ({ ...nested, moves: nested.moves.map((move) => ({ ...move, fromName: long, trackName: long })) });
    renderTable(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Move them out…' }));
    const dialog = await screen.findByRole('alertdialog');
    const title = within(dialog).getByRole('heading');
    expect(title.textContent!.length).toBeLessThan(200);
  });

  it('a repair that moved nothing does not claim a move or an undo', async () => {
    const api = createMockApi({}, { nestedChapters: true });
    api.chapterFoldersRepair = async () => ({ outcome: 'repaired', moves: [], expected: [] });
    const notify = renderTable(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Move them out…' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Move them out' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('No chapter needed moving.', 'info'));
  });
});
