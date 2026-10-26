// @vitest-environment jsdom
// The chapter's title, then its subtitle, is the first line the Booth reads (#2251 item 7): it is drawn as read text, a take from the
// top starts the host on it, reading it aloud moves the cursor through it, and nothing said in it becomes a pickup.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import type { ManuscriptChapter } from '../../../api/contracts/manuscript';
import type { TeleprompterEvent, TeleprompterStartOptions } from '../../../api/contracts/teleprompter';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi, TeleprompterState } from '../../../types';
import { forgetAppTake, skipStartGuard } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, CHAPTERS, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const IDLE: TeleprompterState = { phase: 'idle', message: '', engine: null, chapter: null, paused: false, coldRead: false, script: null, position: null };
// Chapter One's script as the sidecar numbers it (chapter_script.py): the heading's words, then the three paragraphs of testPage's c1.
const scriptFor = (heading: number): TeleprompterEvent => ({
  type: 'script',
  chapter: { id: 'c1', title: 'Chapter One' },
  tokens: heading + 34,
  spans: [
    { kind: 'title', id: 'c1', index: null, start: 0, count: heading },
    { kind: 'paragraph', id: 'p1', index: 0, start: heading, count: 11 },
    { kind: 'paragraph', id: 'p2', index: 1, start: heading + 11, count: 13 },
    { kind: 'paragraph', id: 'p3', index: 2, start: heading + 24, count: 10 },
  ],
});
const heardAt = (read: number): TeleprompterEvent => ({ type: 'position', read, committed: read, status: 'listening', jump: null, skipped: null });

/** A host whose one session the test drives: Start and Stop answer as the host does, and the test sends what the sidecar hears. */
function fakeHost(heading: number) {
  let state: TeleprompterState = IDLE;
  const states = new Set<(next: TeleprompterState) => void>();
  const events = new Set<(event: TeleprompterEvent) => void>();
  const publish = (next: Partial<TeleprompterState>) => {
    state = { ...state, ...next };
    states.forEach((listener) => listener(state));
  };
  const hear = (event: TeleprompterEvent) => {
    if (event.type === 'position') state = { ...state, position: event };
    events.forEach((listener) => listener(event));
  };
  const teleprompterStart = vi.fn(async (options: TeleprompterStartOptions) => {
    publish({ phase: 'starting', chapter: 'c1', engine: 'whisper', coldRead: Boolean(options.coldRead), position: null });
    publish({ phase: 'running' });
    hear(scriptFor(heading));
    hear(heardAt(options.startWord ?? 0));
    return { status: 'started' as const };
  });
  const teleprompterStop = vi.fn(async () => {
    if (state.phase === 'running' || state.phase === 'starting') publish({ phase: 'stopped' });
  });
  const teleprompterSaveFlags = vi.fn(async () => []);
  const api: Partial<NarrationApi> = {
    teleprompterStart,
    teleprompterStop,
    teleprompterSaveFlags,
    teleprompterState: async () => state,
    subscribeTeleprompterState: (listener) => {
      states.add(listener);
      return () => states.delete(listener);
    },
    subscribeTeleprompterEvent: (listener) => {
      events.add(listener);
      return () => events.delete(listener);
    },
  };
  return { api, teleprompterStart, teleprompterSaveFlags, hear: (event: TeleprompterEvent) => act(() => hear(event)) };
}

function renderPage({
  chapter = {},
  heading = 2,
  overlay = createOverlayService(),
}: { chapter?: Partial<ManuscriptChapter>; heading?: number; overlay?: ReturnType<typeof createOverlayService> } = {}) {
  const host = fakeHost(heading);
  const chapters = CHAPTERS.map((item) => (item.id === 'c1' ? { ...item, ...chapter } : item));
  render(
    <BoothHost
      api={pageApi({ passageMapRecordRun: async () => {}, manuscriptChapters: async () => chapters, ...host.api } as Partial<NarrationApi>)}
      daw={dawFor('reaper')}
      journal={newJournal()}
      overlay={overlay}
    >
      <BoothNextPage hasManuscript navigate={vi.fn()} />
    </BoothHost>,
  );
  return host;
}

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
const ready = async () => {
  await screen.findByText('Nobody', { exact: false });
  await waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
};
const space = () =>
  act(() => {
    skipStartGuard();
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
  });
const lines = () => [...document.querySelectorAll<HTMLElement>('[data-booth-text] [data-paragraph]')];
const currentWord = () => {
  const word = document.querySelector<HTMLElement>('[data-current]');
  return { line: word?.closest<HTMLElement>('[data-paragraph]')?.dataset.paragraph, text: word?.textContent };
};

