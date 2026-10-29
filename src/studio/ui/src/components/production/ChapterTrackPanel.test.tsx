// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi, ChapterTrackLink, ChapterTrackSummary } from '../../types';
import { withoutCredits } from '../../chapterKinds';
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

function renderPanel(api: NarrationApi, link: ChapterTrackLink, track: ChapterTrackSummary) {
  const notify = vi.fn();
  render(
    <ApiProvider api={api}>
      <ChapterTrackPanel
        open
        chapterId={link.chapterId}
        chapterTitle={link.chapterTitle}
        link={link}
        trackSummary={track}
        savedAt="2026-09-24T10:00:00Z"
        notify={notify}
        onClose={vi.fn()}
        onChanged={vi.fn().mockResolvedValue(undefined)}
        onRemoveFromRecording={vi.fn().mockResolvedValue(undefined)}
      />
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

  it('sends Select in REAPER with the linked track and shows a toast on success', async () => {
    const api = createMockApi();
    const { link, track } = await confirmedFixture(api);
    const { notify } = renderPanel(api, link, track);

    const button = await screen.findByRole('button', { name: 'Select in REAPER' });
    await userEvent.click(button);

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Selected in REAPER.'));
  });

  it("shows REAPER's own refusal message as an error toast, and changes nothing", async () => {
    const linkedApi = createMockApi();
    const { link, track } = await confirmedFixture(linkedApi);
    const standaloneApi = createMockApi({}, { reaperState: 'unavailable' });
    const { notify } = renderPanel(standaloneApi, link, track);

    const button = await screen.findByRole('button', { name: 'Select in REAPER' });
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
    expect(screen.queryByRole('button', { name: 'Select in REAPER' })).toBeNull();
    expect(screen.getByRole('heading', { name: /^Last known, as of save/ })).toBeTruthy();
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
