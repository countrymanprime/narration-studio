// @vitest-environment jsdom
// #4087: with no chapter asked for and none remembered, the Booth draws no chapter until the DAW's first answer is in, so the narrator never sees a chapter it then leaves.
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import { createOverlayService } from '../../../overlay/overlayService';
import { forgetAppTake } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';
import type { NarrationApi } from '../../../types';

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

const ONE = 'The Garden was quiet';
const TWO = 'A new day began in the court.';
// The picker's title for chapter 1: drawn only while chapter 1 is the chapter shown (chapter 2's own placeholder is not another chapter).
const TITLE_ONE = 'Chapter One';
const answer = (chapterId: string, delay = 100) =>
  vi.fn(() => new Promise<never>((resolve) => setTimeout(() => resolve({ ok: true, message: '', chapterId, selected: 1, cursor: 0 } as never), delay)));

function renderPage({ search = '', projectFolder = '/proj', api = {} }: { search?: string; projectFolder?: string; api?: Partial<NarrationApi> } = {}) {
  return render(
    <BoothHost api={pageApi(api as never)} daw={dawFor('reaper')} journal={newJournal()} overlay={createOverlayService()} search={search}>
      <BoothNextPage hasManuscript navigate={vi.fn()} projectFolder={projectFolder} />
      <Address />
    </BoothHost>,
  );
}

/** Records what the page says after every change to it. */
function sampler() {
  const seen: string[] = [];
  const observer = new MutationObserver(() => seen.push(document.body.textContent ?? ''));
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return { seen, stop: () => observer.disconnect() };
}
const sees = (seen: string[], text: string) => seen.some((frame) => frame.includes(text));
const wait = (ms: number) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));

describe('the Booth never draws a chapter it then leaves (#4087)', () => {
  it('nothing remembered, the DAW on chapter 2 (answer in 100 ms): only the skeleton, then chapter 2', async () => {
    const dawPlace = answer('c2');
    const { seen, stop } = sampler();
    renderPage({ api: { dawPlace } });
    await waitFor(() => expect(document.body.textContent).toContain(TWO));
    await wait(400);
    stop();
    expect(sees(seen, ONE)).toBe(false);
    expect(sees(seen, TITLE_ONE)).toBe(false);
    expect(address).toContain('chapter=c2');
  });

  it('the DAW answers no place: the first chapter draws as soon as the answer comes, with no 20 s wait', async () => {
    const dawPlace = answer('', 50);
    const { seen, stop } = sampler();
    renderPage({ api: { dawPlace } });
    await waitFor(() => expect(document.body.textContent).toContain(ONE));
    stop();
    expect(dawPlace).toHaveBeenCalledTimes(1);
    expect(sees(seen, TWO)).toBe(false);
  });

  it('the DAW answers a chapter that is not in the list: the first chapter draws', async () => {
    renderPage({ api: { dawPlace: answer('nowhere', 20) } });
    await waitFor(() => expect(document.body.textContent).toContain(ONE));
  });

  it('the DAW answers a credits chapter: the first chapter draws', async () => {
    renderPage({ api: { dawPlace: answer('credits-opening', 20) } });
    await waitFor(() => expect(document.body.textContent).toContain(ONE));
  });

  it('the ask refuses (DAW not linked): the first chapter draws at once', async () => {
    const dawPlace = vi.fn(async () => ({ ok: false, message: 'No DAW is linked.', chapterId: '', selected: 0, cursor: 0 }));
    renderPage({ api: { dawPlace } as never });
    await waitFor(() => expect(document.body.textContent).toContain(ONE), { timeout: 700 });
  });

  it('the ask fails outright: the first chapter draws at once', async () => {
    const dawPlace = vi.fn(async () => {
      throw new Error('no host');
    });
    renderPage({ api: { dawPlace } as never });
    await waitFor(() => expect(document.body.textContent).toContain(ONE), { timeout: 700 });
  });

  it('the ask never answers: the first chapter draws after the cap, not after 20 s', async () => {
    const dawPlace = vi.fn(() => new Promise<never>(() => {}));
    renderPage({ api: { dawPlace } as never });
    await waitFor(() => expect(document.body.textContent).toContain(ONE), { timeout: 3000 });
  });

  it('a remembered chapter changes nothing: it draws with no chapter 1 first, and the DAW does not choose', async () => {
    window.localStorage.setItem('narration.booth.lastPlace./proj', JSON.stringify({ chapterId: 'c2', paragraphId: 'q1', word: 2 }));
    const dawPlace = answer('c1', 10);
    const { seen, stop } = sampler();
    renderPage({ api: { dawPlace } });
    await waitFor(() => expect(document.body.textContent).toContain(TWO));
    await wait(100);
    stop();
    expect(sees(seen, ONE)).toBe(false);
    expect(sees(seen, TITLE_ONE)).toBe(false);
    // The DAW is read only to see whether it is on the kept chapter (never to choose one): its answer 'c1' changes nothing.
    expect(address).toContain('chapter=c2');
  });

  it('a chapter in the address changes nothing: it draws at once, and the DAW is not asked', async () => {
    const dawPlace = answer('c2', 10);
    renderPage({ search: '?chapter=c1', api: { dawPlace } });
    await waitFor(() => expect(document.body.textContent).toContain(ONE));
    await wait(100);
    expect(dawPlace).not.toHaveBeenCalled();
    expect(address).toContain('chapter=c1');
  });

  it('a project switch (the page is mounted again for project B, nothing kept there): the same, no chapter 1 hop', async () => {
    window.localStorage.setItem('narration.booth.lastPlace./a', JSON.stringify({ chapterId: 'c1', paragraphId: 'p3', word: 3 }));
    const dawPlace = answer('c2');
    const first = renderPage({ projectFolder: '/a', api: { dawPlace } });
    await waitFor(() => expect(document.body.textContent).toContain(ONE));
    first.unmount();
    const { seen, stop } = sampler();
    renderPage({ projectFolder: '/b', api: { dawPlace } });
    await waitFor(() => expect(document.body.textContent).toContain(TWO));
    await wait(400);
    stop();
    expect(sees(seen, ONE)).toBe(false);
    expect(sees(seen, TITLE_ONE)).toBe(false);
  });
});
