// @vitest-environment jsdom
// A cold read (#2251 item 13): the Booth follows the narrator's voice with a ghost, records nothing, and the real cursor never moves
// because of it. Only the toggle, a take or leaving the Booth ends it.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/hostWindow', () => ({ toggleFullscreen: vi.fn(async () => true), exitFullscreen: vi.fn(async () => {}) }));
vi.mock('../takeTone', async (original) => ({ ...(await original<typeof import('../takeTone')>()), playTakeTone: vi.fn(async () => {}) }));

import type { TeleprompterEvent, TeleprompterStartOptions } from '../../../api/contracts/teleprompter';
import { currentPageContext, type PageItem } from '../../../input/pageCommands';
import { createOverlayService } from '../../../overlay/overlayService';
import type { NarrationApi, TeleprompterState } from '../../../types';
import { forgetAppTake, skipStartGuard } from '../record/useRecordControl';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, newJournal, pageApi } from './testPage';

beforeEach(() => forgetAppTake());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const IDLE: TeleprompterState = { phase: 'idle', message: '', engine: null, chapter: null, paused: false, coldRead: false, script: null, position: null };
// Chapter One's script as the tracker numbers it: the title's two words, then the three paragraphs of testPage's c1.
const SCRIPT: TeleprompterEvent = {
  type: 'script',
  chapter: { id: 'c1', title: 'Chapter One' },
  tokens: 36,
  spans: [
    { kind: 'title', id: 'c1', index: null, start: 0, count: 2 },
    { kind: 'paragraph', id: 'p1', index: 0, start: 2, count: 11 },
    { kind: 'paragraph', id: 'p2', index: 1, start: 13, count: 13 },
    { kind: 'paragraph', id: 'p3', index: 2, start: 26, count: 10 },
  ],
};
const heardAt = (read: number): TeleprompterEvent => ({ type: 'position', read, committed: read, status: 'listening', jump: null, skipped: null });

/** A host whose one session the test drives: Start and Stop answer as the host does, and the test sends what the sidecar hears. */
function fakeHost() {
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
    hear(SCRIPT);
    if (options.startWord) hear(heardAt(options.startWord));
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
  return { api, teleprompterStart, teleprompterStop, teleprompterSaveFlags, hear: (event: TeleprompterEvent) => act(() => hear(event)) };
}

function renderPage() {
  const host = fakeHost();
  const daw = dawFor('reaper');
  const recordStart = vi.spyOn(daw, 'recordStart');
  const navigate = vi.fn();
  const overlay = createOverlayService();
  const view = render(
    <BoothHost api={pageApi({ passageMapRecordRun: async () => {}, ...host.api } as Partial<NarrationApi>)} daw={daw} journal={newJournal()} overlay={overlay}>
      <BoothNextPage hasManuscript navigate={navigate} />
    </BoothHost>,
  );
  return { ...host, view, recordStart, navigate, overlay };
}

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
const ready = async () => {
  await screen.findByText('Nobody', { exact: false });
  await waitFor(() => expect((screen.getByRole('button', { name: /^Record$/ }) as HTMLButtonElement).disabled).toBe(false));
};
const toggle = () => screen.getByRole('button', { name: 'Cold read' });
const pressToggle = async () => {
  await act(async () => void fireEvent.click(toggle()));
  await settle();
};
const ghost = () => document.querySelector<HTMLElement>('[data-ghost]');
const currentWord = () => {
  const word = document.querySelector<HTMLElement>('[data-current]');
  return `${word?.closest<HTMLElement>('[data-unit]')?.dataset.unit}:${word?.dataset.word}`;
};
const item = (id: string): PageItem | undefined => currentPageContext()?.items.find((entry) => entry.id === id);

describe('cold-read-is-off-by-default-and-starts-from-the-real-cursor', () => {
  it('shows an unpressed toggle and no microphone badge until it is pressed', async () => {
    renderPage();
    await ready();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('Mic on · cold read')).toBeNull();
    expect(ghost()).toBeNull();
  });

  it('asks the host for a cold read with the engine chosen in Settings, from the real cursor, and shows the microphone is on', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    expect(page.teleprompterStart).toHaveBeenCalledTimes(1);
    expect(page.teleprompterStart.mock.calls[0][0]).toMatchObject({ chapter: 'c1', coldRead: true, engine: 'whisper' });
    await waitFor(() => expect(toggle().getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByText('Mic on · cold read')).toBeTruthy();
    expect(screen.queryByText('REC')).toBeNull();
    expect(page.recordStart).not.toHaveBeenCalled();
  });
});

