// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi, ChapterTrackLink, ChapterTrackSummary } from '../../types';
import { withoutCredits } from '../../chapterKinds';
import { ChapterTrackStateProvider } from '../chapterTracks/ChapterTrackState';
import { ChapterTrackPanel } from './ChapterTrackPanel';

// Confirms the first chapter to the first track (mirroring wireContracts.test.ts's own chapterTrackSet fixtures),
// so the panel has a definite trackGuid to play and select, whatever the default demo's own link mix is.
async function confirmedFixture(api: NarrationApi): Promise<{ link: ChapterTrackLink; track: ChapterTrackSummary }> {
  const [chapter] = withoutCredits(await api.manuscriptChapters());
  const project = await api.tracksList();
  const [track] = project.tracks;
  await api.chapterTrackSet(chapter.id, track.guid);
  const links = await api.chapterTrackLinks();
  const link = links.chapters.find((candidate) => candidate.chapterId === chapter.id);
  if (!link || !link.track) throw new Error('chapterTrackSet did not produce a confirmed link');
  const summary = links.tracks.find((candidate) => candidate.guid === link.track!.trackGuid);
  if (!summary) throw new Error('the linked track is missing from the mock tracks list');
  return { link, track: summary };
}

function renderPanel(
  api: NarrationApi,
  link: ChapterTrackLink,
  track: ChapterTrackSummary,
  onChanged: () => Promise<void> = vi.fn().mockResolvedValue(undefined),
) {
  const notify = vi.fn();
  render(
    <ApiProvider api={api}>
      <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={notify}>
        <ChapterTrackPanel
          open
          chapterId={link.chapterId}
          chapterTitle={link.chapterTitle}
          link={link}
          trackSummary={track}
          savedAt="2026-09-24T10:00:00Z"
          notify={notify}
          onClose={vi.fn()}
          onChanged={onChanged}
          onRemoveFromRecording={vi.fn().mockResolvedValue(undefined)}
        />
      </ChapterTrackStateProvider>
    </ApiProvider>,
  );
  return { notify };
}

describe('ChapterTrackPanel playback and Select in REAPER', () => {
  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('shows playback controls once the linked track resolves in the tracks list, and toggles Play to Pause', async () => {
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    renderPanel(api, link, track);

    const playButton = await screen.findByRole('button', { name: 'Play' });
    await userEvent.click(playButton);
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('sends Show in REAPER with the linked track and shows a toast on success', async () => {
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    const { notify } = renderPanel(api, link, track);

    const button = await screen.findByRole('button', { name: 'Show in REAPER' });
    await userEvent.click(button);

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Selected in REAPER.'));
  });

  it("shows REAPER's own refusal message as an error toast, and changes nothing", async () => {
    const linkedApi = createMockApi();
    const { link, track } = await confirmedFixture(linkedApi);
    const standaloneApi = createMockApi({}, { reaperState: 'unavailable' });
    const { notify } = renderPanel(standaloneApi, link, track);

    const button = await screen.findByRole('button', { name: 'Show in REAPER' });
    await userEvent.click(button);

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'REAPER is not connected to this app. To select a track in REAPER, open REAPER; the app connects to it by itself.',
        'error',
      ),
    );
  });
});

