// @vitest-environment jsdom
// Where the Booth opens a chapter (#2251): an explicit target, else the word after the recording ends, else where the narrator left that
// chapter, else its top; and the top bar and the chapter list say how far each chapter is recorded.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import type { ManuscriptChapter, RecordedThrough } from '../../../api/contracts/manuscript';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi, TeleprompterState } from '../../../types';
import { forgetAppTake } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, CHAPTERS, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const through = (over: Partial<RecordedThrough> = {}): RecordedThrough => ({
  paragraphId: 'p2',
  word: 3,
  percent: 45,
  complete: false,
  source: 'booth',
  confident: true,
  ...over,
});

const withRecorded = (recorded: Record<string, RecordedThrough>): ManuscriptChapter[] =>
  CHAPTERS.map((chapter) => (recorded[chapter.id] ? { ...chapter, recordedThrough: recorded[chapter.id] } : chapter));

function renderPage({ search = '?chapter=c1', api = pageApi() }: { search?: string; api?: NarrationApi } = {}) {
  return render(
    <BoothHost api={api} daw={dawFor('reaper')} journal={newJournal()} overlay={createOverlayService()} search={search}>
      <BoothNextPage hasManuscript navigate={vi.fn()} projectFolder="/proj" />
    </BoothHost>,
  );
}
const reading = () => document.querySelector('[data-current]')?.textContent;
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

describe('switching chapters and coming back', () => {
  it('opens a chapter where the narrator left it after switching chapters, leaving the Booth and coming back on another chapter', async () => {
    const user = userEvent.setup();
    // In chapter one, the narrator reads to "walked" (paragraph three) and moves to chapter two.
    const first = renderPage();
    await waitFor(() => expect(document.body.textContent).toContain('She turned and walked away.'));
    act(() => void screen.getByText('walked').click());
    await waitFor(() => expect(reading()).toBe('walked'));
    await user.click(screen.getByRole('button', { name: 'Next chapter' }));
    await waitFor(() => expect(document.body.textContent).toContain('A new day began in the court.'));
    act(() => void screen.getByText('day').click());
    await settle();
    // They leave the Booth, come back in on chapter two, and change to chapter one.
    first.unmount();
    renderPage({ search: '?chapter=c2' });
    await waitFor(() => expect(reading()).toBe('day'));
    await user.click(screen.getByRole('button', { name: 'Previous chapter' }));
    await waitFor(() => expect(document.body.textContent).toContain('She turned and walked away.'));
    await waitFor(() => expect(reading()).toBe('walked'));
  });

  it('opens a chapter never visited with nothing recorded at its top', async () => {
    renderPage({ search: '?chapter=c2' });
    await waitFor(() => expect(document.body.textContent).toContain('A new day began in the court.'));
    await settle();
    expect(reading()).toBe('A');
    expect(screen.queryByRole('group', { name: /^Recorded/ })).toBeNull();
  });
});

describe('a chapter with a recording', () => {
  it('opens a half-recorded chapter on the word after the recording ends, over the place last read to', async () => {
    window.localStorage.setItem('narration.booth.chapterPlaces./proj', JSON.stringify({ c1: { paragraphId: 'p3', word: 3, at: 1 } }));
    renderPage({ api: pageApi({ manuscriptChapters: async () => withRecorded({ c1: through() }) }) });
    // p2: “Off with her head,” said the Queen. The recording ends on "head,”"; the reading opens on "said".
    await waitFor(() => expect(reading()).toBe('said'));
    const chip = screen.getByRole('group', { name: 'Recorded through ““Off with her head,”” (45%)' });
    expect(chip.textContent).toBe('Recorded 45%');
  });

  it('lets a link to a line win over the recording', async () => {
    renderPage({ search: '?chapter=c1&para=p3&at=9', api: pageApi({ manuscriptChapters: async () => withRecorded({ c1: through() }) }) });
    await waitFor(() => expect(reading()).toBe('turned'));
    await settle();
    expect(reading()).toBe('turned');
  });

  it('says Complete for a chapter recorded to the end, and opens it where the narrator left it', async () => {
    window.localStorage.setItem('narration.booth.chapterPlaces./proj', JSON.stringify({ c1: { paragraphId: 'p1', word: 2, at: 1 } }));
    renderPage({
      api: pageApi({ manuscriptChapters: async () => withRecorded({ c1: through({ paragraphId: 'p3', word: 9, percent: 100, complete: true }) }) }),
    });
    await waitFor(() => expect(screen.getByRole('group', { name: 'Recorded: complete' }).textContent).toBe('Complete'));
    await waitFor(() => expect(reading()).toBe('was'));
  });

  it('says about for a chapter known only by its track’s length', async () => {
    renderPage({ api: pageApi({ manuscriptChapters: async () => withRecorded({ c1: through({ source: 'daw', confident: false, percent: 30 }) }) }) });
    await waitFor(() => expect(screen.getByRole('group', { name: /^Recorded through about/ }).textContent).toBe('Recorded ~30%'));
  });

  it('lists each chapter’s completion in the chapter picker', async () => {
    const user = userEvent.setup();
    renderPage({
      api: pageApi({
        manuscriptChapters: async () => withRecorded({ c1: through(), c2: through({ paragraphId: 'q1', word: 6, percent: 100, complete: true }) }),
      }),
    });
    await waitFor(() => expect(document.body.textContent).toContain('She turned and walked away.'));
    await user.click(screen.getByRole('button', { name: /Change chapter/ }));
    const items = await screen.findAllByRole('menuitemradio');
    expect(items.map((item) => item.querySelector('[data-chapter-detail]')?.textContent)).toEqual(['45%', 'Complete']);
  });

  it('offers the way back to where it opened once the narrator looks elsewhere', async () => {
    renderPage({ api: pageApi({ manuscriptChapters: async () => withRecorded({ c1: through() }) }) });
    await waitFor(() => expect(reading()).toBe('said'));
    expect(screen.queryByRole('button', { name: /Resume at ¶/ })).toBeNull();
    act(() => void screen.getByText('Garden').click());
    const back = await screen.findByRole('button', { name: 'Resume at ¶ 2' });
    act(() => void back.click());
    await waitFor(() => expect(reading()).toBe('said'));
  });

  it('reads how far the chapters are recorded again when a take’s listening ends', async () => {
    const states = new Set<(state: TeleprompterState) => void>();
    const push = (state: Partial<TeleprompterState>) =>
      act(() => states.forEach((on) => on({ phase: 'running', message: '', engine: 'whisper', chapter: 'c1', script: null, position: null, ...state })));
    let calls = 0;
    const api = pageApi({
      subscribeTeleprompterState: (on: (state: TeleprompterState) => void) => {
        states.add(on);
        return () => states.delete(on);
      },
      manuscriptChapters: async () => {
        calls += 1;
        return withRecorded(calls > 1 ? { c1: through({ paragraphId: 'p3', word: 3, percent: 80 }) } : { c1: through() });
      },
    } as Partial<NarrationApi>);
    renderPage({ api });
    await waitFor(() => expect(screen.getByRole('group', { name: /^Recorded through/ }).textContent).toBe('Recorded 45%'));
    await push({});
    await push({ phase: 'stopped' });
    await waitFor(() => expect(screen.getByRole('group', { name: /^Recorded through/ }).textContent).toBe('Recorded 80%'));
    expect(calls).toBe(2);
  });
});