describe('the-ghost-follows-the-voice-and-the-real-cursor-stays', () => {
  it('draws the ghost where it hears the narrator and never moves the real cursor, the progress line or the take', async () => {
    const page = renderPage();
    await ready();
    const before = currentWord();
    const progress = document.querySelector('#bprog')?.textContent;
    await pressToggle();
    await page.hear(heardAt(20));
    // The cursor walks to the word it heard (usePacedCursor), so the ghost arrives over a few frames.
    await waitFor(() => expect(ghost()?.closest('[data-paragraph]')?.getAttribute('data-paragraph')).toBe('p2'));
    await page.hear(heardAt(30));
    await waitFor(() => expect(ghost()!.closest('[data-paragraph]')?.getAttribute('data-paragraph')).toBe('p3'));
    expect(currentWord()).toBe(before);
    expect(document.querySelector('#bprog')?.textContent).toBe(progress);
  });

  it('keeps the flags it hears out of the suspected lines', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    await page.hear({ type: 'flag', id: 1, kind: 'skipped', start: 3, end: 6, heard: '' });
    await pressToggle();
    await settle();
    expect(page.teleprompterSaveFlags).not.toHaveBeenCalled();
  });

  it('a click on a word moves the real cursor, not the ghost, and sends the cold read nowhere', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    await page.hear(heardAt(20));
    await waitFor(() => expect(ghost()).toBeTruthy());
    const ghostBefore = ghost()!.textContent;
    const target = document.querySelector<HTMLElement>('[data-paragraph="p3"] [data-word="1"]')!;
    await act(async () => void fireEvent.click(target));
    expect(document.querySelector('[data-paragraph="p3"] [data-current]')).toBeTruthy();
    expect(ghost()!.textContent).toBe(ghostBefore);
  });
});

describe('only-the-toggle-a-take-or-leaving-ends-it', () => {
  it('a second press ends it and the ghost goes', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    await page.hear(heardAt(20));
    await waitFor(() => expect(ghost()).toBeTruthy());
    await pressToggle();
    expect(page.teleprompterStop).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(ghost()).toBeNull());
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('Mic on · cold read')).toBeNull();
  });

  it('keeps listening past the end of the chapter', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    await page.hear({ type: 'position', read: 36, committed: 36, status: 'done', jump: null, skipped: null });
    await settle();
    expect(page.teleprompterStop).not.toHaveBeenCalled();
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
  });

  it('Record ends it first and starts the take from the real cursor, with a session of its own; the ghost is gone before the take', async () => {
    const page = renderPage();
    await ready();
    // The real cursor in the last paragraph, the ghost in the second.
    await act(async () => void fireEvent.click(document.querySelector<HTMLElement>('[data-paragraph="p3"] [data-word="1"]')!));
    await pressToggle();
    const coldFrom = page.teleprompterStart.mock.calls[0][0].startWord;
    expect(coldFrom).toBeGreaterThanOrEqual(26);
    await page.hear(heardAt(20));
    await waitFor(() => expect(ghost()?.closest('[data-paragraph]')?.getAttribute('data-paragraph')).toBe('p2'));
    const real = currentWord();
    skipStartGuard();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Record$/ })));
    await waitFor(() => expect(page.recordStart).toHaveBeenCalledTimes(1));
    expect(page.teleprompterStop).toHaveBeenCalledTimes(1);
    expect(page.teleprompterStart).toHaveBeenCalledTimes(2);
    const take = page.teleprompterStart.mock.calls[1][0];
    expect(take.coldRead).toBeUndefined();
    // The take's session starts where the real cursor is, never at the ghost's word.
    expect(take.startWord).toBe(coldFrom);
    expect(ghost()).toBeNull();
    expect(currentWord()).toBe(real);
    await waitFor(() => expect(screen.getByText('REC')).toBeTruthy());
    expect(screen.queryByText('Mic on · cold read')).toBeNull();
    expect(toggle().getAttribute('aria-disabled')).toBe('true');
    expect(toggle().getAttribute('title')).toBe('Not while recording. Stop the take first.');
  });

  it('Escape leaves without a question and ends it', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    await act(async () => void fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' }));
    await settle();
    expect(page.overlay.getSnapshot().dialogs).toHaveLength(0);
    expect(page.teleprompterStop).toHaveBeenCalled();
    expect(page.navigate).toHaveBeenCalled();
  });

  it('leaving the Booth any other way ends it', async () => {
    const page = renderPage();
    await ready();
    await pressToggle();
    page.view.unmount();
    expect(page.teleprompterStop).toHaveBeenCalled();
  });
});

describe('cold-read-in-the-jump-menu', () => {
  it('offers Start cold read, then Stop cold read, and is off during a take', async () => {
    const page = renderPage();
    await ready();
    expect(item('booth.cold-read')?.label).toBe('Start cold read');
    await act(async () => item('booth.cold-read')!.run());
    await settle();
    expect(page.teleprompterStart).toHaveBeenCalledWith(expect.objectContaining({ coldRead: true }));
    await waitFor(() => expect(item('booth.cold-read')?.label).toBe('Stop cold read'));
    skipStartGuard();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /^Record$/ })));
    await waitFor(() => expect(page.recordStart).toHaveBeenCalled());
    await waitFor(() => expect(item('booth.cold-read')?.disabledReason).toBe('Not while recording. Stop the take first.'));
  });
});