describe('ChapterTrackPanel states (alignment audit)', () => {
  it('a missing track offers no playback or Select in REAPER and labels its figures as last known (R3PR1-1)', async () => {
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    renderPanel(api, { ...link, warnings: [...link.warnings, 'confirmed-track-missing'] }, track);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show in REAPER' })).toBeNull();
    expect(screen.getByRole('heading', { name: /^Last known, as of save/ })).toBeTruthy();
  });

  it('a suggested, not confirmed track offers no Show in REAPER, like the row menu (#3168)', async () => {
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    renderPanel(api, { ...link, status: 'matched' }, track);
    await screen.findByText(/Not linked yet/);
    expect((await screen.findByRole('button', { name: /Show in REAPER/ })).getAttribute('aria-disabled')).toBe('true');
  });

  it('offers no Unlink for a track that is only suggested, and Unlink for a confirmed one (#3231)', async () => {
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    renderPanel(api, { ...link, status: 'matched' }, track);
    await screen.findByText(/Not linked yet/);
    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull();
    // The picker opens on the suggestion, so one Confirm links it.
    expect((screen.getByRole('combobox', { name: /^Track for/ }) as HTMLSelectElement).value).toBe(link.track!.trackGuid);
    cleanup();
    renderPanel(api, link, track);
    expect(await screen.findByRole('button', { name: 'Unlink' })).toBeTruthy();
  });

  it('says which chapter lost the track when linking takes it from another chapter (#3053)', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    vi.spyOn(api, 'chapterTrackSet').mockResolvedValue({
      documentId: 'doc',
      link: { trackGuid: track.guid, chapterId: link.chapterId, chapterTitle: link.chapterTitle, confirmedAt: '2026-01-01T00:00:00Z' },
      displaced: { chapterId: 'other', chapterTitle: 'Chapter 9', trackGuid: track.guid, confirmedAt: '2026-01-01T00:00:00Z' },
      mappings: [],
    });
    const { notify } = renderPanel(api, { ...link, status: 'matched' }, track);
    await screen.findByText(/Not linked yet/);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Linked. This track was linked to Chapter 9, which is now unlinked.'));
  });

  // #3272: the re-read of ChapterTrackLinks parses the whole saved project; the panel must not wait for it to show the chapter unlinked.
  it('shows the chapter unlinked as soon as Unlink answers, before the links are read again', async () => {
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    const reread = vi.fn(() => new Promise<void>(() => {}));
    renderPanel(api, link, track, reread);

    await userEvent.click(await screen.findByRole('button', { name: 'Unlink' }));

    expect(await screen.findByRole('button', { name: 'Confirm' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull();
    expect(reread).toHaveBeenCalledTimes(1);
    expect((await api.chapterTrackLinks()).chapters.find((c) => c.chapterId === link.chapterId)?.links).toEqual([]);
  });

  // Link has no optimistic state (the linked facts come from the re-read), so its order is fixed: the host writes, the toast says so, then the links are read again once.
  it('links in order: the host call, the toast, then one re-read of the links', async () => {
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    const order: string[] = [];
    const spied = {
      ...api,
      chapterTrackSet: async (chapterId: string, trackGuid: string) => {
        order.push('set');
        return api.chapterTrackSet(chapterId, trackGuid);
      },
    } as NarrationApi;
    const reread = vi.fn(async () => {
      order.push('reread');
    });
    const { notify } = renderPanel(spied, { ...link, status: 'matched' }, track, reread);
    notify.mockImplementation(() => order.push('toast'));

    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(order).toEqual(['set', 'toast', 'reread']));
    expect(reread).toHaveBeenCalledTimes(1);
  });

  it('keeps a link that Unlink failed to clear', async () => {
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    const failing = { ...api, chapterTrackUnlink: () => Promise.reject(new Error('the project is read only')) } as NarrationApi;
    const { notify } = renderPanel(failing, link, track);

    await userEvent.click(await screen.findByRole('button', { name: 'Unlink' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('read only'), 'error'));
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeTruthy();
  });

  it('names a plain phrase when the chapter that lost the track has no stored title (#3053)', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    vi.spyOn(api, 'chapterTrackSet').mockResolvedValue({
      documentId: 'doc',
      link: { trackGuid: track.guid, chapterId: link.chapterId, chapterTitle: link.chapterTitle, confirmedAt: '2026-01-01T00:00:00Z' },
      displaced: { chapterId: 'gone', chapterTitle: '', trackGuid: track.guid, confirmedAt: '2026-01-01T00:00:00Z' },
      mappings: [],
    });
    const { notify } = renderPanel(api, { ...link, status: 'matched' }, track);
    await screen.findByText(/Not linked yet/);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Linked. This track was linked to a chapter no longer in the manuscript, which is now unlinked.'));
  });

  it('two links to choose between offer the Keep this one rows and no second Link picker (R3PR1-6)', async () => {
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    const second = { ...link.links[0], trackGuid: `${link.links[0].trackGuid}-2` };
    renderPanel(api, { ...link, status: 'ambiguous', links: [link.links[0], second] }, track);
    expect(await screen.findAllByRole('button', { name: 'Keep this one' })).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Link' })).toBeNull();
  });
});
