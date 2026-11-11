// @vitest-environment jsdom
import { ChapterTrackStateProvider } from '../chapterTracks/ChapterTrackState';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterLinksTable } from './ChapterLinksTable';
import { useChapterLinks } from './useChapterLinks';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { Track } from '../../types';

afterEach(cleanup);

// #3274: what the check will do is said before it is pressed, and a pick that can no longer be linked is not a pick.
const track = (guid: string, name: string, extra: Partial<Track> = {}): Track =>
  ({ guid, index: 0, name, color: '', muted: false, soloed: false, depth: 0, isFolder: false, items: [{ guid: `${guid}-i` }], ...extra }) as unknown as Track;

const notify = vi.fn();

function Table({ tracks }: { tracks: Track[] }) {
  const links = useChapterLinks(tracks, 0, () => {});
  return <ChapterLinksTable links={links} notify={notify} />;
}

const renderTable = (tracks: Track[], api = createMockApi()) => {
  const view = (list: Track[]) => (
    <ApiProvider api={api}>
      <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
        <MemoryRouter initialEntries={['/production']}>
          <Table tracks={list} />
        </MemoryRouter>
      </ChapterTrackStateProvider>
    </ApiProvider>
  );
  const rendered = render(view(tracks));
  return { again: (list: Track[]) => rendered.rerender(view(list)) };
};

async function openingRow() {
  const table = await screen.findByRole('table', { name: 'Chapter links' });
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByRole('cell', { name: 'Opening credits' }));
  if (!row) throw new Error('no Opening credits row');
  return row;
}

describe('the check on a Chapter links row, before it is pressed', () => {
  it('says a folder holds its tracks, in the one wording the picker uses', async () => {
    const user = userEvent.setup();
    renderTable([track('f', 'Narration', { isFolder: true }), track('a', 'Ch 1', { depth: 1 }), track('b', 'Ch 2', { depth: 1 })]);
    const row = await openingRow();
    // A project with folders picks from the tree; the closed box says what its pick is in its tooltip.
    await user.click(within(row).getByRole('button', { name: /^Track for Opening credits/ }));
    await user.click(await screen.findByRole('treeitem', { name: /Narration/ }));
    const trigger = within(row).getByRole('button', { name: /^Track for Opening credits/ });
    expect(trigger.getAttribute('title')).toBe('Narration (folder, 2 tracks)');
    await user.hover(within(row).getByRole('button', { name: /^Use this track for/ }));
    expect((await screen.findByRole('tooltip')).textContent).toBe('links “Narration” (a folder of 2 tracks)');
  });

  it('drops a pick whose track became a folder with no audio of its own, so the check is off', async () => {
    const user = userEvent.setup();
    const view = renderTable([track('a', 'Ch 1'), track('b', 'Ch 2')]);
    const row = await openingRow();
    await user.selectOptions(within(row).getByRole('combobox'), 'a');
    expect(
      within(row)
        .getByRole('button', { name: /^Use this track for/ })
        .getAttribute('aria-disabled'),
    ).toBeNull();
    // The DAW answers again: that track is now a folder holding the other one.
    view.again([track('a', 'Ch 1', { isFolder: true, items: [] }), track('b', 'Ch 2', { depth: 1 })]);
    const check = within(await openingRow()).getByRole('button', { name: /^Use this track for/ });
    expect(check.getAttribute('aria-disabled')).toBe('true');
  });

  it('names the track a missing link pointed at as missing, not as an unnamed track', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    await api.chapterTrackSet('credits-opening', 'gone');
    renderTable([track('a', 'Ch 1'), track('b', 'Ch 2')], api);
    const row = await openingRow();
    await user.click(await within(row).findByRole('button', { name: /^Change the track for/ }));
    await user.selectOptions(within(row).getByRole('combobox'), 'a');
    await user.hover(within(row).getByRole('button', { name: /^Use this track for/ }));
    expect((await screen.findByRole('tooltip')).textContent).toBe('links “Ch 1” (a single track), instead of the missing track');
  });
});
