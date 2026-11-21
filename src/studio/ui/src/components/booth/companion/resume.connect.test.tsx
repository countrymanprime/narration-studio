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
import type { NarrationApi, TeleprompterState } from '../../../types';
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

  // T1 (qa delta): the resume notice's percent pairs the through with the audio of the SAME read. After a session ends the take leaves the host at 0% with 12 s on the track:
  // the notice reads 1% as Production does, not 0% (the audio used to come from the chapter read once when the page opened).
  it('after a session ends the resume notice reads 1% when the take left the host at 0% with audio on the track', async () => {
    const subscribers = new Set<(state: TeleprompterState) => void>();
    const host = { seconds: 0 };
    const zero: RecordedThrough = { ...through, percent: 0 };
    const api = pageApi({
      subscribeTeleprompterState: (on: (state: TeleprompterState) => void) => {
        subscribers.add(on);
        return () => subscribers.delete(on);
      },
      manuscriptChapters: async () =>
        CHAPTERS.map((chapter) => (chapter.id === 'c1' ? { ...chapter, recordedThrough: zero, recordedSeconds: host.seconds } : chapter)),
    } as Partial<NarrationApi>);
    renderCompanion(api);
    const notice = await screen.findByRole('region', { name: 'Where you stopped' });
    await waitFor(() => expect(notice.textContent).toContain('recorded 0% through'));
    const push = (state: Partial<TeleprompterState>) =>
      act(() => subscribers.forEach((on) => on({ phase: 'running', message: '', engine: 'whisper', chapter: 'c1', script: null, position: null, ...state })));
    await waitFor(() => expect(subscribers.size).toBeGreaterThan(0));
    await push({});
    host.seconds = 12;
    await push({ phase: 'stopped' });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Where you stopped' }).textContent).toContain('recorded 1% through'));
  });
  // G1 (qa delta): "This chapter" printed the recorded length of the Production read made when the page opened ("Recorded 0:00") while the resume notice, after a session ended,
  // read the new take ("recorded 1% through"). Both come from the one read `useRecordedThrough` makes, so after a session the two lines agree.
  it('after a session ends "This chapter" and the resume notice come from the same read', async () => {
    const subscribers = new Set<(state: TeleprompterState) => void>();
    const host = { seconds: 0 };
    const zero: RecordedThrough = { ...through, percent: 0 };
    const base = pageApi({} as Partial<NarrationApi>);
    const overview = await base.productionOverview();
    const api = pageApi({
      subscribeTeleprompterState: (on: (state: TeleprompterState) => void) => {
        subscribers.add(on);
        return () => subscribers.delete(on);
      },
      manuscriptChapters: async () =>
        CHAPTERS.map((chapter) => (chapter.id === 'c1' ? { ...chapter, recordedThrough: zero, recordedSeconds: host.seconds } : chapter)),
      productionOverview: async () => ({
        ...overview,
        chapters: [{ ...overview.chapters[0], id: 'c1', recordedSeconds: 0 }],
      }),
    } as Partial<NarrationApi>);
    renderCompanion(api);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Where you stopped' }).textContent).toContain('recorded 0% through'));
    await waitFor(() => expect(screen.getByText('Recorded 0:00')).toBeTruthy());
    const push = (state: Partial<TeleprompterState>) =>
      act(() => subscribers.forEach((on) => on({ phase: 'running', message: '', engine: 'whisper', chapter: 'c1', script: null, position: null, ...state })));
    await waitFor(() => expect(subscribers.size).toBeGreaterThan(0));
    await push({});
    host.seconds = 12;
    await push({ phase: 'stopped' });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Where you stopped' }).textContent).toContain('recorded 1% through'));
    expect(screen.getByText('Recorded 0:12')).toBeTruthy();
    expect(screen.queryByText('Recorded 0:00')).toBeNull();
  });
  // H1 (qa delta): when the Production board cannot be read at a session's end, "This chapter" keeps the length of the read the notice came from (it used to empty to "Nothing measured").
  it('after a session ends with the Production board unreadable, This chapter still shows the recorded length of the read the notice came from', async () => {
    const subscribers = new Set<(state: TeleprompterState) => void>();
    const zero: RecordedThrough = { ...through, percent: 0 };
    const base = pageApi({} as Partial<NarrationApi>);
    const overview = await base.productionOverview();
    const reads = { overview: 0 };
    const api = pageApi({
      subscribeTeleprompterState: (on: (state: TeleprompterState) => void) => {
        subscribers.add(on);
        return () => subscribers.delete(on);
      },
      manuscriptChapters: async () => CHAPTERS.map((chapter) => (chapter.id === 'c1' ? { ...chapter, recordedThrough: zero, recordedSeconds: 12 } : chapter)),
      productionOverview: async () => {
        reads.overview += 1;
        if (reads.overview > 1) throw new Error('Production board unreadable');
        return { ...overview, chapters: [{ ...overview.chapters[0], id: 'c1', recordedSeconds: 0 }] };
      },
    } as Partial<NarrationApi>);
    renderCompanion(api);
    await waitFor(() => expect(screen.getByText('Recorded 0:12')).toBeTruthy());
    const push = (state: Partial<TeleprompterState>) =>
      act(() => subscribers.forEach((on) => on({ phase: 'running', message: '', engine: 'whisper', chapter: 'c1', script: null, position: null, ...state })));
    await waitFor(() => expect(subscribers.size).toBeGreaterThan(0));
    await push({});
    await push({ phase: 'stopped' });
    await waitFor(() => expect(reads.overview).toBe(2));
    expect(screen.getByText('Recorded 0:12')).toBeTruthy();
    expect(screen.queryByText('Nothing measured for this chapter yet.')).toBeNull();
  });

  // #3869: a take under one second leaves "Recorded 0:00" in This chapter; the notice must not read 1% beside it.
  it('a take under one second does not read 1% recorded beside Recorded 0:00', async () => {
    const zero: RecordedThrough = { ...through, percent: 0 };
    const base = pageApi({} as Partial<NarrationApi>);
    const overview = await base.productionOverview();
    const api = pageApi({
      manuscriptChapters: async () => CHAPTERS.map((chapter) => (chapter.id === 'c1' ? { ...chapter, recordedThrough: zero, recordedSeconds: 0.5 } : chapter)),
      productionOverview: async () => ({ ...overview, chapters: [{ ...overview.chapters[0], id: 'c1', recordedSeconds: 0.5 }] }),
    } as Partial<NarrationApi>);
    renderCompanion(api);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Where you stopped' }).textContent).toContain('recorded 0% through'));
    await waitFor(() => expect(screen.getByText('Recorded 0:00')).toBeTruthy());
  });
});
