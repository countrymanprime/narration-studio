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
    // The top is the chapter's heading, the first line the Booth reads (#2517).
    expect(reading()).toBe('Chapter');
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
    // The chip says how far it is recorded; no green rail runs down the page beside the text (owner report, #2251).
    expect(document.querySelector('[data-recorded-extent], [data-recorded-rail]')).toBeNull();
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

  it('reads the position, not the work left, in a chapter recorded to the end (#2633)', async () => {
    renderPage({
      api: pageApi({ manuscriptChapters: async () => withRecorded({ c1: through({ paragraphId: 'p3', word: 9, percent: 100, complete: true }) }) }),
    });
    await waitFor(() => expect(screen.getByRole('group', { name: 'Recorded: complete' }).textContent).toBe('Complete'));
    await waitFor(() => expect(screen.getByText(/^At ¶ 1 of 3$/)).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/of audio left/);
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

  // The host as the Booth sees it while a take is made: `recorded` is how far the chapters are recorded now, and a read made while `held`
  // is set waits for `release` and answers with what was recorded when it was asked. Which call asks is of no matter (the shell and other
  // panels read the chapters too).
  function takeHost() {
    const subscribers = new Set<(state: TeleprompterState) => void>();
    const host = {
      recorded: through(),
      held: false,
      stale: [] as Array<() => void>,
    };
    const api = pageApi({
      subscribeTeleprompterState: (on: (state: TeleprompterState) => void) => {
        subscribers.add(on);
        return () => subscribers.delete(on);
      },
      manuscriptChapters: () => {
        const answer = withRecorded({ c1: host.recorded });
        return host.held ? new Promise<ManuscriptChapter[]>((resolve) => host.stale.push(() => resolve(answer))) : Promise.resolve(answer);
      },
    } as Partial<NarrationApi>);
    const push = (state: Partial<TeleprompterState>) =>
      act(() => subscribers.forEach((on) => on({ phase: 'running', message: '', engine: 'whisper', chapter: 'c1', script: null, position: null, ...state })));
    // A take: listening starts, then ends. The page has to be listening for the host's state first, or the take goes by unseen.
    const take = async () => {
      await waitFor(() => expect(subscribers.size).toBeGreaterThan(0));
      await push({});
      await push({ phase: 'stopped' });
    };
    return { api, host, take };
  }
  const chip = () => screen.getByRole('group', { name: /^Recorded through/ }).textContent;

  it('reads how far the chapters are recorded again when a take’s listening ends', async () => {
    const { api, host, take } = takeHost();
    renderPage({ api });
    await waitFor(() => expect(chip()).toBe('Recorded 45%'));
    host.recorded = through({ paragraphId: 'p3', word: 3, percent: 80 });
    await take();
    await waitFor(() => expect(chip()).toBe('Recorded 80%'));
  });

  it('keeps the newest reading of how far the chapters are recorded when an older read answers last', async () => {
    const { api, host, take } = takeHost();
    renderPage({ api });
    await waitFor(() => expect(chip()).toBe('Recorded 45%'));
    // The first take's read is slow; a second take's read answers before it does.
    host.held = true;
    host.recorded = through({ paragraphId: 'p3', word: 1, percent: 60 });
    await take();
    await waitFor(() => expect(host.stale).toHaveLength(1));
    host.held = false;
    host.recorded = through({ paragraphId: 'p3', word: 3, percent: 80 });
    await take();
    await waitFor(() => expect(chip()).toBe('Recorded 80%'));
    await act(async () => host.stale.forEach((release) => release()));
    await settle();
    expect(chip()).toBe('Recorded 80%');
  });
});
