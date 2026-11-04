// @vitest-environment jsdom
// One resume point (#2601): a partly recorded chapter opens the Booth and offers the Companion at the same word, both from the host's
// `recordedThrough`; the Companion asks the recording itself (`teleprompterLocate`) only when the narrator presses Change.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import { ApiProvider } from '../../../api/ApiContext';
import type { ManuscriptChapter, RecordedThrough } from '../../../api/contracts/manuscript';
import { CommandRouter } from '../../../input/router';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi } from '../../../types';
import { BoothNextPage } from '../page/BoothNextPage';
import { BoothHost, CHAPTERS, dawFor, newJournal, pageApi } from '../page/testPage';
import { forgetAppTake } from '../record/useRecordControl';
import { CompanionPage } from './CompanionPage';

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const through: RecordedThrough = { paragraphId: 'p2', word: 3, percent: 45, complete: false, source: 'booth', confident: true };
const recordedBook = (recorded: RecordedThrough): ManuscriptChapter[] =>
  CHAPTERS.map((chapter) => (chapter.id === 'c1' ? { ...chapter, recordedThrough: recorded } : chapter));

function apiWith(recorded: RecordedThrough, locate = vi.fn(() => Promise.reject(new Error('no recording')))): { api: NarrationApi; locate: typeof locate } {
  return {
    api: pageApi({ manuscriptChapters: async () => recordedBook(recorded), teleprompterLocate: locate as unknown as NarrationApi['teleprompterLocate'] }),
    locate,
  };
}

const boothWord = () => document.querySelector('[data-current]')?.textContent;

async function renderBooth(api: NarrationApi) {
  render(
    <BoothHost api={api} daw={dawFor('reaper')} journal={newJournal()} overlay={createOverlayService()} search="?chapter=c1">
      <BoothNextPage hasManuscript navigate={vi.fn()} projectFolder="/proj" />
    </BoothHost>,
  );
  await waitFor(() => expect(boothWord()).toBeTruthy());
  // The Booth first stands on the heading, then opens where the recording ends.
  await waitFor(() => expect(boothWord()).not.toMatch(/^(Chapter|One)$/));
  return boothWord()!;
}

function renderCompanion(api: NarrationApi) {
  render(
    <MemoryRouter initialEntries={['/companion?chapter=c1']}>
      <ApiProvider api={api}>
        <CommandRouter>
          <Routes>
            <Route path="/companion" element={<CompanionPage />} />
          </Routes>
        </CommandRouter>
      </ApiProvider>
    </MemoryRouter>,
  );
}

describe('one-resume-point-for-the-booth-and-the-companion', () => {
  it('a partly recorded chapter opens the Booth at the word the Companion offers to continue at', async () => {
    const { api } = apiWith(through);
    const word = await renderBooth(api);
    cleanup();
    renderCompanion(api);
    const notice = await screen.findByRole('region', { name: 'Where you stopped' });
    await waitFor(() => expect(notice.textContent).toMatch(new RegExp(`Continuing at ‘…${word}\\b`)));
    expect(notice.textContent).toContain('recorded 45% through');
  });

  it('asks the recording itself only when the narrator presses Change', async () => {
    const { api, locate } = apiWith(through);
    renderCompanion(api);
    const notice = await screen.findByRole('region', { name: 'Where you stopped' });
    await waitFor(() => expect(notice.textContent).toContain('Continuing at'));
    expect(locate).not.toHaveBeenCalled();
    await act(async () => void (await userEvent.setup().click(screen.getByRole('button', { name: 'Change' }))));
    await waitFor(() => expect(locate).toHaveBeenCalledTimes(1));
  });

  it('a chapter recorded to the end offers nothing from the recorded place and asks the recording as before', async () => {
    const { api, locate } = apiWith({ ...through, percent: 100, complete: true });
    renderCompanion(api);
    await waitFor(() => expect(locate).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Continuing at/)).toBeNull();
  });
});
