// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS } from '../../api/mockFixtures';
import { headingName } from '../../chapterHeading';
import type { NarrationApi } from '../../types';
import { ChapterTrackStateProvider } from '../chapterTracks/ChapterTrackState';
import { EnginePanelProvider } from '../engine/EnginePanelContext';
import { ChapterTrackLinkFix } from './ChapterTrackLinkFix';

afterEach(cleanup);

const chapter = { ...WIRE_CHAPTERS[2], subtitle: '' };

function show(overrides: Partial<NarrationApi> = {}, around: { onNavigate?: () => void; openEngine?: () => void } = {}) {
  const onLinked = vi.fn();
  const notify = vi.fn();
  const api = createMockApi(overrides);
  const body = (
    <MemoryRouter>
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <ChapterTrackLinkFix chapter={chapter} notify={notify} onLinked={onLinked} onNavigate={around.onNavigate} />
        </ChapterTrackStateProvider>
      </ApiProvider>
    </MemoryRouter>
  );
  render(around.openEngine ? <EnginePanelProvider value={around.openEngine}>{body}</EnginePanelProvider> : body);
  return { api, onLinked, notify };
}

const picker = () => screen.findByRole('combobox', { name: /^Track for/ });
// Confirm waits for a pick, so the first real track is chosen before it is pressed.
const choose = async () => {
  const select = (await picker()) as HTMLSelectElement;
  await userEvent.selectOptions(select, select.options[1]);
};

describe('ChapterTrackLinkFix (#3413)', () => {
  // #3416 item 61: the list-error branch was not reachable in the mock (`mockLiveTracks=saved|failing` still sets the project), so no test drove it.
  it('says the tracks could not be listed and its pointer closes what it sits in as it opens the engine panel', async () => {
    const onNavigate = vi.fn();
    const openEngine = vi.fn();
    show({ tracksLive: () => Promise.reject(new Error('REAPER did not answer')) }, { onNavigate, openEngine });
    expect(await screen.findByText(/The REAPER tracks could not be listed: .*REAPER did not answer/)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: /^Track for/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open the audio engine panel' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(openEngine).toHaveBeenCalledTimes(1);
  });

  it('offers the tracks, and links the chosen one', async () => {
    const { onLinked } = show();
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onLinked).toHaveBeenCalledOnce());
  });

  // The qa-breaker on #3417: a failed links read left the prompt on "Reading the REAPER tracks…" for good.
  it('shows the tracks, without the "linked to" notes, when only the links read fails', async () => {
    show({ chapterTrackMapList: () => Promise.reject(new Error('the host is busy')) });
    expect(await picker()).toBeTruthy();
    expect(screen.queryByText(/Reading the REAPER tracks/)).toBeNull();
  });

  // The qa-breaker on #3417: a rejected link was worded as a track-list failure and took the picker away.
  it('keeps the picker, toasts that the link could not be made, and links on the next press', async () => {
    let fail = true;
    const base = createMockApi();
    const chapterTrackSet = vi.fn((chapterId: string, trackGuid: string) =>
      fail ? Promise.reject(new Error('REAPER did not answer')) : base.chapterTrackSet(chapterId, trackGuid),
    );
    const { onLinked, notify } = show({ chapterTrackSet });
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('The link could not be made: REAPER did not answer', 'error'));
    expect(screen.queryByText(/could not be listed/)).toBeNull();
    expect(screen.getByRole('combobox', { name: /^Track for/ })).toBeTruthy();
    fail = false;
    await userEvent.click(within(document.body).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onLinked).toHaveBeenCalledOnce());
  });

  // The qa-breaker on #3417 (B3): the prompt sits in an overlay dialog that outlives the project's provider.
  it('says the project is no longer open when the state it reads is gone, not reading for good', async () => {
    const api = createMockApi();
    const { rerender } = render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
            <ChapterTrackLinkFix chapter={chapter} notify={() => {}} onLinked={() => {}} />
          </ChapterTrackStateProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    await picker();
    // The dialog is drawn by the overlay host, outside the provider; the provider goes with the project.
    rerender(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ChapterTrackLinkFix chapter={chapter} notify={() => {}} onLinked={() => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/no longer open/)).toBeTruthy();
    expect(screen.queryByText(/Reading the REAPER tracks/)).toBeNull();
  });

  it('says the project is no longer open when another project is opened under the prompt', async () => {
    const api = createMockApi();
    const tree = (folder: string) => (
      <MemoryRouter>
        <ApiProvider api={api}>
          <ChapterTrackStateProvider projectFolder={folder} enabled notify={() => {}}>
            <ChapterTrackLinkFix chapter={chapter} notify={() => {}} onLinked={() => {}} />
          </ChapterTrackStateProvider>
        </ApiProvider>
      </MemoryRouter>
    );
    const { rerender } = render(tree('C:/Projects/Alice'));
    await picker();
    rerender(tree('C:/Projects/Other'));
    expect(await screen.findByText(/no longer open/)).toBeTruthy();
  });

  // #3398 answer 3: the label and the sentence name the holder by the same current heading, whatever title the host kept.
  it('names the holder by the manuscript’s current heading in the option and in the sentence alike', async () => {
    const holder = WIRE_CHAPTERS[0];
    const track = (await createMockApi().tracksList()).tracks[0];
    const heldByListed = {
      trackGuid: track.guid,
      chapterId: holder.id,
      chapterTitle: 'Kept long ago',
      confirmedAt: '',
      origin: 'manual' as const,
      match: null,
    };
    const chapterTrackSet = vi.fn(async (chapterId: string, trackGuid: string) => ({
      documentId: 'd',
      link: { ...heldByListed, chapterId, trackGuid },
      displaced: heldByListed,
      mappings: [],
    }));
    const { notify } = show({ chapterTrackMapList: async () => ({ documentId: 'd', mappings: [heldByListed] }), chapterTrackSet } as Partial<NarrationApi>);
    const select = (await picker()) as HTMLSelectElement;
    const heading = headingName(holder);
    await waitFor(() => expect(Array.from(select.options).some((option) => option.textContent?.includes(`(linked to ${heading})`))).toBe(true));
    await userEvent.selectOptions(select, track.guid);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(`Track linked. ${heading} was linked to that track and is now not linked.`));
  });
});
