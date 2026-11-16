// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { ChapterTrackStateProvider } from './ChapterTrackState';
import { SAVED_PROJECT, SavedProjectChip } from './SavedProjectChip';

afterEach(cleanup);

// #3394 (owner, 2026-11-16): a page whose chapter audio comes from the saved file and not from REAPER says so, in one wording, on every page.
const answer = (source: 'live' | 'saved') => async () => ({
  ...(await createMockApi().tracksLive()),
  source,
  reason: source === 'saved' ? ('not_running' as const) : ('' as const),
  message: source === 'saved' ? 'REAPER is not answering, so these are the tracks as of the last save.' : '',
});

function mount(tracksLive: () => ReturnType<ReturnType<typeof answer>>, enabled = true) {
  render(
    <ApiProvider api={createMockApi({ tracksLive })}>
      <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled={enabled} notify={vi.fn()}>
        <SavedProjectChip />
      </ChapterTrackStateProvider>
    </ApiProvider>,
  );
}

describe('SavedProjectChip', () => {
  it('says "Saved project" when the tracks are the saved file’s, with the host’s sentence as its hint', async () => {
    const user = userEvent.setup();
    mount(answer('saved'));
    const chip = await screen.findByRole('group', { name: SAVED_PROJECT });
    expect(chip.textContent).toBe('Saved project');
    await user.hover(chip);
    expect((await screen.findByRole('tooltip')).textContent).toContain('REAPER is not answering, so these are the tracks as of the last save.');
  });

  it('draws nothing for REAPER’s own tracks', async () => {
    mount(answer('live'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('group', { name: SAVED_PROJECT })).toBeNull();
  });

  it('draws nothing before the first read, or when no screen reads tracks', async () => {
    mount(() => new Promise<never>(() => {}));
    expect(screen.queryByRole('group', { name: SAVED_PROJECT })).toBeNull();
    cleanup();
    mount(answer('saved'), false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('group', { name: SAVED_PROJECT })).toBeNull();
  });

  it('goes away when a later read answers from REAPER', async () => {
    let source: 'live' | 'saved' = 'saved';
    mount(() => answer(source)());
    await screen.findByRole('group', { name: SAVED_PROJECT });
    source = 'live';
    // The shared state reads again on a window focus.
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(screen.queryByRole('group', { name: SAVED_PROJECT })).toBeNull());
  });
});

// The three pages that show a chapter's audio each mount the chip, so none reads the saved file's tracks as current (#3394). A page that dropped it fails here.
describe('the pages that show a chapter’s tracks', () => {
  it.each(['proof/ProofChapterPage.tsx', 'editing/page/EditingBody.tsx', 'pickups/PickupsPage.tsx'])('%s draws the Saved project chip', (file) => {
    expect(readFileSync(join(__dirname, '..', file), 'utf8')).toContain('<SavedProjectChip />');
  });
});
