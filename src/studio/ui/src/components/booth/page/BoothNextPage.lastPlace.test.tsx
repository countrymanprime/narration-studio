// @vitest-environment jsdom
// Resume: the Booth opened with no chapter named opens the chapter the narrator last left in this project, at the place they left.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import { createOverlayService } from '../../../overlay/overlayService';
import { forgetAppTake } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';
import { loadLastPlace } from './lastPlace';
import type { NarrationApi } from '../../../types';

const KEY = 'narration.booth.lastPlace./proj';
const keep = (place: object) => window.localStorage.setItem(KEY, JSON.stringify(place));

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

let address = '';
function Address() {
  address = useLocation().search;
  return null;
}

function renderPage({ search = '', projectFolder = '/proj', api = {} }: { search?: string; projectFolder?: string; api?: Partial<NarrationApi> } = {}) {
  // BoothHost defaults to ?chapter=c1; an empty search is the Booth opened with no chapter named.
  return render(
    <BoothHost api={pageApi(api as never)} daw={dawFor('reaper')} journal={newJournal()} overlay={createOverlayService()} search={search}>
      <BoothNextPage hasManuscript navigate={vi.fn()} projectFolder={projectFolder} />
      <Address />
    </BoothHost>,
  );
}
const reading = () => document.querySelector('[data-current]')?.textContent;
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

describe('the Booth returns to where the narrator left it', () => {
  it('opens-on-the-chapter-and-the-word-they-left', async () => {
    keep({ chapterId: 'c1', paragraphId: 'p3', word: 3 });
    renderPage();
    await waitFor(() => expect(reading()).toBe('walked'));
    await waitFor(() => expect(address).toContain('chapter=c1'));
  });

  it('opens-on-another-chapter-than-the-first', async () => {
    keep({ chapterId: 'c2', paragraphId: 'q1', word: 2 });
    renderPage();
    await waitFor(() => expect(document.body.textContent).toContain('A new day began in the court.'));
    await waitFor(() => expect(reading()).toBe('day'));
    expect(address).toContain('chapter=c2');
  });

  it('keeps-the-place-as-the-reading-moves-and-does-not-overwrite-it-before-it-is-back', async () => {
    keep({ chapterId: 'c1', paragraphId: 'p3', word: 3 });
    renderPage();
    await waitFor(() => expect(reading()).toBe('walked'));
    expect(loadLastPlace('/proj')).toEqual({ chapterId: 'c1', paragraphId: 'p3', word: 3 });
    act(() => void screen.getByText('away.').click());
    await settle();
    await waitFor(() => expect(loadLastPlace('/proj')).toMatchObject({ chapterId: 'c1', paragraphId: 'p3', word: 4 }));
  });

  it('a-chapter-named-in-the-address-wins-and-becomes-the-place', async () => {
    keep({ chapterId: 'c2', paragraphId: 'q1', word: 2 });
    renderPage({ search: '?chapter=c1' });
    await waitFor(() => expect(document.body.textContent).toContain('Off with her head'));
    expect(address).toContain('chapter=c1');
    await waitFor(() => expect(loadLastPlace('/proj')).toMatchObject({ chapterId: 'c1' }));
  });

  it('a-reload-keeps-the-chapter-in-the-address-and-the-place-in-it', async () => {
    keep({ chapterId: 'c1', paragraphId: 'p3', word: 3 });
    renderPage({ search: '?chapter=c1' });
    await waitFor(() => expect(reading()).toBe('walked'));
  });

  it('a-link-with-a-line-in-it-is-not-moved-to-the-kept-place', async () => {
    keep({ chapterId: 'c1', paragraphId: 'p3', word: 3 });
    renderPage({ search: '?chapter=c1&para=p2&at=0' });
    await waitFor(() => expect(document.body.textContent).toContain('Off with her head'));
    await settle();
    expect(reading()).not.toBe('walked');
  });

  it('a-chapter-that-is-gone-opens-the-first-as-before', async () => {
    keep({ chapterId: 'deleted', paragraphId: 'x', word: 1 });
    renderPage();
    await waitFor(() => expect(document.body.textContent).toContain('The Garden was quiet'));
  });

  it('a-paragraph-that-is-gone-opens-the-chapter-at-its-start', async () => {
    keep({ chapterId: 'c2', paragraphId: 'gone', word: 5 });
    renderPage();
    await waitFor(() => expect(document.body.textContent).toContain('A new day began in the court.'));
    // The start of a chapter is its title, the first line read (#2251 item 7).
    await waitFor(() => expect(reading()).toBe('Chapter'));
  });

  it('another-project-keeps-its-own-place', async () => {
    keep({ chapterId: 'c2', paragraphId: 'q1', word: 2 });
    renderPage({ projectFolder: '/other' });
    await waitFor(() => expect(document.body.textContent).toContain('The Garden was quiet'));
    expect(address).not.toContain('chapter=c2');
  });

  it('with-no-project-nothing-is-read-or-kept', async () => {
    keep({ chapterId: 'c2', paragraphId: 'q1', word: 2 });
    renderPage({ projectFolder: '' });
    await waitFor(() => expect(document.body.textContent).toContain('The Garden was quiet'));
    expect(window.localStorage.getItem('narration.booth.lastPlace.')).toBeNull();
  });

  it('blocked-storage-opens-the-Booth-as-it-did', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderPage();
    await waitFor(() => expect(document.body.textContent).toContain('The Garden was quiet'));
    vi.restoreAllMocks();
  });
});

