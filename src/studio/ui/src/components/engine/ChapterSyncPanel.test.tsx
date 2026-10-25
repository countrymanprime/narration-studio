// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChapterSyncPreview } from '../../api/contracts/chapterSync';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { ChapterSyncPanel } from './ChapterSyncPanel';

afterEach(cleanup);

// The default fixture's tracks (Chapter 1, Chapter 2, Click Track) never land in Needs you, so the Needs-you tests
// below override chapterSyncPreview directly to construct the ambiguous case the mockup depicts (chapterTrackSet is
// stubbed too, since 'g5a' names no real track in the fixture's tracks list).
const needsYouPreview = (): ChapterSyncPreview => ({
  project: 'ready',
  message: '',
  projectFile: 'Alice.rpp',
  savedAt: '2026-09-24T09:00:00Z',
  kept: [],
  autoLink: [],
  needsYou: [
    {
      chapterId: 'c5',
      chapterTitle: 'Chapter 5',
      reason: 'ambiguous',
      best: null,
      candidates: [
        { trackGuid: 'g5a', trackName: 'Chapter 5 part 1', trackIndex: 0, score: 1, source: 'track-name', region: null },
        { trackGuid: 'g5b', trackName: 'Chapter 5 part 2', trackIndex: 1, score: 1, source: 'track-name', region: null },
      ],
    },
  ],
  noTrack: [],
  unmatched: [],
  pickupTracks: [],
  new: [],
  changed: [],
  renamed: [],
  missing: [],
});

