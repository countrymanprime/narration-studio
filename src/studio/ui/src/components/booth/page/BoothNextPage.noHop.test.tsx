// @vitest-environment jsdom
// #4087: with no chapter asked for and none remembered, the Booth draws no chapter until the DAW's first answer is in, so the narrator never sees a chapter it then leaves.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    await waitFor(() => expect(document.body.textContent).toContain(ONE), { timeout: 6000 });
  });

  it("a DAW that answers in 2.5 s (the host's limit is 3 s): only the skeleton, then its chapter, never chapter 1", async () => {
    const { seen, stop } = sampler();
    renderPage({ api: { dawPlace: answer('c2', 2500) } });
    await waitFor(() => expect(document.body.textContent).toContain(TWO), { timeout: 5000 });
    await wait(300);
    stop();
    expect(sees(seen, ONE)).toBe(false);
    expect(sees(seen, TITLE_ONE)).toBe(false);
    expect(address).toContain('chapter=c2');
  }, 15_000);

  it('a DAW that answers after the cap (5 s): the chapter drawn stays, nothing moves, and the DAW is asked once', async () => {
    const dawPlace = answer('c2', 5000);
    renderPage({ api: { dawPlace } });
    await waitFor(() => expect(document.body.textContent).toContain(ONE), { timeout: 6000 });
    await wait(4000);
    expect(dawPlace).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(ONE);
    expect(document.body.textContent).not.toContain(TWO);
    expect(address).not.toContain('chapter=c2');
  }, 20_000);

  it('a take running when a late answer comes is not remounted or moved', async () => {
    renderPage({ api: { dawPlace: answer('c2', 5000) } });
    const record = await screen.findByRole('button', { name: /^Record$/ }, { timeout: 8000 });
    await waitFor(() => expect(record.getAttribute('aria-disabled')).not.toBe('true'));
    await userEvent.click(record);
    const stopButton = await screen.findByRole('button', { name: /^Stop$/ }, { timeout: 5000 });
    await wait(5000);
    // The answer has come by now: the take's page is the same one, still recording on the chapter it started on.
    expect(screen.getByRole('button', { name: /^Stop$/ })).toBe(stopButton);
    expect(document.body.textContent).toContain(ONE);
    expect(address).not.toContain('chapter=c2');
  }, 30_000);

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

describe('a chapter the Booth has drawn is never left without a narrator action (#4087)', () => {
  const place = (chapterId: string) => ({ ok: true, message: '', chapterId, selected: 1, cursor: 0 });
  const refused = { ok: false, message: 'REAPER is not answering.', chapterId: '', selected: 0, cursor: 0 };
  /** The DAW's reads, in order: each is a reply after `after` ms, or a throw. The last one repeats. */
  const reads = (...steps: Array<{ after: number; reply?: object; fail?: boolean }>) => {
    let n = 0;
    return vi.fn(
      () =>
        new Promise((resolve, reject) => {
          const step = steps[Math.min(n++, steps.length - 1)]!;
          setTimeout(() => (step.fail ? reject(new Error('boom')) : resolve(step.reply)), step.after);
        }),
    );
  };

  /** Runs 25 s of the page and returns every chapter the picker named, in order, and the address once the first one was drawn. */
  async function watch() {
    const labels: string[] = [];
    const note = () => {
      const label = document.querySelector("[aria-label^='Chapter:']")?.getAttribute('aria-label');
      if (label && labels[labels.length - 1] !== label) labels.push(label);
    };
    const observer = new MutationObserver(note);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label'] });
    let afterFirst = '';
    for (let spent = 0; spent < 25_000; spent += 100) {
      await act(async () => void (await vi.advanceTimersByTimeAsync(100)));
      note();
      if (labels.length === 1 && afterFirst === '') afterFirst = address;
    }
    observer.disconnect();
    return { labels, afterFirst };
  }

  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it.each([
    ['(a) answers chapter 2 at 2.0 s', reads({ after: 2000, reply: place('c2') }), 'Chapter Two', 1],
    ['(b) answers chapter 2 at 2.5 s', reads({ after: 2500, reply: place('c2') }), 'Chapter Two', 1],
    ['(b) answers chapter 2 at 5 s, past the cap', reads({ after: 5000, reply: place('c2') }), 'Chapter One', 1],
    [
      '(c) the read throws, and the DAW answers chapter 2 on a later ask',
      reads({ after: 900, fail: true }, { after: 0, reply: place('c2') }),
      'Chapter One',
      1,
    ],
    ['(d) unreachable at open, answers chapter 2 later', reads({ after: 0, reply: refused }, { after: 5000, reply: place('c2') }), 'Chapter One', 1],
    ['(e) refuses, then is ready and names chapter 2', reads({ after: 0, reply: refused }, { after: 0, reply: place('c2') }), 'Chapter One', 1],
  ])(
    '%s: one chapter is drawn, the address does not change after it, and the DAW is asked once',
    async (_name, dawPlace, shown, asks) => {
      renderPage({ api: { dawPlace } as never });
      const { labels, afterFirst } = await watch();
      expect(labels).toHaveLength(1);
      expect(labels[0]).toContain(shown);
      expect(address).toBe(afterFirst);
      expect(dawPlace).toHaveBeenCalledTimes(asks);
    },
    60_000,
  );

  it('(f) a project switch to a project with nothing kept, the DAW answers at 2.5 s: the DAW chapter only', async () => {
    window.localStorage.setItem('narration.booth.lastPlace./a', JSON.stringify({ chapterId: 'c1', paragraphId: 'p3', word: 3 }));
    const first = renderPage({ projectFolder: '/a', api: { dawPlace: reads({ after: 2500, reply: place('c2') }) as never } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
    first.unmount();
    renderPage({ projectFolder: '/b', api: { dawPlace: reads({ after: 2500, reply: place('c2') }) as never } });
    const { labels, afterFirst } = await watch();
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('Chapter Two');
    expect(address).toBe(afterFirst);
  }, 60_000);
});
