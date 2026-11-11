// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS } from '../../api/mockFixtures';
import type { NarrationApi } from '../../types';
import { ChapterTrackStateProvider } from '../chapterTracks/ChapterTrackState';
import { ChapterTrackLinkFix } from './ChapterTrackLinkFix';

afterEach(cleanup);

const chapter = { ...WIRE_CHAPTERS[2], subtitle: '' };

function show(overrides: Partial<NarrationApi> = {}) {
  const onLinked = vi.fn();
  const notify = vi.fn();
  const api = createMockApi(overrides);
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
          <ChapterTrackLinkFix chapter={chapter} notify={notify} onLinked={onLinked} />
        </ChapterTrackStateProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, onLinked, notify };
}

const picker = () => screen.findByRole('combobox', { name: /^Track for/ });
// Confirm waits for a pick, so the first real track is chosen before it is pressed.
const choose = async () => {
  const select = (await picker()) as HTMLSelectElement;
  await userEvent.selectOptions(select, select.options[1]);
};

describe('ChapterTrackLinkFix (#3413)', () => {
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
  it('keeps the picker, says the link could not be made, and links on the next press', async () => {
    let fail = true;
    const base = createMockApi();
    const chapterTrackSet = vi.fn((chapterId: string, trackGuid: string) =>
      fail ? Promise.reject(new Error('REAPER did not answer')) : base.chapterTrackSet(chapterId, trackGuid),
    );
    const { onLinked } = show({ chapterTrackSet });
    await choose();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The link could not be made: REAPER did not answer');
    expect(alert.textContent).not.toMatch(/could not be listed|Error:/);
    expect(screen.getByRole('combobox', { name: /^Track for/ })).toBeTruthy();
    fail = false;
    await userEvent.click(within(document.body).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onLinked).toHaveBeenCalledOnce());
  });
});