describe('the-chapter-title-is-the-first-line', () => {
  it('draws the title, then the subtitle, ahead of the first paragraph, and the reading starts on the title', async () => {
    renderPage({ chapter: { title: 'Chapter 7', subtitle: 'The Road' } });
    await ready();
    expect(
      lines()
        .slice(0, 3)
        .map((line) => [line.dataset.heading ?? '', line.textContent?.trim()]),
    ).toEqual([
      ['title', 'Chapter 7'],
      ['subtitle', 'The Road'],
      ['', expect.stringContaining('The Garden was quiet.')],
    ]);
    expect(currentWord()).toEqual({ line: 'chapter-heading-title', text: 'Chapter' });
    // The heading is not a paragraph of the manuscript: the progress line still counts three, and the title is on the first.
    expect(document.querySelector('#bprog')?.textContent).toMatch(/^¶ 1 of 3 · 0%/);
  });

  it('a numbered title alone is one line, in its own words', async () => {
    renderPage({ chapter: { title: 'Chapter 7: The Road' } });
    await ready();
    expect(
      lines()
        .filter((line) => line.dataset.heading)
        .map((line) => line.textContent?.trim()),
    ).toEqual(['Chapter 7: The Road']);
  });

  it('a chapter with no title starts at its first paragraph, with no empty line', async () => {
    renderPage({ chapter: { title: '' }, heading: 0 });
    await ready();
    expect(lines().filter((line) => line.dataset.heading)).toEqual([]);
    expect(lines()[0].dataset.paragraph).toBe('p1');
    expect(currentWord()).toEqual({ line: 'p1', text: 'The' });
  });
});

describe('the-title-is-read-text', () => {
  it('a take from the top starts the host on the title, not past it', async () => {
    const host = renderPage();
    await ready();
    await space();
    await waitFor(() => expect(host.teleprompterStart).toHaveBeenCalledTimes(1));
    expect(host.teleprompterStart.mock.calls[0][0]).toMatchObject({ chapter: 'c1', startWord: 0 });
  });

  it('reading the title aloud moves the cursor through it and on into the first paragraph', async () => {
    const host = renderPage({ chapter: { title: 'Chapter 7', subtitle: 'The Road' }, heading: 4 });
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await host.hear(heardAt(1));
    await waitFor(() => expect(currentWord()).toEqual({ line: 'chapter-heading-title', text: '7' }));
    await host.hear(heardAt(3));
    await waitFor(() => expect(currentWord()).toEqual({ line: 'chapter-heading-subtitle', text: 'Road' }));
    await host.hear(heardAt(5));
    await waitFor(() => expect(currentWord()).toEqual({ line: 'p1', text: 'Garden' }));
  });

  it('nothing heard in the title becomes a pickup; a line misread in the text still does', async () => {
    const host = renderPage();
    await ready();
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    // "Chapter Won", a restart of the title and a word between it and the first line: flags the host never raises (flags.py), and
    // if one came the Booth would still not place it.
    await host.hear({ type: 'flag', id: 1, kind: 'misread', start: 1, end: 2, heard: 'won' });
    await host.hear({ type: 'flag', id: 2, kind: 'restart', start: 0, end: 2, heard: 'chapter one' });
    await host.hear(heardAt(8));
    await waitFor(() => expect(currentWord().line).toBe('p1'));
    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Record$/ })).toBeTruthy());
    await settle();
    expect(host.teleprompterSaveFlags).not.toHaveBeenCalled();

    await space();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Stop$/ })).toBeTruthy());
    await host.hear({ type: 'flag', id: 3, kind: 'misread', start: 4, end: 5, heard: 'warden' });
    await host.hear(heardAt(9));
    await space();
    await waitFor(() => expect(host.teleprompterSaveFlags).toHaveBeenCalledTimes(1));
    expect(host.teleprompterSaveFlags.mock.calls[0]).toEqual(['c1', [expect.objectContaining({ paragraphId: 'p1', wordStart: 2, heard: 'warden' })]]);
  });

  it('a bookmark cannot be put on the title, which is no paragraph of the manuscript, and B there says so', async () => {
    const overlay = createOverlayService();
    renderPage({ overlay });
    await ready();
    await act(() => {
      fireEvent.keyDown(document.body, { key: 'b', code: 'KeyB' });
    });
    await settle();
    expect(document.querySelectorAll('[data-bmk-margin] [data-bm]')).toHaveLength(0);
    expect(overlay.getSnapshot().toasts.map((toast) => toast.text)).toEqual(['A bookmark goes on a line of the text, not on the chapter title.']);
  });
});