describe('the DAW goes back to the chapter the narrator left after a restart (#3428, A12)', () => {
  const goTo = () => vi.fn(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
  const dawOn = (chapterId: string) => vi.fn(async () => ({ ok: true, message: '', chapterId, selected: 1, cursor: 5 }));
  it.each([['c1'], ['c2']])('after a restart the DAW is moved to the kept chapter %s once, when the DAW is on another', async (chapterId) => {
    keep({ chapterId, paragraphId: chapterId === 'c1' ? 'p3' : 'q1', word: 2 });
    const dawGoToChapter = goTo();
    const dawPlace = dawOn(chapterId === 'c1' ? 'c2' : 'c1');
    renderPage({ api: { dawGoToChapter, dawPlace } });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledWith(chapterId, expect.any(String), expect.any(Number)));
    await settle();
    expect(dawGoToChapter).toHaveBeenCalledTimes(1);
  });

  it.each([['c1'], ['c2']])('the DAW already on the kept chapter %s is read and not moved', async (chapterId) => {
    keep({ chapterId, paragraphId: chapterId === 'c1' ? 'p3' : 'q1', word: 2 });
    const dawGoToChapter = goTo();
    const dawPlace = dawOn(chapterId);
    renderPage({ api: { dawGoToChapter, dawPlace } });
    await waitFor(() => expect(dawPlace).toHaveBeenCalled());
    await settle();
    await settle();
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('a DAW with nothing selected is moved to the kept chapter', async () => {
    keep({ chapterId: 'c2', paragraphId: 'q1', word: 2 });
    const dawGoToChapter = goTo();
    renderPage({ api: { dawGoToChapter, dawPlace: dawOn('') } });
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledWith('c2', expect.any(String), expect.any(Number)));
  });

  it('a kept chapter that is gone is nothing remembered: the Booth follows the DAW and moves it nowhere', async () => {
    keep({ chapterId: 'deleted', paragraphId: 'x', word: 1 });
    const dawGoToChapter = goTo();
    renderPage({ api: { dawGoToChapter, dawPlace: dawOn('c2') } });
    await waitFor(() => expect(address).toContain('chapter=c2'));
    await settle();
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('garbage in the kept place is nothing remembered too', async () => {
    window.localStorage.setItem(KEY, '{"chapterId": 7}');
    const dawGoToChapter = goTo();
    renderPage({ api: { dawGoToChapter, dawPlace: dawOn('c2') } });
    await waitFor(() => expect(address).toContain('chapter=c2'));
    await settle();
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });
});