describe('ChapterSyncPanel', () => {
  it('renders nothing before consent is decided', async () => {
    const api = createMockApi({}, { chapterSync: 'ask' });
    const { container } = render(<ApiProvider api={api}>{<ChapterSyncPanel daw={{ daw: 'REAPER' }} notify={() => {}} onChanged={() => {}} />}</ApiProvider>);
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('offers Turn on when sync is off, and calls chapterSyncSetEnabled(true)', async () => {
    const api = createMockApi({}, { chapterSync: 'off' });
    const onChanged = vi.fn();
    render(<ApiProvider api={api}>{<ChapterSyncPanel daw={{ daw: 'REAPER' }} notify={() => {}} onChanged={onChanged} />}</ApiProvider>);
    await screen.findByText('Chapter sync is off.');
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await screen.findByText('Last synced');
  });

  it('shows the on summary and calls Turn off', async () => {
    const api = createMockApi({}, {});
    const onChanged = vi.fn();
    render(<ApiProvider api={api}>{<ChapterSyncPanel daw={{ daw: 'REAPER' }} notify={() => {}} onChanged={onChanged} />}</ApiProvider>);
    await screen.findByText('Last synced');
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await screen.findByText('Chapter sync is off.');
  });

  it('shows a Needs-you list with the reason and a preselected candidate, and Link calls chapterTrackSet', async () => {
    const chapterTrackSet = vi.fn().mockResolvedValue({ documentId: 'doc', link: {}, displaced: null, mappings: [] });
    const api = createMockApi({ chapterSyncPreview: async () => needsYouPreview(), chapterTrackSet }, {});
    const notify = vi.fn();
    render(<ApiProvider api={api}>{<ChapterSyncPanel daw={{ daw: 'REAPER' }} notify={notify} onChanged={() => {}} />}</ApiProvider>);
    await screen.findByText('Needs you (1)');
    // The panel's own wording, not the consent dialog's.
    expect(screen.getByText('Two tracks match: “Chapter 5 part 1” and “Chapter 5 part 2”. A chapter is checked from one track.')).toBeTruthy();
    const select = screen.getByLabelText('Track for Chapter 5') as HTMLSelectElement;
    expect(select.value).toBe('g5a');
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(chapterTrackSet).toHaveBeenCalledWith('c5', 'g5a'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Track linked.'));
  });

  it('names the saved file and splits automatic links from the narrator’s in the summary', async () => {
    render(
      <ApiProvider api={createMockApi({}, { chapterSync: 'activity' })}>
        {<ChapterSyncPanel daw={{ daw: 'REAPER' }} notify={() => {}} onChanged={() => {}} />}
      </ApiProvider>,
    );
    await screen.findByText(/^.+, from the saved Alice\.rpp$/);
    expect(screen.getByText('1 chapter linked automatically, 1 by you')).toBeTruthy();
  });

  it('does not list the Sync activity: that log is in Settings', async () => {
    render(
      <ApiProvider api={createMockApi({}, { chapterSync: 'activity' })}>
        {<ChapterSyncPanel daw={{ daw: 'REAPER' }} notify={() => {}} onChanged={() => {}} />}
      </ApiProvider>,
    );
    await screen.findByText('Last synced');
    expect(screen.queryByText('Sync activity')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Undo:/ })).toBeNull();
  });

  it('counts the tracks that are not chapters and says when REAPER holds unsaved changes', async () => {
    const preview = { ...needsYouPreview(), needsYou: [], unmatched: [{ guid: 'g1', name: 'Room tone', index: 5, marker: '' as const }] };
    render(
      <ApiProvider api={createMockApi({ chapterSyncPreview: async () => preview }, { chapterSync: 'unsaved' })}>
        {<ChapterSyncPanel daw={{ daw: 'REAPER' }} notify={() => {}} onChanged={() => {}} />}
      </ApiProvider>,
    );
    await screen.findByText('Not chapters (1)');
    expect(screen.getByText('Room tone')).toBeTruthy();
    expect(screen.getByText(/REAPER has changes that aren’t saved yet/)).toBeTruthy();
  });

  // Only REAPER's heartbeat sets unsavedEdits, but the line names REAPER, so an Audacity project's card never shows it.
  it('never says REAPER has unsaved changes for an Audacity project', async () => {
    render(
      <ApiProvider api={createMockApi({}, { chapterSync: 'unsaved' })}>
        {<ChapterSyncPanel daw={{ daw: 'Audacity', linkedFile: 'Book One.aup3' }} notify={() => {}} onChanged={() => {}} />}
      </ApiProvider>,
    );
    await screen.findByText('Last synced');
    expect(screen.queryByText(/REAPER|\.rpp/)).toBeNull();
  });

  // The card header is the row that holds the card's heading.
  const inHeader = (button: HTMLElement) => Boolean(button.parentElement?.parentElement?.querySelector('h2'));

  // Alignment audit ENX-8 and R3EN2-3: the toggle moved between the header and the body, and the status was one grey run-on line.
  it('keeps the toggle in the header and shows each fact as a labelled row', async () => {
    render(
      <ApiProvider api={createMockApi({}, { chapterSync: 'activity' })}>
        {<ChapterSyncPanel daw={{ daw: 'REAPER' }} notify={() => {}} onChanged={() => {}} />}
      </ApiProvider>,
    );
    const card = await screen.findByRole('region', { name: 'Chapter sync' });
    await within(card).findByText('Last synced');
    expect(inHeader(within(card).getByRole('button', { name: 'Turn off' }))).toBe(true);
    expect(
      within(card)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(expect.arrayContaining(['Status', 'Last synced', 'Links']));
    expect(within(card).queryByText(/ · /)).toBeNull();
  });

  it('keeps Turn on in the header while sync is off', async () => {
    render(
      <ApiProvider api={createMockApi({}, { chapterSync: 'off' })}>
        {<ChapterSyncPanel daw={{ daw: 'REAPER' }} notify={() => {}} onChanged={() => {}} />}
      </ApiProvider>,
    );
    const card = await screen.findByRole('region', { name: 'Chapter sync' });
    await within(card).findByText('Chapter sync is off.');
    expect(inHeader(within(card).getByRole('button', { name: 'Turn on' }))).toBe(true);
  });

  it('says why background checks wait, when they are on and something is blocking them', async () => {
    const base = await createMockApi({}, {}).chapterSyncState();
    const api = createMockApi(
      {
        chapterSyncState: async () => ({ ...base, background: { enabled: true, wait: 'recording', queued: 0, firstPassModel: 'tiny', recheckModel: 'small' } }),
      },
      {},
    );
    render(<ApiProvider api={api}>{<ChapterSyncPanel daw={{ daw: 'REAPER' }} notify={() => {}} onChanged={() => {}} />}</ApiProvider>);
    await screen.findByText(/REAPER is recording/);
  });

  it('says nothing about background checks when there is nothing to wait on', async () => {
    render(<ApiProvider api={createMockApi({}, {})}>{<ChapterSyncPanel daw={{ daw: 'REAPER' }} notify={() => {}} onChanged={() => {}} />}</ApiProvider>);
    await screen.findByText('Last synced');
    expect(screen.queryByText(/Background checks/)).toBeNull();
  });
});
